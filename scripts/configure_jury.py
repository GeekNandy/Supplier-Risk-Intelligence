"""Save jury login locally using a hidden, confirmed password prompt."""

import getpass
import sys

from configure_ai import ROOT, save_configuration
from dotenv import dotenv_values


def main():
    if not sys.stdin.isatty():
        raise SystemExit(
            "Run this command in an interactive terminal to enter a hidden password."
        )
    path = ROOT / ".env"
    previous = dotenv_values(path)
    username = (
        input(f"Jury username [{previous.get('JURY_USERNAME') or 'jury'}]: ").strip()
        or previous.get("JURY_USERNAME")
        or "jury"
    )
    if ":" in username:
        raise SystemExit("The username cannot contain a colon.")
    password = getpass.getpass("Jury password (hidden, at least 12 characters): ")
    if len(password) < 12:
        raise SystemExit("Use at least 12 characters. Configuration was not changed.")
    if password != getpass.getpass("Confirm password (hidden): "):
        raise SystemExit("Passwords did not match. Configuration was not changed.")
    save_configuration(
        path,
        {
            "JURY_USERNAME": username,
            "JURY_PASSWORD": password,
            "REQUIRE_JURY_AUTH": "true",
        },
    )
    print(
        "Jury access saved. Restart the backend, then open the app to check the browser login."
    )
    print("Use HTTPS for the deployed app. Share the jury credentials privately.")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        raise SystemExit(
            "Jury setup cancelled; existing settings were preserved."
        ) from None
