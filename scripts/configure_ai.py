"""Configure hosted model/search services locally without echoing API keys."""

import getpass
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values, set_key

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = "https://api.tokenfactory.us-central1.nebius.com/v1/"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"


def save_configuration(path: Path, values: dict[str, str]):
    """Preserve unrelated settings; python-dotenv quotes special characters."""
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=".env.setup-", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
        if path.exists():
            temporary.write(path.read_bytes())
    try:
        for name, value in values.items():
            set_key(str(temporary_path), name, value, quote_mode="always")
        if os.name != "nt":
            temporary_path.chmod(0o600)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def prompt(label: str, default: str) -> str:
    return input(f"{label} [{default}]: ").strip() or default


def main():
    if not sys.stdin.isatty():
        raise SystemExit(
            "Run this command in an interactive terminal so API keys can be entered without echoing."
        )
    path = ROOT / ".env"
    previous = dotenv_values(path) if path.exists() else {}
    configured = all(
        previous.get(key) for key in ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"]
    )
    print("Supplier Risk Intelligence: hosted AI setup")
    print(
        "Generate keys in your provider dashboards first. Paste them only into the hidden prompts below."
    )
    print(
        "For API keys, Enter keeps the existing value, or skips that provider if no key is saved."
    )
    print(
        "The default endpoint/model pair comes from the official Nebius Nemotron Super example."
    )
    base = prompt(
        "Model API base URL (use your dashboard's regional URL)",
        previous.get("LLM_BASE_URL") if configured else DEFAULT_BASE,
    )
    model = prompt("Exact model ID", previous.get("LLM_MODEL") or DEFAULT_MODEL)
    parsed = urlsplit(base)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit(
            "Use an HTTPS API base URL without credentials, a query string or fragment."
        )
    if parsed.path.rstrip("/").endswith("/chat/completions"):
        raise SystemExit(
            "Use the API prefix ending in /v1/, not the full /chat/completions URL."
        )
    key = (
        getpass.getpass("Nebius/model API key (hidden): ").strip()
        or previous.get("LLM_API_KEY")
        or ""
    )
    search_key = (
        getpass.getpass("Tavily API key (hidden): ").strip()
        or previous.get("TAVILY_API_KEY")
        or ""
    )
    save_configuration(
        path,
        {
            "LLM_BASE_URL": base,
            "LLM_MODEL": model,
            "LLM_API_KEY": key,
            "TAVILY_API_KEY": search_key,
            "LLM_EXTRA_BODY": previous.get("LLM_EXTRA_BODY") or "{}",
            "CORS_ORIGINS": previous.get("CORS_ORIGINS") or "http://localhost:5173",
        },
    )
    print(
        "Saved .env. API keys were not displayed; unrelated existing settings were preserved."
    )
    print(
        "Model key configured:", "yes" if key else "no (chat will use data-only mode)"
    )
    print(
        "Search key configured:",
        "yes" if search_key else "no (research is unavailable)",
    )
    print("Restart the backend: uvicorn app.main:app --reload --port 8000")
    print(
        "Then check it in another terminal: python scripts/smoke_ai.py --require-live"
    )


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        raise SystemExit(
            "Setup cancelled. Check .env before restarting the backend."
        ) from None
