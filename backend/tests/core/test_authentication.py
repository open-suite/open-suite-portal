"""Tests for the core authentication module."""

import asyncio
import time
from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.authentication import (
    _needs_refresh,
    _refresh_token,
    get_active_user,
    get_current_user,
    oauth2_scheme,
)
from app.exceptions import CredentialError
from app.models.user import AuthState, User
from fastapi import Request


class TestOAuth2Scheme:
    """Test cases for OAuth2 scheme configuration."""

    def test_oauth2_scheme_configuration(self) -> None:
        """Test OAuth2 scheme is properly configured."""
        assert oauth2_scheme.auto_error is False
        # Note: authorizationUrl and tokenUrl are set during initialization
        # but may not be accessible as direct attributes in all versions


class TestNeedsRefresh:
    """Test cases for the _needs_refresh function."""

    def test_needs_refresh_no_expires_at(self) -> None:
        """Test that None expires_at returns False."""
        assert _needs_refresh(None) is False

    def test_needs_refresh_token_expired(self) -> None:
        """Test that expired token needs refresh."""
        expired_time = int(time.time()) - 3600  # 1 hour ago
        assert _needs_refresh(expired_time) is True

    def test_needs_refresh_token_expiring_soon(self) -> None:
        """Test that token expiring within 60s needs refresh."""
        expiring_time = int(time.time()) + 30  # 30 seconds from now
        assert _needs_refresh(expiring_time) is True

    def test_needs_refresh_token_valid(self) -> None:
        """Test that valid token with time remaining doesn't need refresh."""
        valid_time = int(time.time()) + 3600  # 1 hour from now
        assert _needs_refresh(valid_time) is False

    def test_needs_refresh_boundary_condition(self) -> None:
        """Test boundary condition at exactly 60 seconds."""
        boundary_time = int(time.time()) + 60  # Exactly 60 seconds
        assert _needs_refresh(boundary_time) is True


class TestGetActiveUser:
    @pytest.fixture
    def active_request(self) -> MagicMock:
        return MagicMock(spec=Request)

    @pytest.fixture
    def auth(self) -> AuthState:
        return AuthState(
            sub="user123",
            user=User(name="Test User", email="test@example.com"),
            access_token="access-token",
            refresh_token="refresh-token",
            expires_at=9999999999,
        )

    @pytest.mark.asyncio
    async def test_active_introspection_allows_bootstrap(self, active_request: MagicMock, auth: AuthState) -> None:
        response = MagicMock()
        response.json.return_value = {"active": True}
        response.raise_for_status.return_value = None
        client = AsyncMock()
        client.post.return_value = response

        with (
            patch("app.core.authentication.settings.OIDC_INTROSPECTION_ENDPOINT", "https://id/token/introspect"),
            patch("app.core.authentication.session.get_auth", AsyncMock(return_value=auth)),
            patch("app.core.authentication.http_client_dependency", AsyncMock(return_value=client)),
        ):
            result = await get_active_user(active_request, auth.user)

        assert result == auth.user
        client.post.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_inactive_introspection_clears_session(self, active_request: MagicMock, auth: AuthState) -> None:
        response = MagicMock()
        response.json.return_value = {"active": False}
        response.raise_for_status.return_value = None
        client = AsyncMock()
        client.post.return_value = response
        clear_auth = AsyncMock()

        with (
            patch("app.core.authentication.settings.OIDC_INTROSPECTION_ENDPOINT", "https://id/token/introspect"),
            patch("app.core.authentication.session.get_auth", AsyncMock(return_value=auth)),
            patch("app.core.authentication.session.clear_auth", clear_auth),
            patch("app.core.authentication.http_client_dependency", AsyncMock(return_value=client)),
            pytest.raises(CredentialError),
        ):
            await get_active_user(active_request, auth.user)

        clear_auth.assert_awaited_once_with(active_request)


