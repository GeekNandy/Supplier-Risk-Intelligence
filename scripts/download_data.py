"""Download the original public challenge inputs; no sample data is fabricated."""
import csv
from pathlib import Path
from urllib.request import urlopen

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ASSETS = {
    "supplier_risk_dataset.csv": "https://gzvqcrohgpzewcnfecrk.supabase.co/storage/v1/object/public/techeurope-assets/track-media/d75d25545e03.csv",
    "risk_criteria_description.md": "https://gzvqcrohgpzewcnfecrk.supabase.co/storage/v1/object/public/techeurope-assets/track-media/4aeecb7bef24.md",
}

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for filename, url in ASSETS.items():
        with urlopen(url, timeout=30) as response:
            content = response.read()
        destination = DATA_DIR / filename
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes(content)
        temporary.replace(destination)
        print(f"Saved {filename}: {len(content):,} bytes")
    with (DATA_DIR / "supplier_risk_dataset.csv").open(encoding="utf-8-sig", newline="") as source:
        print(f"Supplier rows: {sum(1 for _ in csv.DictReader(source)):,}")

