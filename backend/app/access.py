"""Optional HTTP Basic jury access covering both the frontend and API."""

import base64
import binascii
import os
import secrets
from dataclasses import dataclass

from starlette.responses import JSONResponse

from app.runtime import enabled

BODY_LIMIT = 65_536
PUBLIC_CHECKS = {"/api/health", "/api/ready"}


@dataclass(frozen=True)
class JuryAccess:
    username: str
    password: str

    @property
    def configured(self):
        return bool(self.username and self.password)


def jury_access() -> JuryAccess:
    access = JuryAccess(os.getenv("JURY_USERNAME", "").strip(), os.getenv("JURY_PASSWORD", ""))
    if bool(access.username) != bool(access.password):
        raise ValueError(
            "Set both JURY_USERNAME and JURY_PASSWORD, or clear both for local development."
        )
    if access.configured and (":" in access.username or len(access.password) < 12):
        raise ValueError(
            "Jury usernames cannot contain a colon; use a jury password of at least 12 characters."
        )
    if enabled("REQUIRE_JURY_AUTH") and not access.configured:
        raise ValueError(
            "Jury access is required. Set JURY_USERNAME and JURY_PASSWORD on the server."
        )
    return access


def authorized(header: str, access: JuryAccess) -> bool:
    try:
        scheme, encoded = header.split(" ", 1)
        if scheme.lower() != "basic" or len(encoded) > 8192:
            return False
        username, password = base64.b64decode(encoded, validate=True).decode("utf-8").split(":", 1)
    except (ValueError, UnicodeError, binascii.Error):
        return False
    username_ok = secrets.compare_digest(username.encode(), access.username.encode())
    password_ok = secrets.compare_digest(password.encode(), access.password.encode())
    return username_ok and password_ok


class AccessMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        # CORS handles browser preflight; platform health checks need no login.
        public = scope["path"] in PUBLIC_CHECKS and scope["method"] in {"GET", "HEAD"}
        if not public and scope["method"] != "OPTIONS":
            try:
                access = jury_access()
            except ValueError as error:
                return await JSONResponse({"detail": str(error)}, status_code=503)(
                    scope, receive, send
                )
            headers = dict(scope["headers"])
            if access.configured and not authorized(
                headers.get(b"authorization", b"").decode("latin-1"), access
            ):
                return await JSONResponse(
                    {"detail": "Jury login required."},
                    status_code=401,
                    headers={
                        "WWW-Authenticate": 'Basic realm="Supplier Risk Jury", charset="UTF-8"',
                        "Cache-Control": "no-store",
                    },
                )(scope, receive, send)
        if scope["path"].startswith("/api/") and scope["method"] == "POST":
            # Bound actual streamed bytes as well as Content-Length.
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > BODY_LIMIT:
                    return await JSONResponse(
                        {"detail": "Request body exceeds 64 KiB."}, status_code=413
                    )(scope, receive, send)
                body.extend(chunk)
                if not message.get("more_body", False):
                    break

            async def buffered_receive():
                return {"type": "http.request", "body": bytes(body), "more_body": False}

            return await self.app(scope, buffered_receive, send)
        return await self.app(scope, receive, send)
