import json
import os
import runpy
from pathlib import Path
from types import SimpleNamespace

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


def run_setup(tmp_path, monkeypatch, keys):
    main = runpy.run_path(str(SCRIPT))["main"]
    prompts = iter(keys)
    monkeypatch.setitem(main.__globals__, "ROOT", tmp_path)
    monkeypatch.setitem(
        main.__globals__, "sys", SimpleNamespace(stdin=SimpleNamespace(isatty=lambda: True))
    )
    monkeypatch.setitem(main.__globals__, "input", lambda _: "")
    monkeypatch.setitem(
        main.__globals__, "getpass", SimpleNamespace(getpass=lambda _: next(prompts))
    )
    main()
    return dotenv_values(tmp_path / ".env")


def test_fresh_setup_uses_working_nemotron_report_settings(tmp_path, monkeypatch, capsys):
    # Reproduce a checkout copied from the older starter's blank configuration.
    (tmp_path / ".env").write_text("LLM_MODEL=\nLLM_EXTRA_BODY={}\n")
    values = run_setup(tmp_path, monkeypatch, ["test-model-secret", "test-search-secret"])
    assert values["LLM_BASE_URL"] == "https://api.tokenfactory.nebius.com/v1/"
    assert values["LLM_MODEL"] == "nvidia/Nemotron-3.5-Super-VL"
    assert json.loads(values["LLM_EXTRA_BODY"])["chat_template_kwargs"]["enable_thinking"] is False
    output = capsys.readouterr().out
    assert "test-model-secret" not in output and "test-search-secret" not in output


def test_setup_keeps_custom_endpoint_before_key_is_added(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text(
        "LLM_BASE_URL=https://custom.example/v1/\nLLM_MODEL=custom-model\nLLM_API_KEY=\n"
        "LLM_EXTRA_BODY='{\"temperature\":0.2}'\nTAVILY_API_KEY=existing-search-key\n"
        "CUSTOM_SETTING=keep-me\n"
    )
    values = run_setup(tmp_path, monkeypatch, ["new-model-key", ""])
    assert values["LLM_BASE_URL"] == "https://custom.example/v1/"
    assert values["LLM_MODEL"] == "custom-model"
    assert values["LLM_API_KEY"] == "new-model-key"
    assert values["TAVILY_API_KEY"] == "existing-search-key"
    assert json.loads(values["LLM_EXTRA_BODY"]) == {"temperature": 0.2}
    assert values["CUSTOM_SETTING"] == "keep-me"
