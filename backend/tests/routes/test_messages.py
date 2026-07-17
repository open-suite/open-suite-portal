from unittest.mock import AsyncMock, MagicMock, patch

from app.models.mail import MailThread, MailWidgetData
from fastapi.testclient import TestClient


class TestMessagesEndpoints:
    def test_widget_requires_auth(self, fresh_client: TestClient) -> None:
        response = fresh_client.get("/api/v1/messages/widget")
        assert response.status_code == 401

    @patch("app.routes.messages.settings.MESSAGES_URL", None)
    def test_widget_service_disabled(self, authenticated_client: TestClient) -> None:
        response = authenticated_client.get("/api/v1/messages/widget")
        assert response.status_code == 503

    @patch("app.routes.messages.settings.MESSAGES_URL", "https://messages.example.com")
    @patch("app.routes.messages.settings.MESSAGES_API_URL", "http://messages-backend:8000")
    @patch("app.routes.messages.settings.MESSAGES_AUDIENCE", "messages")
    @patch("app.routes.messages.get_token")
    @patch("app.routes.messages.MessagesClient")
    def test_widget_success(
        self,
        mock_messages_client: MagicMock,
        mock_get_token: AsyncMock,
        authenticated_client: TestClient,
    ) -> None:
        mock_get_token.return_value = "messages-token"
        client = AsyncMock()
        client.get_widget_data.return_value = MailWidgetData(
            mailbox_id="mailbox-1",
            mailbox_email="john@example.com",
            unread_count=4,
            threads=[
                MailThread(
                    id="thread-1",
                    subject="Quarterly review",
                    sender_names=["Jane Doe"],
                )
            ],
        )
        mock_messages_client.return_value = client

        response = authenticated_client.get("/api/v1/messages/widget?page_size=50")

        assert response.status_code == 200
        assert response.json()["mailbox_id"] == "mailbox-1"
        assert response.json()["unread_count"] == 4
        assert response.json()["threads"][0]["id"] == "thread-1"
        mock_get_token.assert_awaited_once()
        assert mock_messages_client.call_args.args[1] == "http://messages-backend:8000"
        client.get_widget_data.assert_awaited_once_with(page_size=10)
