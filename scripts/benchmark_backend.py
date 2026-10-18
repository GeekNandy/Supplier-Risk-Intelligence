"""Offline warm-cache benchmark and same-input context-size comparison; no paid calls."""

import json
from statistics import median
from time import perf_counter

from app import data
from app.research import SourceBook


def timed(function, repeats=25):
    function()  # Exclude one-time dataset loading and cache construction.
    samples = []
    for _ in range(repeats):
        started = perf_counter()
        function()
        samples.append((perf_counter() - started) * 1000)
    return round(median(samples), 3)


def main():
    ids = [f"SUPP_{index:05d}" for index in range(1, 21)]
    result = {
        "metadata_median_ms": timed(data.metadata),
        "compare_20_median_ms": timed(lambda: data.compare_suppliers(ids)),
        "search_median_ms": timed(data.search_suppliers),
    }
    book = SourceBook("2026-10-18T12:00:00Z")
    for index in range(20):
        book.add(
            [
                {
                    "url": f"https://example.com/evidence/{index}",
                    "raw_content": f"Evidence {index}: " + "x" * 6000,
                }
            ]
        )
    original = len(json.dumps(list(book.items.values())))
    compact = len(json.dumps(book.context()))
    result.update(
        original_context_characters=original,
        compact_context_characters=compact,
        context_character_reduction_percent=round(100 * (1 - compact / original), 1),
        note="25 warm-cache samples; synthetic 20-source fixture. Characters are not billed tokens.",
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
