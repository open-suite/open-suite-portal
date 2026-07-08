"""Tests for the token-exchange cache."""

from unittest.mock import AsyncMock, patch

import pytest
from app import token_exchange


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    token_exchange._TOKEN_CACHE.clear()
    yield
    token_exchange._TOKEN_CACHE.clear()


def _response(status: int = 200, expires_in: int = 300, access_token: str = "exchanged") -> AsyncMock:  # noqa: S107
    resp = AsyncMock()
    resp.status_code = status
    resp.json = lambda: {"access_token": access_token, "expires_in": expires_in}
    resp.raise_for_status = lambda: None
    return resp


@pytest.mark.asyncio
async def test_exchange_caches_by_subject_and_audience() -> None:
    post = AsyncMock(return_value=_response())
    client = AsyncMock()
    client.post = post
    with patch.object(token_exchange, "http_client_dependency", AsyncMock(return_value=client)):
        first = await token_exchange.exchange_token("subject-a", "caldav")
        second = await token_exchange.exchange_token("subject-a", "caldav")

    assert first == "exchanged"
    assert second == "exchanged"
    assert post.await_count == 1  # second call served from cache


@pytest.mark.asyncio
async def test_different_audience_is_a_separate_entry() -> None:
    post = AsyncMock(return_value=_response())
    client = AsyncMock()
    client.post = post
    with patch.object(token_exchange, "http_client_dependency", AsyncMock(return_value=client)):
        await token_exchange.exchange_token("subject-a", "caldav")
        await token_exchange.exchange_token("subject-a", "docs")

    assert post.await_count == 2  # distinct audiences must not share a cache entry


@pytest.mark.asyncio
async def test_rotated_subject_token_misses() -> None:
    post = AsyncMock(return_value=_response())
    client = AsyncMock()
    client.post = post
    with patch.object(token_exchange, "http_client_dependency", AsyncMock(return_value=client)):
        await token_exchange.exchange_token("subject-a", "caldav")
        await token_exchange.exchange_token("subject-b", "caldav")

    assert post.await_count == 2  # a refreshed session rotates the subject token


@pytest.mark.asyncio
async def test_short_lived_token_is_not_cached() -> None:
    # expires_in below the safety margin => ttl 0 => never cached.
    post = AsyncMock(return_value=_response(expires_in=10))
    client = AsyncMock()
    client.post = post
    with patch.object(token_exchange, "http_client_dependency", AsyncMock(return_value=client)):
        await token_exchange.exchange_token("subject-a", "caldav")
        await token_exchange.exchange_token("subject-a", "caldav")

    assert post.await_count == 2
    assert token_exchange._TOKEN_CACHE == {}
