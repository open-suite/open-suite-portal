"""OCS (Open Collaboration Services) client for NextCloud API.

Reference: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/index.html
"""

import logging
from typing import cast
from urllib.parse import quote, unquote, urlsplit

import defusedxml.ElementTree as ET
from app.clients.base import BaseAPIClient
from app.models.activity import Activity, FileActivity, FileActivityResponse, FileInfo
from app.models.search import FileSearchResult

logger = logging.getLogger(__name__)

DISPLAYABLE_FILE_ACTIVITY_TYPES = frozenset(
    {
        "file_changed",
        "file_created",
        "file_favorite_changed",
        "file_restored",
        "public_links_upload",
        "shared",
    }
)


class OCSClient(BaseAPIClient):
    """Client for NextCloud OCS API.

    Handles business logic for activities, file search, calendar search, and task search.
    """

    service_name = "NextCloud OCS"

    def _auth_headers(self) -> dict[str, str]:
        headers = super()._auth_headers()
        headers["OCS-APIRequest"] = "true"
        headers["Accept"] = "application/json"
        return headers

    async def get_file_activities(
        self,
        limit: int = 50,
        since: int = 0,
        is_favorite: bool = False,
    ) -> FileActivityResponse:
        """Get file activities with cursor-based pagination.

        When is_favorite=True, fetches favorite files via WebDAV REPORT instead of the activity feed.
        Otherwise fetches activities, filters to file-related activities (including sharing),
        and returns with all files per activity preserved.
        """
        if is_favorite:
            return await self._get_favorite_files()

        url_string = "ocs/v2.php/apps/activity/api/v2/activity/files"

        params: dict[str, str] = {"format": "json"}
        if since:
            params["since"] = str(since)
        if limit:
            params["limit"] = str(limit)

        # The Activity API answers 304 Not Modified (or 204) when there are no
        # activities at all — normal on a fresh install, not an upstream error.
        url = self._build_url(url_string)
        probe = await self.client.get(url, params=params, headers=self._auth_headers(), timeout=self.timeout)
        if probe.status_code in (204, 304):
            return FileActivityResponse(results=[], last_given=None)

        activities, headers = await self._get_resource_with_headers(
            path=url_string,
            model_type=list[Activity],
            params=params,
            response_parser=lambda data: data.get("ocs", {}).get("data", []),
        )

        # Nextcloud returns newest activities first. Keep the newest lifecycle
        # state for each ID/path so a deletion also hides older rows and children.
        file_activities: list[FileActivity] = []
        deleted_file_ids: set[int] = set()
        deleted_file_paths: set[str] = set()
        for activity in activities:
            if activity.object_type != "files":
                continue

            files = activity.extract_files()
            file_ids = {file.id for file in files if file.id is not None}
            file_paths = {file.path.strip("/") for file in files if file.path and file.path.strip("/")}

            if activity.type == "file_deleted":
                deleted_file_ids.update(file_ids)
                deleted_file_paths.update(file_paths)
                deleted_file_ids.add(activity.object_id)
                object_path = activity.object_name.strip("/")
                if object_path:
                    deleted_file_paths.add(object_path)
                if activity.objects:
                    deleted_file_ids.update(int(file_id) for file_id in activity.objects)
                    deleted_file_paths.update(path.strip("/") for path in activity.objects.values() if path.strip("/"))
                continue

            if activity.type not in DISPLAYABLE_FILE_ACTIVITY_TYPES:
                continue

            current_files: list[FileInfo] = []
            for file in files:
                path = file.path.strip("/") if file.path else ""
                is_under_deleted_path = any(
                    path == deleted_path or path.startswith(f"{deleted_path}/") for deleted_path in deleted_file_paths
                )
                if file.id not in deleted_file_ids and not is_under_deleted_path:
                    current_files.append(file)
            if current_files:
                file_activities.append(
                    FileActivity(
                        activity_id=activity.activity_id,
                        datetime=activity.datetime,
                        action=activity.type,
                        files=current_files,
                    )
                )

        # Get last_given from header for cursor-based pagination
        # Note: httpx returns headers in lowercase
        last_given_str = headers.get("x-activity-last-given")
        last_given = int(last_given_str) if last_given_str else None

        return FileActivityResponse(results=file_activities, last_given=last_given)

    async def _get_favorite_files(self) -> FileActivityResponse:
        """Fetch favorite files using Nextcloud WebDAV REPORT.

        Reference: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/webdav/index.html
        """
        # Resolve current user ID
        url = self._build_url("ocs/v2.php/cloud/user")
        user_response = await self.client.get(url, params={"format": "json"}, headers=self._auth_headers())
        if user_response.status_code != 200:
            logger.warning(
                "Failed to resolve current user for favorites (status %s), returning empty results",
                user_response.status_code,
            )
            return FileActivityResponse(results=[], last_given=None)
        user_id = user_response.json().get("ocs", {}).get("data", {}).get("id", "")

        # WebDAV REPORT to filter favorite files
        xml_body = (
            '<?xml version="1.0"?>'
            '<oc:filter-files xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">'
            "<d:prop>"
            "<d:getlastmodified/><d:getcontenttype/><d:displayname/><oc:fileid/><oc:favorite/>"
            "</d:prop>"
            "<oc:filter-rules><oc:favorite>1</oc:favorite></oc:filter-rules>"
            "</oc:filter-files>"
        )
        report_url = self._build_url(f"remote.php/dav/files/{user_id}/")
        headers = self._auth_headers()
        headers["Content-Type"] = "application/xml"
        headers["Depth"] = "infinity"

        response = await self.client.request("REPORT", report_url, content=xml_body.encode(), headers=headers)
        if response.status_code not in (200, 207):
            logger.warning(
                "Failed to fetch favorites via WebDAV REPORT (status %s), returning empty results",
                response.status_code,
            )
            return FileActivityResponse(results=[], last_given=None)

        # Parse WebDAV multistatus XML response
        DAV = "DAV:"
        OC = "http://owncloud.org/ns"
        root = ET.fromstring(response.text)
        webroot = urlsplit(self.base_url).path.rstrip("/")
        dav_user_path = f"{webroot}/remote.php/dav/files/{quote(user_id, safe='')}/"
        file_activities: list[FileActivity] = []

        for resp in root.findall(f"{{{DAV}}}response"):
            href = resp.findtext(f"{{{DAV}}}href") or ""
            href_path = urlsplit(href).path
            if not href_path.startswith(dav_user_path):
                continue
            propstat = resp.find(f"{{{DAV}}}propstat")
            if propstat is None:
                continue
            if "200" not in (propstat.findtext(f"{{{DAV}}}status") or ""):
                continue
            prop = propstat.find(f"{{{DAV}}}prop")
            if prop is None:
                continue

            display_name = prop.findtext(f"{{{DAV}}}displayname") or href.rstrip("/").split("/")[-1]
            file_id_str = prop.findtext(f"{{{OC}}}fileid")
            file_id = int(file_id_str) if file_id_str else None
            encoded_path = href_path[len(dav_user_path) :]
            path = "/".join(unquote(segment) for segment in encoded_path.split("/"))
            link = f"{self.base_url}/f/{file_id}" if file_id else None

            file_activities.append(FileActivity(files=[FileInfo(id=file_id, name=display_name, path=path, link=link)]))

        return FileActivityResponse(results=file_activities, last_given=None)

    async def search_files(
        self, term: str, path: str = "ocs/v2.php/search/providers/files/search"
    ) -> FileActivityResponse:
        validated = await self._get_resource(
            path=path,
            model_type=list[FileSearchResult],
            params={"format": "json", "term": term},
            response_parser=lambda data: data.get("ocs", {}).get("data", {}).get("entries", []),
        )
        search_results: list[FileSearchResult] = validated
        file_activities: list[FileActivity] = []
        for entry in search_results:
            try:
                file_id = int(entry.attributes.get("fileId", ""))
            except ValueError:
                file_id = None
            file_path = entry.attributes.get("path")
            file_activities.append(
                FileActivity(
                    files=[
                        FileInfo(
                            id=file_id,
                            name=entry.name,
                            path=file_path.lstrip("/") if file_path else None,
                            link=entry.url,
                        )
                    ]
                )
            )
        return FileActivityResponse(results=file_activities, last_given=None)

    async def open_direct_editing(self, file_id: int) -> str | None:
        """Ask Nextcloud to mint a one-time Direct Editing navigation URL.

        Deliberately omit editorId: Nextcloud must select and validate the editor
        from the file's authoritative MIME type. Resolve fileId from the user's
        mount-aware root so the selected ID, rather than a possibly stale path,
        determines which file opens.
        """
        response = await self.client.post(
            self._build_url("ocs/v2.php/apps/files/api/v1/directEditing/open"),
            params={"format": "json"},
            json={"path": "/", "fileId": file_id},
            headers=self._auth_headers(),
            timeout=self.timeout,
        )
        if response.status_code != 200:
            return None

        try:
            payload_value: object = response.json()
        except ValueError:
            return None

        if not isinstance(payload_value, dict):
            return None
        payload = cast(dict[str, object], payload_value)
        ocs_value = payload.get("ocs")
        if not isinstance(ocs_value, dict):
            return None
        ocs = cast(dict[str, object], ocs_value)
        meta_value = ocs.get("meta")
        data_value = ocs.get("data")
        if not isinstance(meta_value, dict) or not isinstance(data_value, dict):
            return None
        meta = cast(dict[str, object], meta_value)
        data = cast(dict[str, object], data_value)
        url = data.get("url")
        if meta.get("statuscode") != 200 or not isinstance(url, str):
            return None
        return url if self._is_valid_direct_editing_url(url) else None

    def _is_valid_direct_editing_url(self, url: str) -> bool:
        try:
            configured = urlsplit(self.base_url)
            returned = urlsplit(url)
        except ValueError:
            return False
        if returned.scheme != configured.scheme or returned.netloc != configured.netloc:
            return False
        if returned.username or returned.password or returned.query or returned.fragment:
            return False

        base_path = configured.path.rstrip("/")
        prefixes = (
            f"{base_path}/apps/files/directEditing/",
            f"{base_path}/index.php/apps/files/directEditing/",
        )
        for prefix in prefixes:
            if returned.path.startswith(prefix) and "/" not in returned.path[len(prefix) :]:
                return bool(returned.path[len(prefix) :])
        return False
