import os
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from app import data
from app.models import ChatRequest, CompareRequest, ResearchRequest

app = FastAPI(title="Supplier Risk Intelligence", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "dataset_present": data.DATA_PATH.is_file()}


def data_call(function, *args, **kwargs):
    try:
        return function(*args, **kwargs)
    except FileNotFoundError:
        raise HTTPException(503, "Dataset missing. Run python scripts/download_data.py from the repository root.") from None
    except KeyError as error:
        raise HTTPException(404, f"Supplier not found: {error.args[0]}") from None
    except ValueError as error:
        raise HTTPException(400, str(error)) from None


@app.get("/api/meta")
def meta():
    return data_call(data.metadata)


@app.get("/api/suppliers")
def list_suppliers(q: str = "", risk_level: str | None = None,
                   sort_by: str = "Total_Risk_Index", order: Literal["asc", "desc"] = "asc",
                   offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)):
    return data_call(data.search_suppliers, q, risk_level, sort_by, order == "desc", offset, limit)


@app.get("/api/suppliers/{supplier_id}")
def supplier_detail(supplier_id: str):
    return data_call(data.get_supplier, supplier_id)


@app.post("/api/compare")
def compare(request: CompareRequest):
    return data_call(data.compare_suppliers, request.supplier_ids, request.rank_by)


@app.post("/api/chat")
def chat(request: ChatRequest):
    raise HTTPException(501, "Chat integration is not implemented in this starter. See app/chat.py and docs/API.md.")


@app.post("/api/research")
def research(request: ResearchRequest):
    raise HTTPException(501, "Research integration is not implemented in this starter. See app/research.py and docs/API.md.")


# After `npm run build`, one Python process can also serve the frontend.
frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")

