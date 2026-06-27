"""Tests for CaldavClient Meet link extraction."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from app.clients.caldav import CaldavClient
from icalendar import Calendar as ICalendar
from icalendar import Event as IEvent

MEET_BASE = "https://meet.example.com"
BASE_URL = "https://nextcloud.example.com"


class FakeEvent:
    """Stand-in for a caldav.Event backed by a real icalendar object."""

    def __init__(self, cal: ICalendar) -> None:
        self._cal = cal
        self.save = MagicMock()

    @property
    def icalendar_instance(self) -> ICalendar:
        return self._cal


def _build_event(
    summary: str = "Standup",
    *,
    location: str | None = None,
    conference: str | None = None,
) -> FakeEvent:
    cal = ICalendar()
    future = datetime(2099, 1, 1, 10, 0, 0, tzinfo=UTC)
    vevent = IEvent()
    vevent.add("summary", summary)
    vevent.add("dtstart", future)
    vevent.add("dtend", future)
    if location is not None:
        vevent.add("location", location)
    if conference is not None:
        vevent.add("conference", conference, parameters={"VALUE": "URI", "FEATURE": "VIDEO"})
    cal.add_component(vevent)
    return FakeEvent(cal)


def _make_client(event: FakeEvent) -> CaldavClient:
    with patch("app.clients.caldav.DAVClient"):
        client = CaldavClient(base_url=BASE_URL, token="t")
    calendar = MagicMock()
    calendar.search.return_value = [event]
    principal = MagicMock()
    principal.calendars.return_value = [calendar]
    client.client.principal = MagicMock(return_value=principal)
    return client


class TestMeetLinkExtraction:
    def test_existing_conference_is_used(self) -> None:
        event = _build_event(conference=f"{MEET_BASE}/room-abc")
        result = _make_client(event).get_calendars(datetime(2099, 1, 1))
        event.save.assert_not_called()
        assert result[0].meet_url == f"{MEET_BASE}/room-abc"

    def test_existing_location_is_used(self) -> None:
        event = _build_event(location=f"{MEET_BASE}/room-xyz")
        result = _make_client(event).get_calendars(datetime(2099, 1, 1))
        event.save.assert_not_called()
        assert result[0].meet_url == f"{MEET_BASE}/room-xyz"

    def test_conference_wins_over_location(self) -> None:
        event = _build_event(
            conference=f"{MEET_BASE}/room-conference",
            location=f"{MEET_BASE}/room-location",
        )
        result = _make_client(event).get_calendars(datetime(2099, 1, 1))
        event.save.assert_not_called()
        assert result[0].meet_url == f"{MEET_BASE}/room-conference"

    def test_unrelated_location_is_ignored_without_provisioning(self) -> None:
        event = _build_event(location="In-person, room 2")
        result = _make_client(event).get_calendars(datetime(2099, 1, 1))
        event.save.assert_not_called()
        assert result[0].meet_url is None

    def test_empty_event_has_no_link_without_provisioning(self) -> None:
        event = _build_event()
        result = _make_client(event).get_calendars(datetime(2099, 1, 1))
        event.save.assert_not_called()
        assert result[0].meet_url is None
