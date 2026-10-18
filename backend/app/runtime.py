"""Resolve deployment assets independently of the installed package location."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(os.getenv("APP_ROOT", Path(__file__).resolve().parents[2])).resolve()
load_dotenv(ROOT / ".env")


def enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}
