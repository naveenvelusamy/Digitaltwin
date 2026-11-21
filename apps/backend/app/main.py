import os

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graph import dependencies, derive_statuses
from .models import HealthStatus, LabOutageResponse, Topology

app = FastAPI(title="OpsAtlas API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulated_database_outage = False


async def check_postgres() -> tuple[HealthStatus, str]:
    if simulated_database_outage:
        return HealthStatus.FAILED, "SIMULATED outage: PostgreSQL unavailable (demo override)"

    try:
        connection = await asyncpg.connect(
            host=os.getenv("DATABASE_HOST", "localhost"),
            port=int(os.getenv("DATABASE_PORT", "5432")),
            database=os.getenv("DATABASE_NAME", "opsatlas"),
            user=os.getenv("DATABASE_USER", "opsatlas"),
            password=os.getenv("DATABASE_PASSWORD", "opsatlas-dev-only"),
            timeout=2,
        )
        await connection.execute("SELECT 1")
        await connection.close()
        return HealthStatus.HEALTHY, "PostgreSQL accepted a real SELECT 1 health probe"
    except (asyncpg.PostgresError, OSError, TimeoutError) as exc:
        return HealthStatus.FAILED, f"PostgreSQL health probe failed: {type(exc).__name__}"


@app.get("/api/v1/health")
async def health() -> dict:
    return {"status": "ok", "service": "opsatlas-backend"}


@app.get("/api/v1/topology", response_model=Topology)
async def topology() -> Topology:
    database_status, database_detail = await check_postgres()
    return Topology(
        telemetry_label="Real: PostgreSQL probe; derived: dependency impact; simulated outage: explicit demo override",
        services=derive_statuses(database_status, database_detail),
        dependencies=dependencies(),
    )


@app.post("/api/v1/lab/postgres/outage", response_model=LabOutageResponse)
async def set_postgres_outage() -> LabOutageResponse:
    global simulated_database_outage
    simulated_database_outage = True
    return LabOutageResponse(
        active=True,
        message="Simulated PostgreSQL outage enabled. This demo override is not a Docker or host outage.",
    )


@app.post("/api/v1/lab/postgres/recovery", response_model=LabOutageResponse)
async def clear_postgres_outage() -> LabOutageResponse:
    global simulated_database_outage
    simulated_database_outage = False
    return LabOutageResponse(
        active=False,
        message="Simulated PostgreSQL outage cleared. A real health probe is used again.",
    )
