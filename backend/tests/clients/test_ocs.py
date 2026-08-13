"""Tests for OCS client."""

import asyncio
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from app.clients.ocs import OCSClient
from app.exceptions import ExternalServiceError
from app.models.activity import Activity, FileActivityResponse
from app.models.project import DeckBoard, DeckCard, DeckStack


def create_mock_response(
    status_code: int = 200,
    json_data: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> Mock:
    """Create a mock HTTP response with headers."""
    mock_response = Mock()
    mock_response.status_code = status_code
    mock_response.json.return_value = json_data or {}
    mock_response.headers = headers or {}
    return mock_response


class TestOCSClient:
    """Tests for OCSClient class."""

    @pytest.fixture
    def mock_http_client(self) -> AsyncMock:
        """Create a mock HTTP client."""
        return AsyncMock(spec=httpx.AsyncClient)

    @pytest.fixture
    def client(self, mock_http_client: AsyncMock) -> OCSClient:
        """Create an OCSClient instance for testing."""
        return OCSClient(
            http_client=mock_http_client,
            base_url="https://nextcloud.example.com",
            token="test-token",
        )

    def test_init(self, mock_http_client: AsyncMock, client: OCSClient) -> None:
        """Test OCSClient initialization."""
        assert client.client is mock_http_client
        assert client.base_url == "https://nextcloud.example.com"
        assert client.token == "test-token"
        assert client.timeout is None

    def test_init_with_custom_timeout(self, mock_http_client: AsyncMock) -> None:
        """Test OCSClient initialization with custom timeout."""
        client = OCSClient(
            http_client=mock_http_client,
            base_url="https://nextcloud.example.com",
            token="test-token",
            timeout=10.0,
        )
        assert client.timeout == 10.0

    def test_init_timeout_is_none_by_default(self, client: OCSClient) -> None:
        """Test that timeout defaults to None."""
        assert client.timeout is None

    async def test_get_projects_filters_archived_and_counts_cards(
        self, client: OCSClient, mock_http_client: AsyncMock
    ) -> None:
        boards_response = Mock(status_code=200, headers={})
        boards_response.json.return_value = [
            {"id": 12, "title": "Website", "color": "0082c9", "archived": False, "owner": "ignored"},
            {"id": 13, "title": "Old board", "color": "aaaaaa", "archived": True},
        ]
        stacks_response = Mock(status_code=200, headers={})
        stacks_response.json.return_value = [
            {"id": 1, "title": "Doing", "cards": [{"id": 1}, {"id": 2}]},
            {"id": 2, "title": "Done", "isDoneColumn": True, "cards": [{"id": 3}]},
            {"id": 3, "title": "Empty", "isDoneColumn": False},
        ]
        mock_http_client.get.side_effect = [boards_response, stacks_response]

        result = await client.get_projects()

        assert [project.model_dump() for project in result] == [
            {
                "id": 12,
                "title": "Website",
                "color": "0082c9",
                "card_count": 3,
                "completed_count": 1,
                "link": "https://nextcloud.example.com/apps/deck/board/12",
            }
        ]
        assert [call.args[0] for call in mock_http_client.get.call_args_list] == [
            "https://nextcloud.example.com/index.php/apps/deck/api/v1.0/boards",
            "https://nextcloud.example.com/index.php/apps/deck/api/v1.0/boards/12/stacks",
        ]
        assert all(
            call.kwargs["headers"]["Authorization"] == "Bearer test-token"
            for call in mock_http_client.get.call_args_list
        )

    async def test_get_projects_bounds_parallel_stack_reads_and_preserves_board_order(self, client: OCSClient) -> None:
        boards = [DeckBoard(id=board_id, title=f"Board {board_id}") for board_id in range(1, 7)]
        release_reads = asyncio.Event()
        four_reads_started = asyncio.Event()
        active_reads = 0
        max_active_reads = 0
        started_reads = 0

        async def get_resource(path: str, model_type: object) -> list[DeckBoard] | list[DeckStack]:
            nonlocal active_reads, max_active_reads, started_reads
            if path.endswith("/boards"):
                return boards

            active_reads += 1
            started_reads += 1
            max_active_reads = max(max_active_reads, active_reads)
            if started_reads == client.project_stack_concurrency:
                four_reads_started.set()
            try:
                await release_reads.wait()
                board_id = int(path.split("/")[-2])
                return [DeckStack(cards=[DeckCard(id=board_id)])]
            finally:
                active_reads -= 1

        client._get_resource = AsyncMock(side_effect=get_resource)
        projects_task = asyncio.create_task(client.get_projects())

        await asyncio.wait_for(four_reads_started.wait(), timeout=1)
        await asyncio.sleep(0)
        assert started_reads == client.project_stack_concurrency
        release_reads.set()
        projects = await projects_task

        assert max_active_reads == client.project_stack_concurrency
        assert [project.id for project in projects] == [1, 2, 3, 4, 5, 6]

    def test_init_strips_trailing_slash(self, mock_http_client: AsyncMock) -> None:
        """Test that trailing slash is stripped from base_url."""
        client = OCSClient(
            http_client=mock_http_client,
            base_url="https://nextcloud.example.com/",
            token="test-token",
        )
        assert client.base_url == "https://nextcloud.example.com"

    async def test_search_files_success(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test successful file search."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": {
                        "entries": [
                            {
                                "title": "report.docx",
                                "subline": "in Documents",
                                "resourceUrl": "https://nextcloud.example.com/f/12345",
                                "icon": "text-plain",
                                "thumbnailUrl": None,
                                "attributes": {
                                    "fileId": "12345",
                                    "path": "/Documents/report.docx",
                                },
                            }
                        ]
                    }
                }
            },
        )
        mock_http_client.get.return_value = mock_response

        # Test
        result = await client.search_files(term="test")

        # Assertions
        assert isinstance(result, FileActivityResponse)
        assert len(result.results) == 1
        file = result.results[0].files[0]
        assert file.id == 12345
        assert file.name == "report.docx"
        assert file.path == "Documents/report.docx"
        assert file.link == "https://nextcloud.example.com/f/12345"
        assert result.last_given is None

        # Verify HTTP call
        mock_http_client.get.assert_called_once()
        call_args = mock_http_client.get.call_args
        expected_url = "https://nextcloud.example.com/ocs/v2.php/search/providers/files/search"
        assert call_args[0][0] == expected_url

        expected_headers = {
            "Authorization": "Bearer test-token",
            "OCS-APIRequest": "true",
            "Accept": "application/json",
        }
        assert call_args[1]["headers"] == expected_headers
        assert call_args[1]["params"] == {"format": "json", "term": "test"}

    async def test_search_files_with_custom_path(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test file search with custom path."""
        mock_response = create_mock_response(status_code=200, json_data={"ocs": {"data": {"entries": []}}})
        mock_http_client.get.return_value = mock_response

        await client.search_files(term="test", path="custom/search/path")

        call_args = mock_http_client.get.call_args
        expected_url = "https://nextcloud.example.com/custom/search/path"
        assert call_args[0][0] == expected_url

    async def test_search_files_strips_leading_slash(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test that leading slash is stripped from path in search_files."""
        mock_response = create_mock_response(status_code=200, json_data={"ocs": {"data": {"entries": []}}})
        mock_http_client.get.return_value = mock_response

        await client.search_files(term="test", path="/ocs/v2.php/search/providers/files/search")

        call_args = mock_http_client.get.call_args
        expected_url = "https://nextcloud.example.com/ocs/v2.php/search/providers/files/search"
        assert call_args[0][0] == expected_url

    async def test_search_files_error_response(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test file search with error response."""
        mock_response = create_mock_response(status_code=500)
        mock_http_client.get.return_value = mock_response

        with pytest.raises(ExternalServiceError) as exc_info:
            await client.search_files(term="test")

        assert "OCS" in str(exc_info.value)
        assert "Failed to fetch ocs/v2.php/search/providers/files/search (status 500)" in str(exc_info.value)

    async def test_search_files_multiple_results(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test file search with multiple results."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": {
                        "entries": [
                            {
                                "title": "file1.txt",
                                "subline": "/Documents/file1.txt",
                                "resourceUrl": "https://nextcloud.example.com/f/12345",
                                "icon": "text-plain",
                                "thumbnailUrl": None,
                                "attributes": {},
                            },
                            {
                                "title": "file2.txt",
                                "subline": "/Documents/file2.txt",
                                "resourceUrl": "https://nextcloud.example.com/f/67890",
                                "icon": "text-plain",
                                "thumbnailUrl": None,
                                "attributes": {},
                            },
                        ]
                    }
                }
            },
        )
        mock_http_client.get.return_value = mock_response

        result = await client.search_files(term="test")

        assert len(result.results) == 2
        assert result.results[0].files[0].name == "file1.txt"
        assert result.results[0].files[0].id is None
        assert result.results[0].files[0].path is None
        assert result.results[0].files[0].link == "https://nextcloud.example.com/f/12345"
        assert result.results[1].files[0].name == "file2.txt"
        assert result.results[1].files[0].link == "https://nextcloud.example.com/f/67890"

    async def test_search_files_no_results(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test file search when no results found."""
        mock_response = create_mock_response(status_code=200, json_data={"ocs": {"data": {"entries": []}}})
        mock_http_client.get.return_value = mock_response

        result = await client.search_files(term="nonexistent")

        assert isinstance(result, FileActivityResponse)
        assert result.results == []
        assert result.last_given is None

    async def test_favorite_file_keeps_id_path_and_stable_link(self, mock_http_client: AsyncMock) -> None:
        client = OCSClient(
            http_client=mock_http_client,
            base_url="https://nextcloud.example.com/cloud",
            token="test-token",
        )
        mock_http_client.get.return_value = create_mock_response(
            json_data={"ocs": {"data": {"id": "alice@example.com"}}}
        )
        report_response = create_mock_response(status_code=207)
        report_response.text = """<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
          <d:response>
            <d:href>/cloud/remote.php/dav/files/alice%40example.com/Boards/Project%20Plan.whiteboard</d:href>
            <d:propstat>
              <d:prop>
                <d:displayname>Project Plan.whiteboard</d:displayname>
                <oc:fileid>123</oc:fileid>
              </d:prop>
              <d:status>HTTP/1.1 200 OK</d:status>
            </d:propstat>
          </d:response>
        </d:multistatus>"""
        mock_http_client.request.return_value = report_response

        result = await client.get_file_activities(is_favorite=True)

        favorite = result.results[0].files[0]
        assert favorite.path == "Boards/Project Plan.whiteboard"
        assert favorite.link == "https://nextcloud.example.com/cloud/f/123"

    async def test_default_timeout_uses_client_default(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test that default timeout (None) does not pass timeout kwarg, preserving client default."""
        mock_response = create_mock_response(status_code=200, json_data={"ocs": {"data": {"entries": []}}})
        mock_http_client.get.return_value = mock_response

        await client.search_files(term="test")

        call_kwargs = mock_http_client.get.call_args[1]
        assert "timeout" not in call_kwargs

    async def test_custom_timeout_passes_value(self, mock_http_client: AsyncMock) -> None:
        """Test that custom timeout passes timeout value to client.get()."""
        client = OCSClient(
            http_client=mock_http_client,
            base_url="https://nextcloud.example.com",
            token="test-token",
            timeout=10.0,
        )
        mock_response = create_mock_response(status_code=200, json_data={"ocs": {"data": {"entries": []}}})
        mock_http_client.get.return_value = mock_response

        await client.search_files(term="test")

        call_kwargs = mock_http_client.get.call_args[1]
        assert call_kwargs["timeout"] == 10.0

    async def test_timeout_exception_is_reraised(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test that httpx.TimeoutException is re-raised, not wrapped as ExternalServiceError."""
        mock_http_client.get.side_effect = httpx.ReadTimeout("read timed out")

        with pytest.raises(httpx.TimeoutException):
            await client.search_files(term="test")

    async def test_get_file_activities_single_file(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test file activities with a single file per activity."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        {
                            "activity_id": 2282,
                            "app": "files",
                            "type": "file_changed",
                            "user": "testuser",
                            "subject": "You changed test.docx",
                            "message": None,
                            "link": "https://nextcloud.example.com/f/31826",
                            "object_type": "files",
                            "object_id": 31826,
                            "object_name": "/test.docx",
                            "datetime": "2026-01-20T13:15:50+00:00",
                        }
                    ]
                }
            },
            headers={"x-activity-last-given": "2281"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=5)

        assert len(result.results) == 1
        assert result.last_given == 2281
        activity = result.results[0]
        assert activity.activity_id == 2282
        assert activity.action == "file_changed"
        assert len(activity.files) == 1
        assert activity.files[0].id == 31826
        assert activity.files[0].name == "test.docx"
        assert activity.files[0].path == "test.docx"

    async def test_get_file_activities_multi_file_with_subject_rich(
        self, client: OCSClient, mock_http_client: AsyncMock
    ) -> None:
        """Test file activities with multiple files using subject_rich."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        {
                            "activity_id": 2217,
                            "app": "files",
                            "type": "file_created",
                            "user": "testuser",
                            "subject": "You created Drive.png, Docs.png and 3 more",
                            "message": None,
                            "link": "https://nextcloud.example.com/f/33485",
                            "object_type": "files",
                            "object_id": 33485,
                            "object_name": "/Drive.png",
                            "datetime": "2026-01-13T16:07:43+00:00",
                            "subject_rich": [
                                "You created {file1}, {file2} and {count} more",
                                {
                                    "file1": {
                                        "type": "file",
                                        "id": "33485",
                                        "name": "Drive.png",
                                        "path": "Drive.png",
                                        "link": "https://nextcloud.example.com/f/33485",
                                    },
                                    "file2": {
                                        "type": "file",
                                        "id": "33482",
                                        "name": "Docs.png",
                                        "path": "Docs.png",
                                        "link": "https://nextcloud.example.com/f/33482",
                                    },
                                    "file3": {
                                        "type": "file",
                                        "id": "33483",
                                        "name": "element.png",
                                        "path": "element.png",
                                        "link": "https://nextcloud.example.com/f/33483",
                                    },
                                    "count": {"type": "highlight", "id": "3", "name": "3"},
                                },
                            ],
                        }
                    ]
                }
            },
            headers={"x-activity-last-given": "2199"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=5)

        assert len(result.results) == 1
        activity = result.results[0]
        assert activity.activity_id == 2217
        assert activity.action == "file_created"
        # Should have 3 files from subject_rich (only type=file entries)
        assert len(activity.files) == 3
        assert activity.files[0].id == 33485
        assert activity.files[0].name == "Drive.png"
        assert activity.files[0].link == "https://nextcloud.example.com/f/33485"
        assert activity.files[1].id == 33482
        assert activity.files[1].name == "Docs.png"
        assert activity.files[2].id == 33483
        assert activity.files[2].name == "element.png"

    async def test_get_file_activities_multi_file_with_objects_dict(
        self, client: OCSClient, mock_http_client: AsyncMock
    ) -> None:
        """Test file activities with multiple files using objects dict fallback."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        {
                            "activity_id": 2217,
                            "app": "files",
                            "type": "file_created",
                            "user": "testuser",
                            "subject": "You created multiple files",
                            "message": None,
                            "link": "https://nextcloud.example.com/f/33485",
                            "object_type": "files",
                            "object_id": 33485,
                            "object_name": "/Drive.png",
                            "datetime": "2026-01-13T16:07:43+00:00",
                            "objects": {
                                "33485": "/Drive.png",
                                "33482": "/Docs.png",
                                "33483": "/element.png",
                            },
                        }
                    ]
                }
            },
            headers={"x-activity-last-given": "2199"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=5)

        assert len(result.results) == 1
        activity = result.results[0]
        assert len(activity.files) == 3
        # Files from objects dict should have no links
        file_ids = {f.id for f in activity.files}
        assert file_ids == {33485, 33482, 33483}
        for f in activity.files:
            assert f.link is None

    async def test_get_file_activities_sharing_included(self, client: OCSClient, mock_http_client: AsyncMock) -> None:
        """Test that sharing activities are included (object_type=files filter)."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        {
                            "activity_id": 2191,
                            "app": "files_sharing",
                            "type": "shared",
                            "user": "testuser",
                            "subject": "You shared document.docx",
                            "message": None,
                            "link": "https://nextcloud.example.com/f/22137",
                            "object_type": "files",
                            "object_id": 22137,
                            "object_name": "/document.docx",
                            "datetime": "2026-01-07T15:15:54+00:00",
                        }
                    ]
                }
            },
            headers={"x-activity-last-given": "2190"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=5)

        # Sharing activity should be included (app=files_sharing but object_type=files)
        assert len(result.results) == 1
        activity = result.results[0]
        assert activity.activity_id == 2191
        assert activity.action == "shared"
        assert len(activity.files) == 1
        assert activity.files[0].name == "document.docx"

    async def test_get_file_activities_filters_non_file_object_types(
        self, client: OCSClient, mock_http_client: AsyncMock
    ) -> None:
        """Test that activities with non-file object_type are filtered out."""
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        {
                            "activity_id": 2282,
                            "app": "files",
                            "type": "file_changed",
                            "user": "testuser",
                            "subject": "You changed test.docx",
                            "message": None,
                            "link": "https://nextcloud.example.com/f/31826",
                            "object_type": "files",
                            "object_id": 31826,
                            "object_name": "/test.docx",
                            "datetime": "2026-01-20T13:15:50+00:00",
                        },
                        {
                            "activity_id": 2283,
                            "app": "comments",
                            "type": "comment_added",
                            "user": "testuser",
                            "subject": "You commented",
                            "message": None,
                            "link": "https://nextcloud.example.com/comment/123",
                            "object_type": "comment",
                            "object_id": 123,
                            "object_name": "comment",
                            "datetime": "2026-01-20T13:16:00+00:00",
                        },
                    ]
                }
            },
            headers={"x-activity-last-given": "2281"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=5)

        # Only file activity should be included
        assert len(result.results) == 1
        assert result.results[0].activity_id == 2282

    async def test_get_file_activities_hides_deleted_and_non_file_events(
        self, client: OCSClient, mock_http_client: AsyncMock
    ) -> None:
        """Deleted IDs and metadata-only events never reach widget rows."""

        def activity(
            activity_id: int,
            action: str,
            file_id: int,
            name: str,
            path: str | None = None,
        ) -> dict[str, object]:
            file_path = path or name
            return {
                "activity_id": activity_id,
                "app": "files",
                "type": action,
                "user": "testuser",
                "subject": f"Activity for {name}",
                "message": None,
                "link": f"https://nextcloud.example.com/f/{file_id}",
                "object_type": "files",
                "object_id": file_id,
                "object_name": f"/{file_path}",
                "datetime": "2026-07-22T13:15:50+00:00",
                "subject_rich": [
                    "Activity for {file}",
                    {
                        "file": {
                            "type": "file",
                            "id": str(file_id),
                            "name": name,
                            "path": file_path,
                            "link": f"https://nextcloud.example.com/f/{file_id}",
                        }
                    },
                ],
            }

        grouped_deletion = activity(104, "file_deleted", 43, "deleted.docx")
        grouped_deletion["objects"] = {
            "43": "/deleted.docx",
            "44": "/omitted-from-rich-summary.docx",
        }
        mock_response = create_mock_response(
            status_code=200,
            json_data={
                "ocs": {
                    "data": [
                        activity(105, "file_deleted", 41, "deleted-folder"),
                        grouped_deletion,
                        activity(103, "unfavorite", 52, "preference-only.docx"),
                        activity(102, "file_changed", 94, "Q3 planning notes.docx"),
                        activity(101, "file_created", 42, "child.docx", "deleted-folder/child.docx"),
                        activity(100, "file_created", 43, "deleted.docx"),
                        activity(99, "file_created", 44, "omitted-from-rich-summary.docx"),
                    ]
                }
            },
            headers={"x-activity-last-given": "98"},
        )
        mock_http_client.get.return_value = mock_response

        result = await client.get_file_activities(limit=50)

        assert result.last_given == 98
        assert len(result.results) == 1
        assert result.results[0].activity_id == 102
        assert len(result.results[0].files) == 1
        current_file = result.results[0].files[0]
        assert current_file.id == 94
        assert current_file.name == "Q3 planning notes.docx"
        assert current_file.link == "https://nextcloud.example.com/f/94"
        mock_http_client.post.assert_not_awaited()


class TestActivityExtractFiles:
    """Tests for Activity.extract_files() method."""

    def test_extract_files_from_subject_rich(self) -> None:
        """Test extracting files from subject_rich field."""
        activity = Activity(
            activity_id=2217,
            app="files",
            type="file_created",
            user="testuser",
            subject="You created files",
            message=None,
            link="https://nextcloud.example.com/f/33485",
            object_type="files",
            object_id=33485,
            object_name="/Drive.png",
            datetime=datetime(2026, 1, 13, 16, 7, 43),
            subject_rich=[
                "You created {file1}, {file2}",
                {
                    "file1": {
                        "type": "file",
                        "id": "33485",
                        "name": "Drive.png",
                        "path": "Drive.png",
                        "link": "https://nextcloud.example.com/f/33485",
                    },
                    "file2": {
                        "type": "file",
                        "id": "33482",
                        "name": "Docs.png",
                        "path": "Docs.png",
                        "link": "https://nextcloud.example.com/f/33482",
                    },
                },
            ],
        )

        files = activity.extract_files()

        assert len(files) == 2
        assert files[0].id == 33485
        assert files[0].name == "Drive.png"
        assert files[0].link == "https://nextcloud.example.com/f/33485"
        assert files[1].id == 33482
        assert files[1].name == "Docs.png"

    def test_extract_files_uses_moved_object_instead_of_stale_placeholders(self) -> None:
        """Move activities resolve to the moved node, not its old path or destination folder."""
        activity = Activity(
            activity_id=2283,
            app="files",
            type="file_changed",
            user="testuser",
            subject="You moved Q3 planning notes.docx",
            message=None,
            link="https://nextcloud.example.com/f/94",
            object_type="files",
            object_id=94,
            object_name="/Archive/Q3 planning notes.docx",
            datetime=datetime(2026, 7, 22, 13, 15, 50),
            subject_rich=[
                "You moved {oldfile} to {newfile}",
                {
                    "oldfile": {
                        "type": "file",
                        "id": "94",
                        "name": "Q3 planning notes.docx",
                        "path": "Q3 planning notes.docx",
                        "link": "https://nextcloud.example.com/f/94",
                    },
                    "newfile": {
                        "type": "file",
                        "id": "12",
                        "name": "Archive",
                        "path": "Archive",
                        "link": "https://nextcloud.example.com/f/12",
                    },
                },
            ],
        )

        files = activity.extract_files()

        assert len(files) == 1
        assert files[0].id == 94
        assert files[0].name == "Q3 planning notes.docx"
        assert files[0].path == "Archive/Q3 planning notes.docx"
        assert files[0].link == "https://nextcloud.example.com/f/94"

    def test_extract_files_from_objects_dict(self) -> None:
        """Test extracting files from objects dict when no subject_rich."""
        activity = Activity(
            activity_id=2217,
            app="files",
            type="file_created",
            user="testuser",
            subject="You created files",
            message=None,
            link="https://nextcloud.example.com/f/33485",
            object_type="files",
            object_id=33485,
            object_name="/Drive.png",
            datetime=datetime(2026, 1, 13, 16, 7, 43),
            objects={
                "33485": "/Drive.png",
                "33482": "/Documents/Docs.png",
            },
        )

        files = activity.extract_files()

        assert len(files) == 2
        file_by_id = {f.id: f for f in files}
        assert file_by_id[33485].name == "Drive.png"
        assert file_by_id[33485].path == "Drive.png"
        assert file_by_id[33485].link is None
        assert file_by_id[33482].name == "Docs.png"
        assert file_by_id[33482].path == "Documents/Docs.png"

    def test_extract_files_fallback_to_single_object(self) -> None:
        """Test fallback to single object when no subject_rich or objects."""
        activity = Activity(
            activity_id=2282,
            app="files",
            type="file_changed",
            user="testuser",
            subject="You changed test.docx",
            message=None,
            link="https://nextcloud.example.com/f/31826",
            object_type="files",
            object_id=31826,
            object_name="/Documents/test.docx",
            datetime=datetime(2026, 1, 20, 13, 15, 50),
        )

        files = activity.extract_files()

        assert len(files) == 1
        assert files[0].id == 31826
        assert files[0].name == "test.docx"
        assert files[0].path == "Documents/test.docx"
        assert files[0].link is None

    def test_extract_files_ignores_non_file_types_in_subject_rich(self) -> None:
        """Test that non-file types in subject_rich are ignored."""
        activity = Activity(
            activity_id=2217,
            app="files",
            type="file_created",
            user="testuser",
            subject="You created files",
            message=None,
            link="https://nextcloud.example.com/f/33485",
            object_type="files",
            object_id=33485,
            object_name="/Drive.png",
            datetime=datetime(2026, 1, 13, 16, 7, 43),
            subject_rich=[
                "You created {file1} and {count} more",
                {
                    "file1": {
                        "type": "file",
                        "id": "33485",
                        "name": "Drive.png",
                        "path": "Drive.png",
                        "link": "https://nextcloud.example.com/f/33485",
                    },
                    "count": {"type": "highlight", "id": "3", "name": "3"},
                },
            ],
        )

        files = activity.extract_files()

        # Only the file should be extracted, not the highlight
        assert len(files) == 1
        assert files[0].id == 33485
        assert files[0].name == "Drive.png"
