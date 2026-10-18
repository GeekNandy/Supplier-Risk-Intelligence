import pytest


@pytest.fixture(autouse=True)
def isolated_server_configuration(monkeypatch):
    """Tests never consume local API keys or depend on a developer's jury login."""
    for name in (
        "LLM_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL",
        "TAVILY_API_KEY",
        "LLM_EXTRA_BODY",
        "JURY_USERNAME",
        "JURY_PASSWORD",
        "REQUIRE_JURY_AUTH",
        "REQUIRE_LIVE_AI",
    ):
        monkeypatch.delenv(name, raising=False)
