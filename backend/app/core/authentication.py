import asyncio
import logging
import time
from typing import Annotated

import httpx
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2AuthorizationCodeBearer

from app.core import session
from app.core.config import settings
from app.core.http_clients import http_client_dependency
from app.core.oauth import oauth
from app.core.redis import get_redis_client
from app.core.translate import _
from app.exceptions import CredentialError, TokenRefreshConflictError
from app.models.user import User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2AuthorizationCodeBearer(
    authorizationUrl="/api/v1/auth/login",
    tokenUrl=settings.OIDC_TOKEN_ENDPOINT,
    auto_error=False,
)


async def get_current_user(
    request: Request, _credentials: Annotated[OAuth2AuthorizationCodeBearer, Depends(oauth2_scheme)]
) -> User:
    """Get authenticated user, refreshing token if needed.
    _credentials is unused but required to trigger OAuth2 flow in the swagger UI.
    """

    auth = await session.get_auth(request)

    if not auth:
        raise CredentialError(_("Not authenticated"))

    if not auth.expires_at:
        logger.warning("Auth state missing expires_at, treating as expired")
        raise CredentialError(_("Session expired. Please log in again."))

    if _needs_refresh(auth.expires_at):
        await _refresh_single_flight(request, auth.refresh_token)

        # Re-read auth to get updated tokens
        auth = await session.get_auth(request)
        if not auth:
            raise CredentialError(_("Session expired. Please log in again."))
        if _needs_refresh(auth.expires_at):
            # The elected refresher finished without producing fresh tokens
            # (e.g. it lost a cross-replica race). Surface the retryable
            # conflict so the frontend re-issues the request.
            raise TokenRefreshConflictError("Refresh token already used")

    return auth.user


async def get_active_user(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Validate the portal token with the IdP during application bootstrap.

    Local JWT expiry is insufficient after an upstream session is revoked: the
    portal shell can otherwise render for several minutes while exchanged app
    tokens already fail. This dependency is intentionally used by /config only,
    so opening/reloading the app performs one authoritative check without
    polling Keycloak on every widget request.
    """
    endpoint = settings.OIDC_INTROSPECTION_ENDPOINT
    if not endpoint:
        logger.warning("OIDC_INTROSPECTION_ENDPOINT is unset; skipping active-session bootstrap check")
        return current_user

    auth = await session.get_auth(request)
    if not auth:
        raise CredentialError(_("Not authenticated"))

    try:
        client = await http_client_dependency()
        response = await client.post(
            endpoint,
            data={"token": auth.access_token, "token_type_hint": "access_token"},
            auth=(settings.OIDC_CLIENT_ID, settings.OIDC_CLIENT_SECRET or ""),
        )
        response.raise_for_status()
        active = response.json().get("active") is True
    except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
        logger.exception("OIDC token introspection failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=_("Authentication service is temporarily unavailable"),
        ) from exc

    if not active:
        logger.info("OIDC introspection reports an inactive portal session")
        await session.clear_auth(request)
        raise CredentialError(_("Session expired. Please log in again."))

    return current_user


def _needs_refresh(expires_at: int | None) -> bool:
    """Check if token needs refresh (expired or expiring within 60s)."""
    if not expires_at:
        return False
    return int(time.time()) >= expires_at - 60


_REFRESH_LOCK_TTL_SECONDS = 10
_REFRESH_WAIT_INTERVAL_SECONDS = 0.1
_REFRESH_WAIT_ATTEMPTS = 50


async def _refresh_single_flight(request: Request, refresh_token: str | None) -> None:
    """Refresh the session's tokens at most once across concurrent requests.

    Keycloak rotates refresh tokens (revokeRefreshToken): presenting the same
    token a second time trips reuse detection, which invalidates the whole SSO
    session and logs the user out of every suite app at once. Parallel widget
    requests therefore elect one refresher via a Redis lock; the rest wait for
    its result instead of racing the token endpoint.
    """
    session_id = request.session.get("session_id")
    if not session_id:
        # Without a session key there is nothing to serialize on.
        await _refresh_token(request, refresh_token)
        return

    redis_client = get_redis_client()
    lock_key = f"refresh-lock:{session_id}"
    acquired = await redis_client.set(lock_key, "1", nx=True, ex=_REFRESH_LOCK_TTL_SECONDS)
    if acquired:
        try:
            await _refresh_token(request, refresh_token)
        finally:
            await redis_client.delete(lock_key)
        return

    for _attempt in range(_REFRESH_WAIT_ATTEMPTS):
        await asyncio.sleep(_REFRESH_WAIT_INTERVAL_SECONDS)
        if not await redis_client.get(lock_key):
            return
    logger.warning("Timed out waiting for a concurrent token refresh to finish")
    raise TokenRefreshConflictError("Refresh token already used")


async def _refresh_token(request: Request, refresh_token: str | None) -> None:
    """Perform OAuth token refresh and update the session."""
    if not refresh_token:
        logger.warning("No refresh token available")
        raise CredentialError(_("Session expired. Please log in again."))

    try:
        logger.info("Refreshing access token via OAuth")
        token = await oauth.oidc.fetch_access_token(  # type: ignore[reportUnknownMemberType]
            grant_type="refresh_token",
            refresh_token=refresh_token,
        )

        logger.info("Access token refreshed successfully")

        # Update session with new tokens
        await session.update_tokens(
            request,
            access_token=str(token["access_token"]),  # type: ignore[reportUnknownArgumentType]
            expires_at=int(token["expires_at"]),  # type: ignore[reportUnknownArgumentType]
            refresh_token=token.get("refresh_token"),  # type: ignore[reportUnknownMemberType, reportUnknownArgumentType]
        )

        logger.info("Refreshed access token updated successfully")

    except Exception as e:
        error_str = str(e).lower()

        # Check if this is a "refresh token reuse" error from Keycloak
        # This happens when concurrent requests try to refresh the same token.
        if "maximum allowed refresh token reuse exceeded" in error_str:
            logger.warning(f"Refresh token conflict detected. Token already used by concurrent request: {e}")
            raise TokenRefreshConflictError("Refresh token already used") from e

        # Check if this is an expired/inactive token (expected session expiration)
        if "token is not active" in error_str or "token expired" in error_str:
            logger.info(f"Session expired - token no longer valid: {e}")
            await session.clear_auth(request)
            raise CredentialError(_("Session expired. Please log in again.")) from e

        # Other unexpected OAuth errors (corrupted session, network issues, etc.)
        logger.exception("Unexpected OAuth token refresh error")
        await session.clear_auth(request)
        raise CredentialError(_("Session expired. Please log in again.")) from e
