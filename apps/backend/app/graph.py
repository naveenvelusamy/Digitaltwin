from networkx import DiGraph

from .models import Dependency, HealthStatus, Service


SERVICES: dict[str, dict[str, str]] = {
    "member-portal": {"name": "Member Portal", "kind": "frontend"},
    "api-gateway": {"name": "API Gateway", "kind": "gateway"},
    "account-service": {"name": "Account Service", "kind": "service"},
    "order-service": {"name": "Order Service", "kind": "service"},
    "payment-service": {"name": "Payment Service", "kind": "service"},
    "postgresql": {"name": "PostgreSQL", "kind": "database"},
}

DEPENDENCY_RECORDS = [
    ("member-portal", "api-gateway"),
    ("api-gateway", "account-service"),
    ("api-gateway", "order-service"),
    ("api-gateway", "payment-service"),
    ("account-service", "postgresql"),
    ("order-service", "postgresql"),
    ("payment-service", "postgresql"),
]


def build_graph() -> DiGraph:
    graph = DiGraph()
    graph.add_nodes_from(SERVICES)
    graph.add_edges_from(DEPENDENCY_RECORDS)
    return graph


def dependencies() -> list[Dependency]:
    return [Dependency(source=source, target=target) for source, target in DEPENDENCY_RECORDS]


def derive_statuses(database_status: HealthStatus, database_detail: str) -> list[Service]:
    statuses: dict[str, HealthStatus] = {}
    sources: dict[str, str] = {}
    details: dict[str, str] = {}

    statuses["postgresql"] = database_status
    sources["postgresql"] = "real"
    details["postgresql"] = database_detail

    graph = build_graph()
    for service_id in reversed(list(graph.nodes)):
        if service_id in statuses:
            continue

        dependencies = list(graph.successors(service_id))
        direct_dependency_statuses = [statuses.get(dependency) for dependency in dependencies]

        if HealthStatus.FAILED in direct_dependency_statuses:
            statuses[service_id] = HealthStatus.DEGRADED
            details[service_id] = "Dependency check reports PostgreSQL unavailable"
        elif HealthStatus.DEGRADED in direct_dependency_statuses:
            statuses[service_id] = HealthStatus.DEGRADED
            details[service_id] = "One or more downstream dependencies are degraded"
        else:
            statuses[service_id] = HealthStatus.HEALTHY
            details[service_id] = "No unhealthy dependency detected; no direct probe is configured"
        sources[service_id] = "derived"

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
