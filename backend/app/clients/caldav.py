# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportAttributeAccessIssue=false, reportUnknownArgumentType=false, reportAssignmentType=false, reportCallIssue=false, reportUnknownParameterType=false
import hashlib
import os
import time
from datetime import UTC, date, datetime, timedelta

from app.models.calendar import Calendar
from app.models.task import Task
from caldav import Calendar as DavCalendar
from caldav import DAVClient
from caldav.requests import HTTPBearerAuth
from icalendar import Component

# Number of days ahead (including today) to include in the upcoming-events window.
UPCOMING_DAYS = 3

# Cache of discovered calendar URLs per token. Every dashboard load re-ran
# CalDAV principal + calendar discovery (2 sequential requests to Nextcloud,
# ~220ms each) before doing any search. The calendar set is stable for a user,
# and the exchanged token is itself cached upstream (stable for its lifetime),
# so caching the discovered URLs keyed by token lets repeat loads skip
# discovery. A token refresh rotates the key and re-discovers.
_CALENDAR_URL_CACHE: dict[str, tuple[list[str], float]] = {}
_CALENDAR_CACHE_TTL_SECONDS = 300

# The dashboard refreshes every 30 seconds. Keep the fully parsed result just
# long enough for repeat navigation/reloads to avoid the sequential CalDAV
# searches, while ensuring the scheduled refresh goes back to Nextcloud.
_CALENDAR_RESULT_CACHE: dict[tuple[str, date], tuple[list[Calendar], float]] = {}
_CALENDAR_RESULT_CACHE_TTL_SECONDS = 20


def _token_cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]


class CaldavClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url
        self.token = token
        # Portal convention: the Meet host mirrors the Nextcloud host
        # (nextcloud.<domain> -> meet.<domain>). Events are joinable only when
        # the calendar data already contains a Meet link; this endpoint must stay
        # read-only so dashboard loads do not create rooms or write calendar data.
        self.meet_base = base_url.replace("://nextcloud.", "://meet.", 1)

        # HTTP_TLS_INSECURE=1: local/dev self-signed deploys; caldav uses its
        # own HTTP stack, separate from app.core.http_clients and authlib.
        ssl_verify = os.environ.get("HTTP_TLS_INSECURE") != "1"
        self.client = DAVClient(
            url=f"{base_url}/remote.php/dav", auth=HTTPBearerAuth(token), ssl_verify_cert=ssl_verify
        )

    def _calendars(self):  # noqa: ANN202 — caldav.Calendar is untyped (see file header)
        """Discovered calendars for this user, cached by token to skip the
        principal + calendar-list round trips on repeat dashboard loads."""
        key = _token_cache_key(self.token)
        cached = _CALENDAR_URL_CACHE.get(key)
        now = time.time()
        if cached is not None and now < cached[1]:
            return [DavCalendar(client=self.client, url=url) for url in cached[0]]

        calendars = self.client.principal().calendars()
        if len(_CALENDAR_URL_CACHE) > 512:
            for k in [k for k, (_, exp) in _CALENDAR_URL_CACHE.items() if exp <= now]:
                del _CALENDAR_URL_CACHE[k]
        _CALENDAR_URL_CACHE[key] = ([str(c.url) for c in calendars], now + _CALENDAR_CACHE_TTL_SECONDS)
        return calendars

    def _existing_meet_url(self, component: Component) -> str | None:
        """Return a Meet link already stored on the event, if any."""
        if not self.meet_base:
            return None

        conference = component.get("conference")
        if conference is not None:
            values = conference if isinstance(conference, list) else [conference]
            for value in values:
                candidate = str(value).strip()
                if candidate.startswith(self.meet_base):
                    return candidate

        location = component.get("location")
        if location is not None:
            candidate = str(location).strip()
            if candidate.startswith(self.meet_base):
                return candidate

        return None

    def get_calendars(self, check_date: date) -> list[Calendar]:
        normalized_date = check_date.date() if isinstance(check_date, datetime) else check_date
        cache_key = (_token_cache_key(self.token), normalized_date)
        now_timestamp = time.time()
        cached = _CALENDAR_RESULT_CACHE.get(cache_key)
        if cached is not None and now_timestamp < cached[1]:
            return cached[0]

        calendars = self._calendars()

        events_today: list[Calendar] = []

        now = datetime.now(UTC)
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
                    events_today.append(
                        Calendar(
                            title=str(summary),
                            start=start_value,
                            end=end_value,
                            meet_url=self._existing_meet_url(component),
                        )
                    )

        events_today.sort(key=lambda e: self._sort_key(e.start))
        if len(_CALENDAR_RESULT_CACHE) > 1024:
            for key in [key for key, (_, expires) in _CALENDAR_RESULT_CACHE.items() if expires <= now_timestamp]:
                del _CALENDAR_RESULT_CACHE[key]
        _CALENDAR_RESULT_CACHE[cache_key] = (
            events_today,
            now_timestamp + _CALENDAR_RESULT_CACHE_TTL_SECONDS,
        )
        return events_today

    @staticmethod
    def _is_past(value: datetime | date, now: datetime) -> bool:
        # datetime is a subclass of date, so check it first.
        if isinstance(value, datetime):
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            return value < now
        # All-day events carry a plain date; past only if before today.
        return value < now.date()

    @staticmethod
    def _sort_key(value: datetime | date) -> datetime:
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=UTC)
        return datetime.combine(value, datetime.min.time(), tzinfo=UTC)

    def get_tasks(self) -> list[Task]:
        calendars = self._calendars()

        tasks_list: list[Task] = []

        for calendar in calendars:
            for task in calendar.todos():
                task_instance = task.vobject_instance.vtodo
                task_summary: str = task_instance.summary.value
                task_start: datetime = task_instance.dtstart.value if hasattr(task_instance, "dtstart") else None
                task_due: datetime = task_instance.due.value if hasattr(task_instance, "due") else None
                tasks_list.append(Task(title=task_summary, start=task_start, end=task_due))

        return tasks_list
