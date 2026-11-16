from pydantic import BaseModel, Field


class DeckBoard(BaseModel):
    id: int
    title: str
    color: str = ""
    archived: bool = False
    # Deck keeps deleted boards in the list (for undo) with a deletion
    # timestamp; their stacks endpoint answers 403.
    deleted_at: int = Field(default=0, alias="deletedAt")


class DeckCard(BaseModel):
    id: int


class DeckStack(BaseModel):
    cards: list[DeckCard] = Field(default_factory=list[DeckCard])
    is_done_column: bool = Field(default=False, alias="isDoneColumn")


class ProjectSummary(BaseModel):
    id: int
    title: str
    color: str
    card_count: int
    completed_count: int
    link: str
