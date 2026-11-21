# OpsAtlas

OpsAtlas is a local-first infrastructure digital twin prototype for the Alegeus internal hackathon.

## Current milestone

The repository starts with a FastAPI topology API and a local PostgreSQL lab. PostgreSQL status is obtained through a real `SELECT 1` probe. Service impact is derived through a declared dependency graph and is labeled as derived data.

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Topology: http://localhost:8000/api/v1/topology

## Simulated demo outage

```bash
curl -X POST http://localhost:8000/api/v1/lab/postgres/outage
curl http://localhost:8000/api/v1/topology
curl -X POST http://localhost:8000/api/v1/lab/postgres/recovery
```

The outage endpoint is an explicit demo override. It is not a real infrastructure outage. The topology response clearly distinguishes real, derived and simulated status.

## Test backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/backend/requirements.txt
PYTHONPATH=apps/backend pytest apps/backend/tests
```
