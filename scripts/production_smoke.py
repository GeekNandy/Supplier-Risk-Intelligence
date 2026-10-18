"""Exercise an installed backend and built frontend through a real HTTP server.

This check clears AI keys in its child process and uses temporary jury credentials.
It makes no paid provider calls and terminates the server even if a check fails.
"""

import argparse
import base64
import json
import os
import re
import secrets
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--python",
        required=True,
        help="Python interpreter in the environment to verify",
    )
    parser.add_argument("--app-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--require-installed", action="store_true")
    args = parser.parse_args()
    root, interpreter = Path(args.app_root).resolve(), str(Path(args.python).absolute())
    if not (root / "frontend" / "dist" / "index.html").is_file():
        raise SystemExit("Build the frontend first: npm --prefix frontend run build")
    environment = os.environ.copy()
    for name in (
        "PYTHONPATH",
        "DATA_PATH",
        "CRITERIA_PATH",
        "LLM_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL",
        "LLM_EXTRA_BODY",
        "TAVILY_API_KEY",
    ):
        environment.pop(name, None)
    # Empty values prevent any checkout .env from activating external providers.
    environment.update(
        {
            name: ""
            for name in ("LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL", "TAVILY_API_KEY")
        }
    )
    password = secrets.token_urlsafe(24)
    environment.update(
        APP_ROOT=str(root),
        JURY_USERNAME="smoke-jury",
        JURY_PASSWORD=password,
        REQUIRE_JURY_AUTH="true",
        REQUIRE_LIVE_AI="false",
    )
    token = base64.b64encode(f"smoke-jury:{password}".encode()).decode()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    # Use an unrelated working directory to catch accidental source-tree imports.
    with tempfile.TemporaryDirectory(prefix="supplier-production-") as temporary:
        location = subprocess.check_output(
            [interpreter, "-c", "import app; print(app.__file__)"],
            cwd=temporary,
            env=environment,
            text=True,
        ).strip()
        if args.require_installed and Path(location).is_relative_to(root / "backend"):
            raise SystemExit(
                "Expected a wheel installation; this interpreter still imports the source checkout."
            )
        with tempfile.TemporaryFile(mode="w+") as log:
            process = subprocess.Popen(
                [
                    interpreter,
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(port),
                ],
                cwd=temporary,
                env=environment,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            opener = build_opener(ProxyHandler({}))

            def call(path, body=None, login=True):
                headers = {"Content-Type": "application/json"}
                if login:
                    headers["Authorization"] = f"Basic {token}"
                request = Request(
                    f"http://127.0.0.1:{port}{path}",
                    data=json.dumps(body).encode() if body is not None else None,
                    headers=headers,
                )
                try:
                    with opener.open(request, timeout=5) as response:
                        return response.status, response.read()
                except HTTPError as error:
                    return error.code, error.read()

            try:
                deadline = time.monotonic() + 20
                while True:
                    try:
                        status, content = call("/api/ready", login=False)
                        if status == 200:
                            break
                        raise RuntimeError(f"Readiness returned HTTP {status}")
                    except (URLError, ConnectionError):
                        if process.poll() is not None or time.monotonic() >= deadline:
                            raise RuntimeError(
                                "Production server did not start"
                            ) from None
                        time.sleep(0.1)
                ready = json.loads(content)
                assert ready["supplier_count"] == 10_000 and ready["jury_auth_enabled"]
                assert call("/", login=False)[0] == 401
                assert call("/api/meta", login=False)[0] == 401
                status, html = call("/")
                assert status == 200 and b"<html" in html
                assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html.decode())
                assert assets and all(call(asset)[0] == 200 for asset in assets)
                assert call("/api/docs")[0] == call("/api/openapi.json")[0] == 200
                status, content = call("/api/suppliers?limit=20&max_total_risk=60")
                page = json.loads(content)
                assert status == 200 and len(page["items"]) == 20
                ids = [row["supplierID"] for row in page["items"]]
                status, content = call("/api/compare", {"supplier_ids": ids})
                assert status == 200 and len(json.loads(content)["suppliers"]) == 20
                status, content = call(
                    "/api/chat",
                    {
                        "message": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has lowest financial risk?"
                    },
                )
                answer = json.loads(content)
                assert status == 200 and answer["mode"] == "data_only"
                assert answer["suggested_supplier_ids"] == ["SUPP_00731"]
                status, content = call(
                    "/api/chat",
                    {"message": "Why is the Total Risk Index of SUPP_00018 so high?"},
                )
                assert (
                    status == 200 and json.loads(content)["evidence"][0]["value"] == 80
                )
                assert call("/api/research", {"company_name": "Acme Rail"})[0] == 503
                print(
                    "Production smoke passed: installed assets, jury login, readiness, 20-supplier comparison, chat and provider errors."
                )
            except BaseException:
                log.seek(0)
                print(log.read())
                raise
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    main()
