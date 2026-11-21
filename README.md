# OpsAtlas

OpsAtlas is a local-first infrastructure digital twin prototype for the Alegeus internal hackathon.

## Current milestone

The repository includes a FastAPI topology API, an interactive Next.js dashboard, a small ASP.NET Core lab service, and PostgreSQL. OpsAtlas probes the .NET service's liveness endpoint and PostgreSQL with a real `SELECT 1`; service impact is derived from their dependency graph. This is an infrastructure-health demo, not a business application.

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

- Dashboard: http://localhost:3000
- .NET service: http://localhost:8080
- .NET liveness: http://localhost:8080/health/live
- .NET readiness (checks PostgreSQL): http://localhost:8080/health/ready
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Topology: http://localhost:8000/api/v1/topology

## Simulated demo outage

```bash
curl -X POST http://localhost:8000/api/v1/lab/postgres/outage
curl http://localhost:8000/api/v1/topology
curl -X POST http://localhost:8000/api/v1/lab/postgres/recovery
```

The outage endpoint is an explicit demo override. It is not a real infrastructure outage. The topology response distinguishes real .NET/PostgreSQL probes from derived dependency status and the simulated override.

## AKS deployment target

The .NET service has a Kubernetes Deployment and ClusterIP Service in `deploy/aks`. These manifests are a hackathon deployment target; they do not create an AKS cluster or Azure resources. They expect PostgreSQL to be reachable from the cluster. For a real Azure deployment, use a managed database rather than running this demo database as a production workload in AKS.

1. Build and push the image to an Azure Container Registry your AKS cluster can pull from:

   ```bash
   az acr build --registry <ACR_NAME> --image opsatlas-dotnet-demo:0.1.0 ./apps/lab-service
   ```

2. Set `image` in `deploy/aks/dotnet-demo.yaml` to `<ACR_NAME>.azurecr.io/opsatlas-dotnet-demo:0.1.0`, then create the namespace and database connection secret:

   ```bash
   kubectl apply -f deploy/aks/namespace.yaml
   kubectl -n opsatlas-lab create secret generic opsatlas-db \
     --from-literal=connection-string='Host=<DB_HOST>;Database=<DB_NAME>;Username=<DB_USER>;Password=<DB_PASSWORD>;SSL Mode=Require'
   kubectl apply -f deploy/aks/dotnet-demo.yaml
   ```

   Replace placeholders locally; do not commit real connection strings. Ensure AKS can pull from the ACR and reach the database endpoint.

3. Check rollout and service health:

   ```bash
   kubectl -n opsatlas-lab rollout status deployment/dotnet-demo
   kubectl -n opsatlas-lab get pods,services
   ```

The manifest includes startup, liveness, and readiness probes, non-root execution, resource requests/limits, and a secret reference. It deploys only the .NET demo service; the current OpsAtlas API/dashboard remain local Compose services.

## Vercel frontend preview

The Next.js dashboard can be deployed separately to Vercel from the GitHub repository:

1. Import the repository in Vercel.
2. Set **Root Directory** to `apps/frontend`.
3. Use the `feature/infra-dashboard-polish` branch or another branch you want Vercel to deploy.
4. Keep the default Next.js build and output settings, then deploy.

This is a frontend-only deployment. The API, .NET demo service, and PostgreSQL remain on the local Docker network, so a Vercel-hosted browser cannot reach them. Without a public API, the page will say the backend is not configured, show no live topology, and disable the lab outage controls. Do not set `NEXT_PUBLIC_OPSATLAS_API_URL` to `localhost` in Vercel; that would refer to each visitor's own computer. To enable live monitoring later, deploy the API and lab dependencies to a reachable, secured environment and set `NEXT_PUBLIC_OPSATLAS_API_URL` to its public HTTPS API base URL in Vercel, then redeploy. Do not expose the demo API or database publicly without adding appropriate authentication and network controls.

## Test backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/backend/requirements.txt
PYTHONPATH=apps/backend pytest apps/backend/tests
```
