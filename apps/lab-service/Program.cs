using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("ConnectionStrings:Postgres must be configured.");

builder.Services
    .AddHealthChecks()
    .AddCheck(
        "postgresql",
        new PostgresHealthCheck(connectionString),
        tags: ["ready"]);

var app = builder.Build();

app.MapGet("/", () => Results.Ok(new
{
    service = "opsatlas-dotnet-demo",
    description = "Small ASP.NET Core lab service for infrastructure health monitoring.",
    health = "/health/live",
    readiness = "/health/ready"
}));

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResultStatusCodes =
    {
        [HealthStatus.Healthy] = StatusCodes.Status200OK,
        [HealthStatus.Degraded] = StatusCodes.Status200OK,
        [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable
    },
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        await JsonSerializer.SerializeAsync(context.Response.Body, new
        {
            status = report.Status.ToString().ToLowerInvariant(),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString().ToLowerInvariant(),
                detail = entry.Value.Description
            })
        });
    }
});

app.Run();

sealed class PostgresHealthCheck(string connectionString) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = new NpgsqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand("SELECT 1", connection);
            await command.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy("PostgreSQL accepted a real SELECT 1 probe.");
        }
        catch (NpgsqlException exception)
        {
            return HealthCheckResult.Unhealthy(
                $"PostgreSQL health probe failed: {exception.GetType().Name}");
        }
    }
}
