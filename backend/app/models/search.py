from pydantic import BaseModel, Field


class FileSearchResult(BaseModel):
    name: str = Field(alias="title")
    url: str = Field(alias="resourceUrl")
    subline: str | None = None
    attributes: dict[str, str] = Field(default_factory=dict)
