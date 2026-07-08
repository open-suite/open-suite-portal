import hashlib
import logging
import time

from fastapi import Request

from app.core import session
from app.core.config import settings
from app.core.http_clients import http_client_dependency
from app.core.translate import _
from app.exceptions import CredentialError, TokenExchangeError

logger = logging.getLogger(__name__)

# In-process cache of exchanged tokens. Every portal widget (calendar, docs,
# meet, files) does a Keycloak token exchange per request; uncached that is a
# ~2s round trip on every dashboard load. Key by (audience, subject token) so a
# session refresh — which rotates the subject token — naturally misses and
# re-exchanges. Per-pod is fine: each replica caches independently, no shared
# state. Entries expire a safety margin before the exchanged token's own expiry.
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_CACHE_MARGIN_SECONDS = 30
_CACHE_MAX_TTL_SECONDS = 3600


def _cache_key(subject_token: str, audience: str) -> str:
    digest = hashlib.sha256(subject_token.encode("utf-8")).hexdigest()[:32]
    return f"{audience}:{digest}"


async def exchange_token(
    token: str,
    audience: str,
    subject_token_type: str = "urn:ietf:params:oauth:token-type:access_token",  # noqa: S107
    requested_token_type: str = "urn:ietf:params:oauth:token-type:access_token",  # noqa: S107
    scope: str = "openid",
) -> str | None:
    cache_key = _cache_key(token, audience)
    cached = _TOKEN_CACHE.get(cache_key)
    if cached is not None:
        cached_token, expiry = cached
        if time.time() < expiry:
            logger.debug(f"Token exchange cache hit for audience={audience}")
            return cached_token
        del _TOKEN_CACHE[cache_key]

    logger.info(f"Exchanging token for audience={audience}")

    data = {
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subject_token": token,
        "subject_token_type": subject_token_type,
        "requested_token_type": requested_token_type,
        "scope": scope,
        "audience": audience,
    }

    http_client = await http_client_dependency()
    response = await http_client.post(
        settings.OIDC_TOKEN_ENDPOINT,
        data=data,
        auth=(settings.OIDC_CLIENT_ID, settings.OIDC_CLIENT_SECRET or ""),
    )

    if response.status_code == 400:
        logger.error(f"Token exchange failed with 400 for audience={audience}")
        raise CredentialError("Unable to authenticate. Please try logging in again.")

    if response.status_code == 401:
        logger.warning(f"Token exchange failed with 401 for audience={audience}")
        raise CredentialError("Your session has expired. Please log in again.")

    if response.status_code == 403:
        logger.warning(f"Token exchange forbidden for audience={audience}")
        raise CredentialError("Access denied. You may not have permission to access this service.")

    # Raise for any other HTTP errors
    response.raise_for_status()

    try:
        token_data = response.json()
    except Exception:
        logger.exception(f"Token exchange returned non-JSON response for audience={audience}")
        msg = "Token exchange returned an invalid response. Please try logging in again."
        raise TokenExchangeError(msg) from Exception

    exchanged_token = token_data.get("access_token")

    if not exchanged_token or not isinstance(exchanged_token, str):
        logger.error(f"Token exchange response missing 'access_token' for audience={audience}")
        raise TokenExchangeError("Token exchange returned an invalid response. Please try logging in again.")

    # Cache until a safety margin before the exchanged token expires. Fall back
    # to a short TTL if the response omits (or over-reports) expires_in.
    try:
        expires_in = int(token_data.get("expires_in", 60))
    except (TypeError, ValueError):
        expires_in = 60
    ttl = min(max(expires_in - _CACHE_MARGIN_SECONDS, 0), _CACHE_MAX_TTL_SECONDS)
    if ttl > 0:
        now = time.time()
        # Rotated subject tokens leave stale keys behind; sweep expired entries
        # when the cache grows so it stays bounded without a background task.
        if len(_TOKEN_CACHE) > 512:
            for k in [k for k, (_, exp) in _TOKEN_CACHE.items() if exp <= now]:
                del _TOKEN_CACHE[k]
        _TOKEN_CACHE[cache_key] = (exchanged_token, now + ttl)

    logger.info(f"Successfully exchanged token for audience={audience}")

    return exchanged_token


async def get_token(request: Request, audience: str) -> str:
    # Get auth from session (already refreshed by get_current_user dependency)
    auth = await session.get_auth(request)
    if not auth:
        raise CredentialError(_("Not authenticated"))

    return await exchange_token(token=auth.access_token, audience=audience) or ""
