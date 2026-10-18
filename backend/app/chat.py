"""Implementation seam for the grounded chatbot; see docs/API.md.

Expose data.get_supplier, data.search_suppliers and data.compare_suppliers as
validated LLM tools. Compute values in Python and cite supplier IDs + fields.
Do not execute generated Python/SQL, send the whole CSV, or invert risk scores.
"""