class TestRefreshToken:
    """Test cases for the _refresh_token function."""

    @pytest.fixture
    def mock_request(self) -> Request:
        """Create a mock request object."""
        request = MagicMock(spec=Request)
        request.session = {}
        return request

    @pytest.mark.asyncio
    async def test_refresh_no_refresh_token(self, mock_request: Request) -> None:
        """Test refresh fails when no refresh token is provided."""
        with pytest.raises(CredentialError) as exc_info:
            await _refresh_token(mock_request, None)

        assert "Session expired. Please log in again." in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_refresh_empty_refresh_token(self, mock_request: Request) -> None:
        """Test refresh fails when empty refresh token is provided."""
        with pytest.raises(CredentialError) as exc_info:
            await _refresh_token(mock_request, "")

        assert "Session expired. Please log in again." in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication.oauth")
    async def test_refresh_success(self, mock_oauth: MagicMock, mock_session: AsyncMock, mock_request: Request) -> None:
        """Test successful token refresh."""
        # Mock successful token response
        new_token = {
            "access_token": "new_access_token",
            "expires_at": int(time.time()) + 3600,
            "refresh_token": "new_refresh_token",
        }
        mock_oauth.oidc.fetch_access_token = AsyncMock(return_value=new_token)
        mock_session.update_tokens = AsyncMock()

        await _refresh_token(mock_request, "old_refresh_token")

        # Verify OAuth call
        mock_oauth.oidc.fetch_access_token.assert_called_once_with(
            grant_type="refresh_token", refresh_token="old_refresh_token"
        )

        # Verify session was updated
        mock_session.update_tokens.assert_called_once_with(
            mock_request,
            access_token="new_access_token",
            expires_at=new_token["expires_at"],
            refresh_token="new_refresh_token",
        )

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication.oauth")
    async def test_refresh_success_no_new_refresh_token(
        self, mock_oauth: MagicMock, mock_session: MagicMock, mock_request: Request
    ) -> None:
        """Test successful token refresh without new refresh token."""
        # Mock token response without refresh_token
        new_token = {
            "access_token": "new_access_token",
            "expires_at": int(time.time()) + 3600,
        }
        mock_oauth.oidc.fetch_access_token = AsyncMock(return_value=new_token)
        mock_session.update_tokens = AsyncMock()

        await _refresh_token(mock_request, "old_refresh_token")

        # Verify session was updated with None for refresh_token
        mock_session.update_tokens.assert_called_once_with(
            mock_request,
            access_token="new_access_token",
            expires_at=new_token["expires_at"],
            refresh_token=None,
        )

    @pytest.mark.asyncio
    @patch("app.core.authentication.oauth")
    async def test_refresh_oauth_failure(self, mock_oauth: MagicMock, mock_request: Request) -> None:
        """Test token refresh failure due to OAuth error."""
        mock_oauth.oidc.fetch_access_token = AsyncMock(side_effect=Exception("OAuth error"))

        with pytest.raises(CredentialError) as exc_info:
            await _refresh_token(mock_request, "refresh_token")

        assert "Session expired" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @patch("app.core.authentication.oauth")
    @patch("app.core.authentication.session")
    async def test_refresh_token_reuse_conflict(
        self, mock_session: MagicMock, mock_oauth: MagicMock, mock_request: Request
    ) -> None:
        """Test that token reuse errors raise TokenRefreshConflictError (409), not CredentialError."""
        from app.exceptions import TokenRefreshConflictError

        # Simulate Keycloak's "reuse exceeded" error
        mock_oauth.oidc.fetch_access_token = AsyncMock(
            side_effect=Exception("invalid_grant: Maximum allowed refresh token reuse exceeded")
        )
        mock_session.clear_auth = AsyncMock()

        with pytest.raises(TokenRefreshConflictError):
            await _refresh_token(mock_request, "refresh_token")

        # Session should NOT be cleared for reuse conflicts
        mock_session.clear_auth.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.core.authentication.oauth")
    @patch("app.core.authentication.session")
    async def test_refresh_invalid_grant_non_reuse(
        self, mock_session: MagicMock, mock_oauth: MagicMock, mock_request: Request
    ) -> None:
        """Test that non-reuse invalid_grant errors clear session and raise CredentialError."""
        # Simulate a non-reuse invalid_grant error (corrupted session, expired token, etc.)
        mock_oauth.oidc.fetch_access_token = AsyncMock(
            side_effect=Exception("invalid_grant: Session doesn't have required client")
        )
        mock_session.clear_auth = AsyncMock()

        with pytest.raises(CredentialError) as exc_info:
            await _refresh_token(mock_request, "refresh_token")

        # Session SHOULD be cleared for non-reuse errors
        mock_session.clear_auth.assert_called_once_with(mock_request)
        assert "Session expired" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @patch("app.core.authentication.oauth")
    @patch("app.core.authentication.session")
    async def test_refresh_token_not_active(
        self, mock_session: MagicMock, mock_oauth: MagicMock, mock_request: Request
    ) -> None:
        """Test that 'token is not active' errors are logged at INFO level (expected expiration)."""
        # Simulate Keycloak's "token is not active" error (common on service restart)
        mock_oauth.oidc.fetch_access_token = AsyncMock(side_effect=Exception("invalid_grant: Token is not active"))
        mock_session.clear_auth = AsyncMock()

        with pytest.raises(CredentialError) as exc_info:
            await _refresh_token(mock_request, "refresh_token")

        # Session SHOULD be cleared for expired tokens
        mock_session.clear_auth.assert_called_once_with(mock_request)
        assert "Session expired" in str(exc_info.value.detail)


