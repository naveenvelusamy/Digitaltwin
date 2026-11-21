from typing import Literal

from networkx import DiGraph, topological_sort

from .models import Dependency, HealthStatus, Service


SERVICES: dict[str, dict[str, str]] = {
    "dotnet-demo": {"name": "Demo .NET Service", "kind": "ASP.NET Core"},
    "postgresql": {"name": "PostgreSQL", "kind": "database"},
}

DEPENDENCY_RECORDS = [
    ("dotnet-demo", "postgresql"),
]


def build_graph() -> DiGraph:
    graph = DiGraph()
    graph.add_nodes_from(SERVICES)
    graph.add_edges_from(DEPENDENCY_RECORDS)
    return graph


def dependencies() -> list[Dependency]:
    return [Dependency(source=source, target=target) for source, target in DEPENDENCY_RECORDS]


def derive_statuses(
    database_status: HealthStatus,
    database_detail: str,
    database_source: Literal["real", "simulated"],
    app_status: HealthStatus,
    app_detail: str,
) -> list[Service]:
    statuses = {
        "dotnet-demo": app_status,
        "postgresql": database_status,
    }
    sources: dict[str, Literal["real", "derived", "simulated"]] = {
        "dotnet-demo": "real",
        "postgresql": database_source,
    }
    details = {
        "dotnet-demo": app_detail,
        "postgresql": database_detail,
    }

    graph = build_graph()
    for service_id in reversed(list(topological_sort(graph))):
        if statuses[service_id] != HealthStatus.HEALTHY:
            continue

        unhealthy_dependencies = [
            dependency
            for dependency in graph.successors(service_id)
            if statuses[dependency] != HealthStatus.HEALTHY
        ]
        if unhealthy_dependencies:
            statuses[service_id] = HealthStatus.DEGRADED
            sources[service_id] = "derived"
            dependency_names = [
                SERVICES[dependency]["name"] for dependency in unhealthy_dependencies
            ]
            details[service_id] = (
                "Service is live, but dependency health is degraded: "
                + ", ".join(dependency_names)
            )

    return [
        Service(
            id=service_id,
            name=metadata["name"],
            kind=metadata["kind"],
            status=statuses[service_id],
            status_source=sources[service_id],
            detail=details[service_id],
        )
        for service_id, metadata in SERVICES.items()
    ]
