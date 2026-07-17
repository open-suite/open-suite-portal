from typing import Any
from urllib.parse import urlsplit

import httpx
from app.clients.base import BaseAPIClient
from app.models.mail import Mailbox, MailThread, MailWidgetData
from app.models.pagination import PaginatedResponse


class MessagesClient(BaseAPIClient):
    """Client for the La Suite Messages API."""

    service_name = "Mail"

    def __init__(
        self,
        http_client: httpx.AsyncClient,
        base_url: str,
        token: str,
        public_url: str,
        timeout: float | None = None,
    ) -> None:
        super().__init__(http_client, base_url, token, timeout)
        public_endpoint = urlsplit(public_url)
        self.public_host = public_endpoint.netloc
        self.public_scheme = public_endpoint.scheme

    def _auth_headers(self) -> dict[str, str]:
        """Identify the public endpoint while using the private service route."""
        return {
            **super()._auth_headers(),
            "Host": self.public_host,
            "X-Forwarded-Proto": self.public_scheme,
        }

    async def get_mailboxes(self, path: str = "api/v1.0/mailboxes/") -> list[Mailbox]:
        return await self._get_resource(path=path, model_type=list[Mailbox])

    async def get_unread_threads(
        self,
        mailbox_id: str,
        path: str = "api/v1.0/threads/",
        page_size: int = 3,
    ) -> PaginatedResponse[MailThread]:
        params: dict[str, Any] = {
            "mailbox_id": mailbox_id,
            "has_unread": 1,
            "has_active": 1,
            "page": 1,
            "page_size": max(1, page_size),
        }
        return await self._get_resource(
            path=path,
            model_type=PaginatedResponse[MailThread],
            params=params,
            response_parser=lambda data: {
                "count": data.get("count", 0),
                "results": data.get("results", []),
            },
        )

    async def get_widget_data(self, page_size: int = 3) -> MailWidgetData:
        mailboxes = await self.get_mailboxes()
        if not mailboxes:
            return MailWidgetData()

        mailbox = next((item for item in mailboxes if item.is_identity), mailboxes[0])
        unread = await self.get_unread_threads(mailbox.id, page_size=page_size)
        return MailWidgetData(
            mailbox_id=mailbox.id,
            mailbox_email=mailbox.email,
            unread_count=mailbox.count_unread_threads,
            threads=unread.results,
        )
