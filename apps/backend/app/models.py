from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    FAILED = "failed"


class Service(BaseModel):
    id: str
    name: str
    kind: str
    status: HealthStatus
    status_source: Literal["real", "derived", "simulated"]
    detail: str


class Dependency(BaseModel):
    source: str
    target: str


class Topology(BaseModel):
    telemetry_label: str = Field(
        description="Explicitly distinguishes real probes from simulated or derived status"
    )
    services: list[Service]
    dependencies: list[Dependency]


class LabOutageResponse(BaseModel):
    simulated: bool = True
    active: bool
    message: str
