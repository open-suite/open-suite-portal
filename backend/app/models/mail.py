from datetime import datetime

from pydantic import BaseModel


class Mailbox(BaseModel):
    id: str
    email: str
    name: str | None = None
    is_identity: bool = False
    count_unread_threads: int = 0


class MailThread(BaseModel):
    id: str
    subject: str | None = None
    snippet: str = ""
    sender_names: list[str] = []
    messaged_at: datetime | None = None


class MailWidgetData(BaseModel):
    mailbox_id: str | None = None
    mailbox_email: str | None = None
    unread_count: int = 0
    threads: list[MailThread] = []
