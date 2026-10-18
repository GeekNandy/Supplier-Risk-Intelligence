from pydantic import BaseModel, Field, field_validator


class CompareRequest(BaseModel):
    supplier_ids: list[str] = Field(min_length=1, max_length=20)
    rank_by: str = "Total_Risk_Index"

    @field_validator("supplier_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        if len(values) != len(set(values)):
            raise ValueError("Select unique supplier IDs")
        return values


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    supplier_ids: list[str] = Field(default_factory=list, max_length=20)


class ResearchRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    country: str | None = Field(default=None, max_length=100)
    website: str | None = Field(default=None, max_length=500)

