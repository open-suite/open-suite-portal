import logging

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from app.clients.ocs import OCSClient
from app.core.config import settings
from app.core.http_clients import HTTPClient
from app.exceptions import CredentialError, ServiceUnavailableError, TokenExchangeError
from app.models.activity import FileActivityResponse
from app.token_exchange import get_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ocs", tags=["ocs"])


async def get_ocs_client(request: Request, http_client: HTTPClient) -> OCSClient:
    if not settings.ocs_enabled or not settings.OCS_URL:
        raise ServiceUnavailableError("OCS")

    token = await get_token(request, settings.OCS_AUDIENCE)

    return OCSClient(http_client, settings.OCS_URL, token, timeout=10.0)


@router.get("/activities", response_model=FileActivityResponse)
async def ocs_activities(
    request: Request,
    http_client: HTTPClient,
    limit: int = 50,
    since: int = 0,
    is_favorite: bool = False,
) -> FileActivityResponse:
    """Get file activities with cursor-based pagination. Use is_favorite=true to fetch favorite files instead."""
    client = await get_ocs_client(request, http_client)

    return await client.get_file_activities(limit=limit, since=since, is_favorite=is_favorite)


@router.get("/search", response_model=FileActivityResponse)
async def ocs_search(request: Request, http_client: HTTPClient, term: str) -> FileActivityResponse:
    """Get file search results from OCS service."""
    client = await get_ocs_client(request, http_client)

    return await client.search_files(term=term)


@router.get("/files/{file_id}/direct-edit", response_class=RedirectResponse)
async def ocs_direct_edit(request: Request, http_client: HTTPClient, file_id: int, path: str) -> RedirectResponse:
    """Mint Direct Editing capability only on this explicit browser navigation."""
    headers = {"Cache-Control": "no-store"}
    if not settings.OCS_URL:
        raise ServiceUnavailableError("OCS")
    fallback = f"{settings.OCS_URL.rstrip('/')}/f/{file_id}"

    # This endpoint is reachable manually, so enforce the same narrow eligibility
    # emitted by FileInfo rather than relying on widget rendering alone.
    if file_id <= 0 or not path.lower().endswith(".whiteboard"):
        return RedirectResponse(fallback, status_code=303, headers=headers)

    try:
        client = await get_ocs_client(request, http_client)
        direct_url = await client.open_direct_editing(file_id=file_id, path=path)
    except (CredentialError, TokenExchangeError, httpx.RequestError):
        direct_url = None

    return RedirectResponse(direct_url or fallback, status_code=303, headers=headers)
