# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportAttributeAccessIssue=false, reportUnknownArgumentType=false, reportAssignmentType=false, reportCallIssue=false
from datetime import date, datetime, timedelta, timezone

import httpx

from app.models.calendar import Calendar
from app.models.task import Task
from caldav import DAVClient
from caldav.requests import HTTPBearerAuth

# Number of days ahead (including today) to include in the upcoming-events window.
UPCOMING_DAYS = 3


class CaldavClient:
    def __init__(self, base_url: str, token: str, meet_token: str | None = None) -> None:
        self.base_url = base_url
        self.token = token
        # Portal convention: the Meet host mirrors the Nextcloud host
        # (nextcloud.<domain> -> meet.<domain>). An event is "joinable" when its
        # location is a URL on that host; if it has none and we have a Meet
        # token, we auto-provision a room so every event gets a Join link.
        self.meet_base = base_url.replace("://nextcloud.", "://meet.", 1)
        self.meet_token = meet_token
        self._room_cache: dict[str, str | None] = {}

        self.client = DAVClient(url=f"{base_url}/remote.php/dav", auth=HTTPBearerAuth(token))

    def _ensure_meet_url(self, name: str) -> str | None:
        """Create (or look up) a Meet room for an event name and return its URL.
        Idempotent: La Suite 400s if the room exists, so fall back to looking it
        up by name. Cached per request so same-named events share one room."""
        if not self.meet_token or self.meet_base == self.base_url:
            return None
        if name in self._room_cache:
            return self._room_cache[name]
        url = None
        headers = {"Authorization": f"Bearer {self.meet_token}"}
        api = f"{self.meet_base}/api/v1.0/rooms/"
        try:
            with httpx.Client(timeout=10) as c:
                r = c.post(api, headers=headers, json={"name": name})
                slug = r.json().get("slug") if r.status_code in (200, 201) else None
                if not isinstance(slug, str) or not slug:
                    lr = c.get(api, headers=headers, params={"page_size": 200})
                    data = lr.json() if lr.status_code == 200 else {}
                    rooms = data.get("results", []) if isinstance(data, dict) else (data or [])
                    slug = next((x.get("slug") for x in rooms if x.get("name") == name), None)
                if isinstance(slug, str) and slug:
                    url = f"{self.meet_base}/{slug}"
        except Exception:
            url = None
        self._room_cache[name] = url
        return url

    def get_calendars(self, check_date: date) -> list[Calendar | None]:
        principal = self.client.principal()
        calendars = principal.calendars()

        events_today: list[Calendar | None] = []

        now = datetime.now(timezone.utc)
        window_start = datetime.combine(check_date, datetime.min.time())
        window_end = datetime.combine(check_date + timedelta(days=UPCOMING_DAYS), datetime.max.time())

        for calendar in calendars:
            # expand=False: Nextcloud's CalDAV does not expand recurrences over a
            # multi-day range (returns nothing), so we fetch master objects and
            # parse the icalendar component directly.
            events = calendar.search(start=window_start, end=window_end, event=True, expand=False)
            for event in events:
                for component in event.icalendar_instance.walk("vevent"):
                    summary = component.get("summary")
                    dtstart = component.get("dtstart")
                    dtend = component.get("dtend")
                    if summary is None or dtstart is None:
                        continue
                    start_value = dtstart.dt
                    end_value = dtend.dt if dtend is not None else start_value
                    # Skip events that have already finished (incl. earlier today).
                    if self._is_past(end_value, now):
                        continue
                    location = component.get("location")
                    meet_url = None
                    if location is not None:
                        loc = str(location).strip()
                        if self.meet_base and loc.startswith(self.meet_base):
                            meet_url = loc
                    # No Meet link on the event yet — auto-provision one so it's
                    # joinable from the widget.
                    if meet_url is None:
                        meet_url = self._ensure_meet_url(str(summary))
                    events_today.append(
                        Calendar(
                            title=str(summary),
                            start=start_value,
                            end=end_value,
                            meet_url=meet_url,
                        )
                    )

        events_today.sort(key=lambda e: self._sort_key(e.start))
        return events_today

    @staticmethod
    def _is_past(value: datetime | date, now: datetime) -> bool:
        # datetime is a subclass of date, so check it first.
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value < now
        # All-day events carry a plain date; past only if before today.
        return value < now.date()

    @staticmethod
    def _sort_key(value: datetime | date) -> datetime:
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)

    def get_tasks(self) -> list[Task]:
        principal = self.client.principal()
        calendars = principal.calendars()

        tasks_list: list[Task] = []

        for calendar in calendars:
            for task in calendar.todos():
                task_instance = task.vobject_instance.vtodo
                task_summary: str = task_instance.summary.value
                task_start: datetime = task_instance.dtstart.value if hasattr(task_instance, "dtstart") else None
                task_due: datetime = task_instance.due.value if hasattr(task_instance, "due") else None
                tasks_list.append(Task(title=task_summary, start=task_start, end=task_due))

        return tasks_list
