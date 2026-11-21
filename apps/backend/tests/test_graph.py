from app.graph import derive_statuses
from app.models import HealthStatus


def test_database_failure_degrades_live_dotnet_service():
    services = derive_statuses(
        HealthStatus.FAILED,
        "probe failed",
        "real",
        HealthStatus.HEALTHY,
        "liveness probe passed",
    )
    status_by_id = {service.id: service.status for service in services}
    source_by_id = {service.id: service.status_source for service in services}

    assert status_by_id["postgresql"] == HealthStatus.FAILED
    assert status_by_id["dotnet-demo"] == HealthStatus.DEGRADED
    assert source_by_id["dotnet-demo"] == "derived"


def test_healthy_probes_keep_services_healthy():
    services = derive_statuses(
        HealthStatus.HEALTHY,
        "database probe passed",
        "real",
        HealthStatus.HEALTHY,
        "liveness probe passed",
    )

    assert all(service.status == HealthStatus.HEALTHY for service in services)


def test_failed_dotnet_liveness_is_reported_as_real_failure():
    services = derive_statuses(
        HealthStatus.HEALTHY,
        "database probe passed",
        "real",
        HealthStatus.FAILED,
        ".NET service unavailable",
    )
    status_by_id = {service.id: service.status for service in services}
    source_by_id = {service.id: service.status_source for service in services}

    assert status_by_id["dotnet-demo"] == HealthStatus.FAILED
    assert source_by_id["dotnet-demo"] == "real"


def test_demo_outage_is_labeled_simulated_and_impact_is_derived():
    services = derive_statuses(
        HealthStatus.FAILED,
        "simulated database outage",
        "simulated",
        HealthStatus.HEALTHY,
        "liveness probe passed",
    )
    service_by_id = {service.id: service for service in services}

    assert service_by_id["postgresql"].status_source == "simulated"
    assert service_by_id["dotnet-demo"].status == HealthStatus.DEGRADED
    assert service_by_id["dotnet-demo"].status_source == "derived"
