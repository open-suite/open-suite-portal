from fastapi import APIRouter, Request

from app.clients.messages import MessagesClient
from app.core.config import settings
from app.core.http_clients import HTTPClient
from app.exceptions import ServiceUnavailableError
from app.models.mail import MailWidgetData
from app.token_exchange import get_token

router = APIRouter(prefix="/messages", tags=["messages"])


async def get_messages_client(request: Request, http_client: HTTPClient) -> MessagesClient:
    if not settings.messages_enabled or not settings.messages_api_url:
        raise ServiceUnavailableError("Mail")

    token = await get_token(request, settings.MESSAGES_AUDIENCE)
    return MessagesClient(http_client, settings.messages_api_url, token)


@router.get("/widget", response_model=MailWidgetData)
async def messages_get_widget(
    request: Request,
    http_client: HTTPClient,
    page_size: int = 3,
) -> MailWidgetData:
    client = await get_messages_client(request, http_client)
    return await client.get_widget_data(page_size=min(max(page_size, 1), 10))
