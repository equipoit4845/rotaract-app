"""Cursor pagination (``{ items, pageInfo: { nextCursor, hasMore } }``).

- ``for item in paginator`` (or ``async for``) follows ``nextCursor``.
- ``paginator.all()`` collects every item.
- ``paginator.page()`` fetches only the first page (or the one at ``cursor``)
  and is how ETags are used: with ``if_none_match`` it may return
  ``NotModified``. ``if_none_match`` applies to the first page only; when it
  matches, iteration yields nothing and ``paginator.not_modified`` is True.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Awaitable, Callable, Generic, Iterator, TypeVar, Union

T = TypeVar("T")


@dataclass
class Page(Generic[T]):
    items: list[T]
    next_cursor: str | None
    has_more: bool
    etag: str | None = None
    not_modified: bool = field(default=False, init=False)


@dataclass
class NotModified:
    """The server answered 304 to If-None-Match."""

    etag: str | None = None
    not_modified: bool = field(default=True, init=False)


PageResult = Union[Page[T], NotModified]
SyncFetcher = Callable[[Union[str, None], Union[str, None]], PageResult]
AsyncFetcher = Callable[[Union[str, None], Union[str, None]], Awaitable[PageResult]]


class SyncPaginator(Generic[T]):
    def __init__(self, fetch_page: SyncFetcher, if_none_match: str | None = None):
        self._fetch_page = fetch_page
        self._if_none_match = if_none_match
        self.not_modified = False
        self.etag: str | None = None

    def page(self, cursor: str | None = None) -> PageResult:
        result = self._fetch_page(cursor, self._if_none_match if cursor is None else None)
        if cursor is None:
            self.etag = result.etag
            self.not_modified = result.not_modified
        return result

    def pages(self) -> Iterator[Page[T]]:
        cursor: str | None = None
        seen: set[str] = set()
        while True:
            result = self.page(cursor)
            if isinstance(result, NotModified):
                return
            yield result
            if not result.has_more or not result.next_cursor or result.next_cursor in seen:
                return
            seen.add(result.next_cursor)
            cursor = result.next_cursor

    def __iter__(self) -> Iterator[T]:
        for page in self.pages():
            yield from page.items

    def all(self, max: int | None = None) -> list[T]:
        items: list[T] = []
        for item in self:
            items.append(item)
            if max is not None and len(items) >= max:
                break
        return items


class AsyncPaginator(Generic[T]):
    def __init__(self, fetch_page: AsyncFetcher, if_none_match: str | None = None):
        self._fetch_page = fetch_page
        self._if_none_match = if_none_match
        self.not_modified = False
        self.etag: str | None = None

    async def page(self, cursor: str | None = None) -> PageResult:
        result = await self._fetch_page(cursor, self._if_none_match if cursor is None else None)
        if cursor is None:
            self.etag = result.etag
            self.not_modified = result.not_modified
        return result

    async def pages(self) -> AsyncIterator[Page[T]]:
        cursor: str | None = None
        seen: set[str] = set()
        while True:
            result = await self.page(cursor)
            if isinstance(result, NotModified):
                return
            yield result
            if not result.has_more or not result.next_cursor or result.next_cursor in seen:
                return
            seen.add(result.next_cursor)
            cursor = result.next_cursor

    async def __aiter__(self) -> AsyncIterator[T]:
        async for page in self.pages():
            for item in page.items:
                yield item

    async def all(self, max: int | None = None) -> list[T]:
        items: list[T] = []
        async for item in self:
            items.append(item)
            if max is not None and len(items) >= max:
                break
        return items