class TestGetCurrentUser:
    """Test cases for the get_current_user function."""

    @pytest.fixture
    def mock_request(self) -> Request:
        """Create a mock request object."""
        request = MagicMock(spec=Request)
        request.session = {"session_id": "test_session_123"}
        return request

    @pytest.fixture
    def mock_redis(self) -> Generator[AsyncMock]:
        """Fake the Redis client backing the refresh lock; lock is free."""
        client = AsyncMock()
        client.set = AsyncMock(return_value=True)
        client.get = AsyncMock(return_value=None)
        client.delete = AsyncMock()
        with patch("app.core.authentication.get_redis_client", return_value=client):
            yield client

    @pytest.fixture
    def sample_user(self) -> User:
        """Create a sample user for testing."""
        return User(name="Test User", email="test@example.com")

    @pytest.fixture
    def valid_auth_state(self, sample_user: User) -> AuthState:
        """Create a valid auth state."""
        return AuthState(
            sub="user123",
            user=sample_user,
            access_token="valid_token",
            refresh_token="valid_refresh_token",
            expires_at=int(time.time()) + 3600,  # Valid for 1 hour
        )

    @pytest.fixture
    def expired_auth_state(self, sample_user: User) -> AuthState:
        """Create an expired auth state."""
        return AuthState(
            sub="user123",
            user=sample_user,
            access_token="expired_token",
            refresh_token="valid_refresh_token",
            expires_at=int(time.time()) - 100,  # Expired 100 seconds ago
        )

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    async def test_get_current_user_not_authenticated(self, mock_session: MagicMock, mock_request: Request) -> None:
        """Test get_current_user when not authenticated."""
        mock_session.get_auth = AsyncMock(return_value=None)

        with pytest.raises(CredentialError) as exc_info:
            await get_current_user(mock_request, None)

        assert "Not authenticated" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    async def test_get_current_user_valid_token(
        self, mock_session: MagicMock, mock_request: Request, valid_auth_state: AuthState
    ) -> None:
        """Test get_current_user with valid token that doesn't need refresh."""
        mock_session.get_auth = AsyncMock(return_value=valid_auth_state)
        mock_session.update_tokens = AsyncMock()

        result = await get_current_user(mock_request, None)

        assert result == valid_auth_state.user
        # Should not attempt refresh
        mock_session.update_tokens.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_get_current_user_token_refresh_needed(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        mock_request: Request,
        mock_redis: AsyncMock,
        expired_auth_state: AuthState,
        valid_auth_state: AuthState,
    ) -> None:
        """Test get_current_user when token refresh is needed."""
        # Configure the flow: initial auth, auth after refresh
        mock_session.get_auth = AsyncMock(
            side_effect=[
                expired_auth_state,  # Initial check
                valid_auth_state,  # After refresh
            ]
        )

        result = await get_current_user(mock_request, None)

        # Verify refresh was called
        mock_refresh.assert_called_once_with(mock_request, expired_auth_state.refresh_token)

        # Verify result
        assert result == valid_auth_state.user

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_get_current_user_session_lost_after_refresh(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        mock_request: Request,
        mock_redis: AsyncMock,
        expired_auth_state: AuthState,
    ) -> None:
        """Test get_current_user when session is lost after refresh."""
        # Configure flow: initial auth, session lost after refresh
        mock_session.get_auth = AsyncMock(
            side_effect=[
                expired_auth_state,  # Initial check
                None,  # Session lost after refresh
            ]
        )

        with pytest.raises(CredentialError) as exc_info:
            await get_current_user(mock_request, None)

        # Error gets caught and re-raised with generic message
        assert "Session expired. Please log in again." in str(exc_info.value.detail)

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_concurrent_requests_refresh_exactly_once(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        mock_request: Request,
        mock_redis: AsyncMock,
        expired_auth_state: AuthState,
        valid_auth_state: AuthState,
    ) -> None:
        """Concurrent requests elect one refresher; the waiter reuses its result.

        Keycloak rotates refresh tokens, and reuse of a rotated token
        invalidates the whole SSO session — so exactly one refresh may reach
        the token endpoint.
        """
        # Request 1 wins the lock; request 2 finds it taken, then sees it freed.
        mock_redis.set = AsyncMock(side_effect=[True, None])
        mock_redis.get = AsyncMock(return_value=None)

        refreshed = False

        async def fake_refresh(request: Request, refresh_token: str | None) -> None:
            nonlocal refreshed
            await asyncio.sleep(0)
            refreshed = True

        async def fake_get_auth(request: Request) -> AuthState:
            return valid_auth_state if refreshed else expired_auth_state

        mock_refresh.side_effect = fake_refresh
        mock_session.get_auth = AsyncMock(side_effect=fake_get_auth)

        results = await asyncio.gather(
            get_current_user(mock_request, None),
            get_current_user(mock_request, None),
            return_exceptions=True,
        )

        assert results == [valid_auth_state.user, valid_auth_state.user]
        mock_refresh.assert_called_once_with(mock_request, expired_auth_state.refresh_token)

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_waiter_conflicts_when_refresh_produces_no_fresh_tokens(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        mock_request: Request,
        mock_redis: AsyncMock,
        expired_auth_state: AuthState,
    ) -> None:
        """A waiter that still sees stale tokens surfaces the retryable 409."""
        from fastapi import HTTPException

        mock_redis.set = AsyncMock(return_value=None)  # lock held elsewhere
        mock_redis.get = AsyncMock(return_value=None)  # released on next poll

        mock_session.get_auth = AsyncMock(
            side_effect=[
                expired_auth_state,  # Initial check
                expired_auth_state,  # Still stale after the other refresher
            ]
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(mock_request, None)

        assert exc_info.value.status_code == 409
        mock_refresh.assert_not_called()

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_get_current_user_no_session_id(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        expired_auth_state: AuthState,
        valid_auth_state: AuthState,
    ) -> None:
        """Test get_current_user when request has no session ID."""
        # Create request without session ID
        request = MagicMock(spec=Request)
        request.session = {}  # No session_id: refresh runs unlocked

        mock_session.get_auth = AsyncMock(
            side_effect=[
                expired_auth_state,  # Initial check
                valid_auth_state,  # After refresh
            ]
        )

        result = await get_current_user(request, None)

        # Should still work
        assert result == valid_auth_state.user
        mock_refresh.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._refresh_token")
    async def test_get_current_user_refresh_not_needed(
        self,
        mock_refresh: AsyncMock,
        mock_session: MagicMock,
        mock_request: Request,
        valid_auth_state: AuthState,
    ) -> None:
        """Test that refresh is skipped if token is valid."""
        # Token is valid, no refresh needed
        mock_session.get_auth = AsyncMock(return_value=valid_auth_state)

        result = await get_current_user(mock_request, None)

        # Token is valid, so no refresh needed
        mock_refresh.assert_not_called()
        assert result == valid_auth_state.user

    @pytest.mark.parametrize(
        "should_refresh",
        [True, False],
    )
    @pytest.mark.asyncio
    @patch("app.core.authentication.session")
    @patch("app.core.authentication._needs_refresh")
    async def test_get_current_user_refresh_logic(
        self,
        mock_needs_refresh: MagicMock,
        mock_session: MagicMock,
        mock_request: Request,
        mock_redis: AsyncMock,
        sample_user: User,
        should_refresh: bool,
    ) -> None:
        """Test refresh logic with different scenarios."""
        auth_state = AuthState(
            sub="user123",
            user=sample_user,
            access_token="token",
            refresh_token="refresh_token",
            expires_at=int(time.time()) + 3600,  # Valid token
        )

        if should_refresh:
            # Initial check triggers a refresh; the re-read is fresh.
            mock_needs_refresh.side_effect = [True, False]
            valid_auth = AuthState(
                sub="user123",
                user=sample_user,
                access_token="new_token",
                refresh_token="new_refresh_token",
                expires_at=int(time.time()) + 3600,
            )
            mock_session.get_auth = AsyncMock(
                side_effect=[
                    auth_state,  # Initial check
                    valid_auth,  # After refresh
                ]
            )

            with patch("app.core.authentication._refresh_token") as mock_refresh:
                result = await get_current_user(mock_request, None)

            mock_refresh.assert_called_once()
        else:
            # No refresh needed
            mock_needs_refresh.return_value = False
            mock_session.get_auth = AsyncMock(return_value=auth_state)
            result = await get_current_user(mock_request, None)

        assert result == sample_user

