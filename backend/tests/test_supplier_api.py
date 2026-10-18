from fastapi.testclient import TestClient

from app import data
from app.main import app

client = TestClient(app)


def test_challenge_example_uses_lower_financial_score_as_lower_risk():
    response = client.post("/api/compare", json={
        "supplier_ids": ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
        "rank_by": "Financial_Health_Score",
    })
    assert response.status_code == 200
    result = response.json()
    assert [row["Financial_Health_Score"] for row in result["suppliers"]] == [54, 65, 53]
    assert result["lowest_risk_supplier_ids"] == ["SUPP_00731"]


def test_ties_and_missing_scores_do_not_create_a_false_winner(monkeypatch):
    rows = tuple({
        "supplierID": name, "Supplier Name": name,
        "Total_Risk_Index": score, "Total_Risk_Index_Level": "Medium",
        "Financial_Health_Score": score,
    } for name, score in [("A", 20), ("B", 20), ("C", None)])
    monkeypatch.setattr(data, "suppliers", lambda: rows)
    comparison = data.compare_suppliers(["A", "B", "C"])
    assert comparison["lowest_risk_supplier_ids"] == ["A", "B"]
    assert data.compare_suppliers(["C"])["lowest_risk_supplier_ids"] == []
    assert data.search_suppliers(descending=True)["items"][-1]["supplierID"] == "C"


def test_comparison_enforces_twenty_unique_known_suppliers():
    assert client.post("/api/compare", json={"supplier_ids": ["SUPP_00012"] * 2}).status_code == 422
    assert client.post("/api/compare", json={"supplier_ids": [f"SUPP_{i:05d}" for i in range(1, 22)]}).status_code == 422
    assert client.post("/api/compare", json={"supplier_ids": ["DOES_NOT_EXIST"]}).status_code == 404


def test_invalid_sort_fields_are_rejected_and_dataset_is_complete():
    assert client.get("/api/suppliers", params={"sort_by": "made_up_field"}).status_code == 400
    metadata = client.get("/api/meta").json()
    assert metadata["row_count"] == 10_000
    assert "Financial_Health_Score" in metadata["risk_fields"]
    assert "Supplier Delivery Rating" not in metadata["risk_fields"]

