from app.graph import derive_statuses
from app.models import HealthStatus


def test_database_failure_degrades_only_dependent_services():
    services = derive_statuses(HealthStatus.FAILED, "probe failed")
    status_by_id = {service.id: service.status for service in services}

    assert status_by_id["postgresql"] == HealthStatus.FAILED
    assert status_by_id["account-service"] == HealthStatus.DEGRADED
    assert status_by_id["order-service"] == HealthStatus.DEGRADED
    assert status_by_id["payment-service"] == HealthStatus.DEGRADED
    assert status_by_id["api-gateway"] == HealthStatus.DEGRADED
    assert status_by_id["member-portal"] == HealthStatus.DEGRADED


def test_healthy_database_does_not_fail_services():
    services = derive_statuses(HealthStatus.HEALTHY, "probe passed")

    assert all(service.status == HealthStatus.HEALTHY for service in services)
