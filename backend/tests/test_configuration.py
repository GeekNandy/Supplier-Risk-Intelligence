import os
import runpy
from pathlib import Path

import pytest
from dotenv import dotenv_values

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "configure_ai.py"


def test_configuration_preserves_other_settings_and_quotes_keys(tmp_path, capsys):
    save = runpy.run_path(str(SCRIPT))["save_configuration"]
    path = tmp_path / ".env"
    path.write_text(
        "# Existing deployment settings\nCORS_ORIGINS=https://example.com\nCUSTOM_SETTING=keep-me\nLLM_API_KEY=old-key\n"
    )
    key = "test-key'with#special=characters"
    save(path, {"LLM_API_KEY": key, "TAVILY_API_KEY": "test-search-key"})
    values = dotenv_values(path)
    assert values["LLM_API_KEY"] == key
    assert values["CUSTOM_SETTING"] == "keep-me"
    assert values["CORS_ORIGINS"] == "https://example.com"
    assert "# Existing deployment settings" in path.read_text()
    assert key not in capsys.readouterr().out
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600


def test_configuration_failure_does_not_partially_replace_env(tmp_path, monkeypatch):
    save = runpy.run_path(str(SCRIPT))["save_configuration"]
    path = tmp_path / ".env"
    original = "LLM_API_KEY=existing-key\nCUSTOM_SETTING=keep-me\n"
    path.write_text(original)
    calls = 0
    real_set_key = save.__globals__["set_key"]

    def failing_write(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("simulated write failure")
        return real_set_key(*args, **kwargs)

    monkeypatch.setitem(save.__globals__, "set_key", failing_write)
    with pytest.raises(OSError):
        save(path, {"LLM_API_KEY": "new-key", "TAVILY_API_KEY": "new-search-key"})
    assert path.read_text() == original
    assert list(tmp_path.glob(".env.setup-*")) == []
