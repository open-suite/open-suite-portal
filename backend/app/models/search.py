from pydantic import BaseModel, Field


class FileSearchResult(BaseModel):
    name: str = Field(alias="title")
    url: str = Field(alias="resourceUrl")
    path: str | None = Field(default=None, alias="subline")
