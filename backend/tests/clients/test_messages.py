from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from app.clients.messages import MessagesClient


class TestMessagesClient:
    @pytest.fixture
    def mock_http_client(self) -> AsyncMock:
        return AsyncMock(spec=httpx.AsyncClient)

    @pytest.fixture
    def client(self, mock_http_client: AsyncMock) -> MessagesClient:
        return MessagesClient(
            http_client=mock_http_client,
            base_url="https://messages.example.com/",
            token="test-token",
        )

    async def test_get_widget_data_uses_identity_mailbox(
        self,
        client: MessagesClient,
        mock_http_client: AsyncMock,
    ) -> None:
        mailboxes_response = Mock()
        mailboxes_response.status_code = 200
        mailboxes_response.headers = {}
        mailboxes_response.json.return_value = [
            {
                "id": "shared-id",
                "email": "team@example.com",
                "name": "Team",
                "is_identity": False,
                "count_unread_threads": 9,
            },
            {
                "id": "personal-id",
                "email": "john@example.com",
                "name": "John",
                "is_identity": True,
                "count_unread_threads": 2,
            },
        ]
        threads_response = Mock()
        threads_response.status_code = 200
        threads_response.headers = {}
        threads_response.json.return_value = {
            "count": 2,
            "results": [
                {
                    "id": "thread-1",
                    "subject": "Quarterly review",
                    "snippet": "Please review",
                    "sender_names": ["Jane Doe"],
                    "messaged_at": "2026-07-16T12:00:00Z",
                }
            ],
        }
        mock_http_client.get.side_effect = [mailboxes_response, threads_response]

        result = await client.get_widget_data(page_size=3)

        assert result.mailbox_id == "personal-id"
        assert result.mailbox_email == "john@example.com"
        assert result.unread_count == 2
        assert len(result.threads) == 1
        assert result.threads[0].subject == "Quarterly review"

        second_call = mock_http_client.get.call_args_list[1]
        assert second_call.args[0] == "https://messages.example.com/api/v1.0/threads/"
        assert second_call.kwargs["params"] == {
            "mailbox_id": "personal-id",
            "has_unread": 1,
            "has_active": 1,
            "page": 1,
            "page_size": 3,
        }

    async def test_get_widget_data_without_mailbox(
        self,
        client: MessagesClient,
        mock_http_client: AsyncMock,
    ) -> None:
        response = Mock()
        response.status_code = 200
        response.headers = {}
        response.json.return_value = []
        mock_http_client.get.return_value = response

        result = await client.get_widget_data()

        assert result.mailbox_id is None
        assert result.unread_count == 0
        assert result.threads == []
        mock_http_client.get.assert_awaited_once()
