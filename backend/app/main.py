import os
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.staticfiles import StaticFiles

from app import data
from app.access import AccessMiddleware, jury_access
from app.chat import answer_question
from app.models import (
    ChatRequest,
    ChatResponse,
    CompareRequest,
    ComparisonResponse,
    MetadataResponse,
    ResearchRequest,
    ResearchResponse,
    Scalar,
    SupplierPage,
)
from app.providers import ServiceError, Settings
from app.research import research_company
from app.runtime import ROOT, enabled

app = FastAPI(
    title="Supplier Risk Intelligence",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_middleware(AccessMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "dataset_present": data.DATA_PATH.is_file()}


@app.get("/api/ready")
def ready():
    """Local readiness only: no billable provider calls."""
    try:
        rows = data.suppliers()
        access = jury_access()
        settings = Settings.from_env()
        if settings.llm_api_key or enabled("REQUIRE_LIVE_AI"):
            settings.require_llm()
        if enabled("REQUIRE_LIVE_AI") and not settings.tavily_api_key:
            raise ServiceError("Live research is required. Set TAVILY_API_KEY on the server.", 503)
    except (OSError, ValueError, ServiceError):
        raise HTTPException(
            503, "Backend is not ready. Check dataset, AI configuration and jury access settings."
        ) from None
    return {
        "status": "ready",
        "supplier_count": len(rows),
        "jury_auth_enabled": access.configured,
        "live_ai_configured": settings.llm_ready and bool(settings.tavily_api_key),
    }


@app.get("/api/status")
def status():
    settings = Settings.from_env()
    configured = settings.llm_ready
    if configured:
        try:
            settings.require_llm()
        except ServiceError:
            configured = False
    return {
        "chat_mode": "live"
        if configured
        else "data_only"
        if not settings.llm_api_key
        else "configuration_required",
        "model_configured": configured,
        "search_configured": bool(settings.tavily_api_key),
        "research_ready": configured and bool(settings.tavily_api_key),
        "model": settings.llm_model if configured else None,
        "jury_auth_enabled": jury_access().configured,
        "configuration_only": True,
    }


def data_call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except (OSError, data.DatasetError):
        raise HTTPException(
            503,
            "Dataset is missing or invalid. Run python scripts/download_data.py from the repository root.",
        ) from None
    except KeyError as error:
        raise HTTPException(404, f"Supplier not found: {error.args[0]}") from None
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.get("/api/meta", response_model=MetadataResponse)
def meta():
    return data_call(data.metadata)


@app.get("/api/suppliers", response_model=SupplierPage)
def list_suppliers(
    q: str = Query("", max_length=300),
    risk_level: str | None = Query(None, max_length=80),
    sort_by: str = "Total_Risk_Index",
    order: Literal["asc", "desc"] = "asc",
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    max_total_risk: float | None = Query(None, ge=0, le=100),
):
    return data_call(
        data.search_suppliers,
        q,
        risk_level,
        sort_by,
        order == "desc",
        offset,
        limit,
        max_total_risk,
    )


@app.get("/api/suppliers/{supplier_id}", response_model=dict[str, Scalar])
def supplier_detail(supplier_id: str):
    return data_call(data.get_supplier, supplier_id)


@app.post("/api/compare", response_model=ComparisonResponse)
def compare(request: CompareRequest):
    return data_call(data.compare_suppliers, request.supplier_ids, request.rank_by)


async def ai_call(function, request):
    try:
        return await function(request)
    except ServiceError as error:
        raise HTTPException(error.status_code, str(error)) from None
    except (OSError, data.DatasetError):
        raise HTTPException(
            503, "Dataset is missing or invalid. Run python scripts/download_data.py."
        ) from None
    except KeyError as error:
        raise HTTPException(404, f"Supplier not found: {error.args[0]}") from None
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    return await ai_call(answer_question, request)


@app.post("/api/research", response_model=ResearchResponse)
async def research(request: ResearchRequest):
    return await ai_call(research_company, request)


# After `npm run build`, one Python process can also serve the frontend.
frontend_dist = ROOT / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


def openapi_schema():
    if app.openapi_schema is None:
        schema = get_openapi(
            title=app.title,
            version=app.version,
            routes=app.routes,
            description="Jury HTTP Basic login applies when JURY_USERNAME and JURY_PASSWORD are set. Health/readiness remain public. Local development permits anonymous access when both are blank.",
        )
        schema.setdefault("components", {}).setdefault("securitySchemes", {})["JuryBasic"] = {
            "type": "http",
            "scheme": "basic",
        }
        for path, operations in schema["paths"].items():
            if path not in {"/api/health", "/api/ready"}:
                for operation in operations.values():
                    if isinstance(operation, dict):
                        operation["security"] = [{"JuryBasic": []}]
        app.openapi_schema = schema
    return app.openapi_schema


app.openapi = openapi_schema
