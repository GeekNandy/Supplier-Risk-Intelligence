# Supplier Risk API

FastAPI backend for the Siemens Supplier Risk Intelligence hackathon.

Run from the repository root after installing the locked dependencies:

```bash
python -m pip install --require-hashes -r backend/requirements-dev.lock
python -m pip install --no-deps -e backend
python -m uvicorn app.main:app --port 8000
```

The root README contains the team handoff and setup instructions. API contracts,
deployment steps and verification results are under the repository's `docs/`.
API keys and jury credentials belong in the root `.env` or deployment secrets.

An installed wheel needs `APP_ROOT` set to the repository or deployed asset root,
which contains `data/` and the built `frontend/dist/`. Docker sets this to `/app`.
The anonymized challenge data remains in the repository, outside the wheel.
