"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const API_URL =
  process.env.NEXT_PUBLIC_OPSATLAS_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

type HealthStatus = "healthy" | "degraded" | "failed";
type StatusSource = "real" | "derived" | "simulated";

type Service = {
  id: string;
  name: string;
  kind: string;
  status: HealthStatus;
  status_source: StatusSource;
  detail: string;
};

type Topology = {
  telemetry_label: string;
  services: Service[];
  dependencies: Array<{ source: string; target: string }>;
};

const statusStyles: Record<
  HealthStatus,
  { dot: string; border: string; badge: string; label: string }
> = {
  healthy: {
    dot: "bg-emerald-400",
    border: "border-emerald-500/60",
    badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    label: "Healthy",
  },
  degraded: {
    dot: "bg-amber-400",
    border: "border-amber-500/60",
    badge: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    label: "Degraded",
  },
  failed: {
    dot: "bg-red-400",
    border: "border-red-500/70",
    badge: "bg-red-500/10 text-red-300 ring-red-500/20",
    label: "Failed",
  },
};

function ServiceNode({ data, selected }: NodeProps<Node<{ service: Service }>>) {
  const service = data.service;
  const style = statusStyles[service.status];

  return (
    <div
      className={`min-w-[190px] rounded-xl border ${style.border} ${
        selected ? "ring-2 ring-sky-400/70" : ""
      } bg-[#0c1929] px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,.32)]`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-slate-500"
      />
      <div className="flex items-center gap-3">
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-300`}
        >
          {service.kind.toLowerCase().includes("database") ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
              <path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12v8.5" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-100">{service.name}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.13em] text-slate-500">
            {service.kind}
          </div>
        </div>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-slate-500"
      />
    </div>
  );
}

const nodeTypes = { service: ServiceNode };
const positionById: Record<string, { x: number; y: number }> = {
  "dotnet-demo": { x: 290, y: 70 },
  postgresql: { x: 290, y: 305 },
};

function sourceLabel(source: StatusSource) {
  if (source === "real") return "Real probe";
  if (source === "simulated") return "Simulated";
  return "Derived";
}

export default function Home() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [selectedId, setSelectedId] = useState("dotnet-demo");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refreshTopology() {
    if (!API_URL) {
      setTopology(null);
      setLastUpdated(null);
      setError("Public API URL is not configured. This Vercel deployment is frontend-only.");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/topology`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Topology request failed (${response.status})`);
      setTopology(await response.json());
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reach OpsAtlas API");
    }
  }

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshTopology(), 0);
    const interval = window.setInterval(() => void refreshTopology(), 3000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, []);

  async function runLabAction(action: "outage" | "recovery") {
    if (!API_URL) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/lab/postgres/${action}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`Lab action failed (${response.status})`);
      const result = await response.json();
      setActionMessage(result.message);
      await refreshTopology();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Lab action failed");
    } finally {
      setBusy(false);
    }
  }

  const nodes = useMemo<Node[]>(() => {
    if (!topology) return [];
    return topology.services.map((service) => ({
      id: service.id,
      type: "service",
      position: positionById[service.id] ?? { x: 290, y: 190 },
      data: { service },
    }));
  }, [topology]);

  const edges = useMemo<Edge[]>(() => {
    if (!topology) return [];
    return topology.dependencies.map((dependency) => {
      const target = topology.services.find((service) => service.id === dependency.target);
      const failed = target?.status === "failed";
      const unhealthy = target?.status === "degraded";
      const color = failed ? "#f05252" : unhealthy ? "#f5a524" : "#38bdf8";
      return {
        id: `${dependency.source}-${dependency.target}`,
        source: dependency.source,
        target: dependency.target,
        animated: failed || unhealthy,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        style: { stroke: color, strokeWidth: 1.8 },
      };
    });
  }, [topology]);

  const counts = useMemo(() => {
    const services = topology?.services ?? [];
    return {
      total: services.length,
      healthy: services.filter((service) => service.status === "healthy").length,
      degraded: services.filter((service) => service.status === "degraded").length,
      failed: services.filter((service) => service.status === "failed").length,
    };
  }, [topology]);

  const selectedService = topology?.services.find((service) => service.id === selectedId) ?? null;
  const hasUnhealthyService = counts.degraded + counts.failed > 0;
  const healthPercent =
    counts.total === 0 ? 0 : Math.round((counts.healthy / counts.total) * 100);
  const healthSegments = [
    { status: "healthy" as const, count: counts.healthy },
    { status: "degraded" as const, count: counts.degraded },
    { status: "failed" as const, count: counts.failed },
  ];
  let segmentStart = 0;
  const donutGradient =
    counts.total === 0
      ? "#1e293b 0% 100%"
      : healthSegments
          .filter((segment) => segment.count > 0)
          .map((segment) => {
            const start = segmentStart;
            segmentStart += (segment.count / counts.total) * 100;
            const color =
              segment.status === "healthy"
                ? "#27d98a"
                : segment.status === "degraded"
                  ? "#f5a524"
                  : "#f05252";
            return `${color} ${start}% ${segmentStart}%`;
          })
          .join(", ");

  return (
    <main className="min-h-screen bg-[#070e19] text-slate-100">
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#091321]/95 px-4 backdrop-blur-xl lg:px-6">
        <a href="#overview" className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-sky-400/30 bg-gradient-to-br from-sky-500/25 to-indigo-500/10 text-sky-300 shadow-[0_0_24px_rgba(14,165,233,.12)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="m12 2.8 8.5 4.8v9.1L12 21.5l-8.5-4.8V7.6L12 2.8Z" />
              <path d="m3.8 7.8 8.2 4.7 8.2-4.7M12 12.5v8.4M8 5l8.4 4.8" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide">OpsAtlas</div>
            <div className="text-[10px] text-slate-500">Infrastructure Digital Twin</div>
          </div>
        </a>

        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
          <span className="text-slate-500">ENVIRONMENT</span>
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="font-semibold text-amber-200">LOCAL LAB</span>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-[#0b1725] p-1 text-[11px]">
          <span className="rounded-lg border border-sky-400/20 bg-sky-500/15 px-3 py-2 font-semibold text-sky-200">
            Digital Twin
          </span>
          <span className="hidden px-3 py-2 text-slate-500 sm:inline">Observability · planned</span>
          <span className="hidden px-3 py-2 text-slate-500 md:inline">Incidents · planned</span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className={`h-2 w-2 rounded-full ${error ? "bg-red-400" : "bg-emerald-400"}`} />
          <span className={error ? "text-red-300" : "text-slate-400"}>
            {error ? "API disconnected" : "API connected"}
          </span>
          <span className="hidden text-slate-600 sm:inline">·</span>
          <span className="hidden text-slate-500 sm:inline">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : "Connecting…"}
          </span>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-64px)]">
        <aside className="sticky top-16 hidden h-[calc(100vh-64px)] w-[170px] shrink-0 flex-col border-r border-slate-800/80 bg-[#091321] p-3 md:flex">
          <div className="px-3 pb-3 pt-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Workspace
          </div>
          {[
            ["Overview", "#overview", "⌂"],
            ["Digital Twin", "#topology", "◈"],
            ["Service Health", "#health", "◎"],
            ["Lab Controls", "#lab", "⚙"],
          ].map(([label, href, icon], index) => (
            <a
              key={href}
              href={href}
              className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs transition ${
                index === 1
                  ? "border border-sky-400/15 bg-sky-500/10 text-sky-200"
                  : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
              }`}
            >
              <span className="w-4 text-center text-base">{icon}</span>
              {label}
            </a>
          ))}
          <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-[10px] font-semibold text-slate-300">Hackathon prototype</div>
            <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
              Real lab checks. No production connection.
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-3 sm:p-5 lg:p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              {error}
              {API_URL && (
                <>
                  {" "}Confirm the backend is running at <code>{API_URL}</code>.
                </>
              )}
            </div>
          )}

          <section id="overview" className="mb-5 scroll-mt-24">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400">
                  Operations overview
                </p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                  Infrastructure Digital Twin
                </h1>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[10px] text-slate-400">
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live polling every 3 seconds
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Services monitored",
                  value: counts.total,
                  hint: "Declared in current lab topology",
                  color: "text-slate-100",
                  icon: "◈",
                  iconColor: "text-sky-300",
                },
                {
                  label: "Healthy",
                  value: counts.healthy,
                  hint: "Passing current health checks",
                  color: "text-emerald-300",
                  icon: "✓",
                  iconColor: "text-emerald-300",
                },
                {
                  label: "Degraded",
                  value: counts.degraded,
                  hint: "Impact derived from dependencies",
                  color: "text-amber-300",
                  icon: "△",
                  iconColor: "text-amber-300",
                },
                {
                  label: "Failed",
                  value: counts.failed,
                  hint: "Direct check reports unavailable",
                  color: "text-red-300",
                  icon: "!",
                  iconColor: "text-red-300",
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="group rounded-xl border border-slate-800/90 bg-gradient-to-br from-[#101d2d] to-[#0b1522] p-4 shadow-[0_10px_30px_rgba(0,0,0,.12)] transition hover:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">{metric.label}</span>
                    <span className={`text-lg ${metric.iconColor}`}>{metric.icon}</span>
                  </div>
                  <div className={`mt-2 text-3xl font-semibold tracking-tight ${metric.color}`}>
                    {metric.value}
                  </div>
                  <div className="mt-1 text-[9px] text-slate-600">{metric.hint}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid items-stretch gap-4 2xl:grid-cols-[minmax(0,1fr)_330px]">
            <div
              id="topology"
              className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-800 bg-[#091321] shadow-[0_16px_50px_rgba(0,0,0,.18)]"
            >
              <div className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-sm font-semibold">Live service topology</h2>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Directed dependencies · click a service to inspect
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-[9px] text-slate-400">
                  {(["healthy", "degraded", "failed"] as const).map((status) => (
                    <span key={status} className="flex items-center gap-1.5">
                      <i className={`h-2 w-2 rounded-full ${statusStyles[status].dot}`} />
                      {statusStyles[status].label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-[390px] sm:h-[440px]">
                {topology ? (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.18 }}
                    nodesDraggable
                    nodesConnectable={false}
                    onNodeClick={(_, node) => setSelectedId(node.id)}
                    minZoom={0.45}
                    maxZoom={1.6}
                  >
                    <Background color="#1e293b" gap={22} />
                    <Controls showInteractive={false} />
                    <MiniMap
                      pannable
                      zoomable
                      nodeColor={(node) => {
                        const service = (node.data as { service: Service }).service;
                        return service.status === "failed"
                          ? "#f05252"
                          : service.status === "degraded"
                            ? "#f5a524"
                            : "#27d98a";
                      }}
                      maskColor="rgba(7,14,25,.75)"
                      className="!border !border-slate-700 !bg-[#0d1928]"
                    />
                  </ReactFlow>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-slate-500">
                    Waiting for topology data…
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-4 py-3 text-[9px] text-slate-500 sm:px-5">
                <span>{topology?.telemetry_label ?? "Awaiting live health probes"}</span>
                <span>Source: OpsAtlas lab API</span>
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <section className="rounded-2xl border border-slate-800 bg-gradient-to-b from-[#101b2c] to-[#0b1421] p-4 shadow-[0_16px_50px_rgba(0,0,0,.16)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-500/10 text-base text-violet-300">
                      ✦
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold">OpsAtlas Copilot</h2>
                      <p className="text-[9px] text-slate-500">Investigation workflow</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-1 text-[8px] uppercase tracking-wider text-slate-400">
                    Not connected
                  </span>
                </div>

                <div className="mt-4 rounded-xl border border-slate-800 bg-[#091321] p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-500">
                    Live evidence
                  </div>
                  {topology ? (
                    <div className="mt-2 space-y-2">
                      {topology.services.map((service) => (
                        <div key={service.id} className="flex items-start gap-2">
                          <span
                            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusStyles[service.status].dot}`}
                          />
                          <p className="text-[10px] leading-4 text-slate-300">
                            <span className="font-medium text-slate-200">{service.name}</span>
                            <span className="text-slate-500"> · {service.detail}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-slate-500">Waiting for real probe results.</p>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3">
                  <div className="text-[10px] font-medium text-violet-200">AI analysis is not enabled</div>
                  <p className="mt-1 text-[9px] leading-4 text-slate-500">
                    No root cause or confidence score is generated. This panel displays probe evidence only.
                  </p>
                </div>
                <button
                  disabled
                  title="AI investigation is not implemented yet"
                  className="mt-3 w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-[10px] font-semibold text-slate-500"
                >
                  Investigation workflow · planned
                </button>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-[#0d1726] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-semibold">Service details</h2>
                    <p className="mt-1 text-[9px] text-slate-500">Selected topology node</p>
                  </div>
                  {selectedService && (
                    <span
                      className={`rounded-full px-2 py-1 text-[8px] font-semibold uppercase ring-1 ${
                        statusStyles[selectedService.status].badge
                      }`}
                    >
                      {selectedService.status}
                    </span>
                  )}
                </div>
                {selectedService ? (
                  <div className="mt-3 border-t border-slate-800 pt-3">
                    <div className="text-xs font-medium text-slate-200">{selectedService.name}</div>
                    <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-2 text-[9px]">
                      <dt className="text-slate-500">Type</dt>
                      <dd className="text-slate-300">{selectedService.kind}</dd>
                      <dt className="text-slate-500">Status source</dt>
                      <dd className="text-slate-300">{sourceLabel(selectedService.status_source)}</dd>
                      <dt className="text-slate-500">Health detail</dt>
                      <dd className="leading-4 text-slate-300">{selectedService.detail}</dd>
                    </dl>
                  </div>
                ) : (
                  <p className="mt-3 text-[10px] text-slate-500">Select a service node to inspect it.</p>
                )}
              </section>
            </aside>
          </section>

          <section id="health" className="mt-4 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(230px,.8fr)_minmax(280px,1fr)_minmax(320px,1.3fr)]">
            <div className="rounded-2xl border border-slate-800 bg-[#0d1726] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold">Service health</h2>
                  <p className="mt-1 text-[9px] text-slate-500">Distribution of monitored nodes</p>
                </div>
                <span className="text-[9px] text-slate-500">{counts.total} total</span>
              </div>
              <div className="mt-4 flex items-center gap-5">
                <div
                  className="grid h-[102px] w-[102px] shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(${donutGradient})` }}
                  aria-label={`${healthPercent}% of services healthy`}
                >
                  <div className="grid h-[76px] w-[76px] place-items-center rounded-full bg-[#0d1726] text-center">
                    <div>
                      <div className="text-xl font-semibold text-slate-100">{healthPercent}%</div>
                      <div className="text-[8px] text-slate-500">healthy</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {healthSegments.map(({ status, count }) => (
                    <div key={status} className="flex items-center gap-2 text-[9px]">
                      <i className={`h-2 w-2 rounded-full ${statusStyles[status].dot}`} />
                      <span className="text-slate-400">{statusStyles[status].label}</span>
                      <span className="ml-auto pl-2 font-semibold text-slate-200">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0d1726] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold">Telemetry coverage</h2>
                  <p className="mt-1 text-[9px] text-slate-500">Signals currently collected</p>
                </div>
                <span className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[8px] text-emerald-300">
                  LIVE CHECKS
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/10 text-xs text-sky-300">01</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-medium text-slate-300">ASP.NET Core liveness</div>
                    <div className="text-[9px] text-slate-600">HTTP probe · /health/live</div>
                  </div>
                  <span className="text-[9px] text-emerald-300">Real</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/10 text-xs text-sky-300">02</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-medium text-slate-300">PostgreSQL connectivity</div>
                    <div className="text-[9px] text-slate-600">Database probe · SELECT 1</div>
                  </div>
                  <span className="text-[9px] text-emerald-300">Real</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/10 text-xs text-amber-300">03</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-medium text-slate-300">Dependency impact</div>
                    <div className="text-[9px] text-slate-600">Calculated from topology</div>
                  </div>
                  <span className="text-[9px] text-amber-300">Derived</span>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-800 pt-3 text-[9px] text-slate-600">
                Latency, error rate, SLO, and historical metrics are not instrumented.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#0d1726] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold">Incident timeline</h2>
                  <p className="mt-1 text-[9px] text-slate-500">Current health snapshot · not persisted</p>
                </div>
                <span
                  className={`rounded-md px-2 py-1 text-[8px] ${
                    hasUnhealthyService
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {hasUnhealthyService ? "ATTENTION" : "NO ACTIVE ALERT"}
                </span>
              </div>
              {topology ? (
                <div className="mt-4 space-y-0">
                  {topology.services.map((service, index) => (
                    <div key={service.id} className="relative flex gap-3 pb-3 last:pb-0">
                      {index < topology.services.length - 1 && (
                        <span className="absolute left-[5px] top-3 h-full w-px bg-slate-800" />
                      )}
                      <span
                        className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-[#0d1726] ${statusStyles[service.status].dot}`}
                      />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[10px] text-slate-300">{service.name}</div>
                          <div className="mt-0.5 truncate text-[9px] text-slate-600">
                            {sourceLabel(service.status_source)} · {service.detail}
                          </div>
                        </div>
                        <span className="shrink-0 text-[8px] text-slate-600">
                          {lastUpdated
                            ? lastUpdated.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "--:--"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[10px] text-slate-500">Waiting for health snapshot.</p>
              )}
              <div className="mt-3 border-t border-slate-800 pt-2 text-[9px] text-slate-600">
                Historical incident events will appear when timeline storage is added.
              </div>
            </div>
          </section>

          <section id="lab" className="mt-4 scroll-mt-24 rounded-2xl border border-slate-800 bg-gradient-to-r from-[#101a29] to-[#0b1522] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold">Lab outage controls</h2>
                  <span className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[8px] font-bold tracking-wider text-amber-300">
                    LOCAL DEMO
                  </span>
                </div>
                <p className="mt-1.5 text-[9px] leading-4 text-slate-500">
                  These buttons enable or clear the backend’s simulated outage override. They do not stop the
                  PostgreSQL container or change infrastructure.
                </p>
                {actionMessage && (
                  <p className="mt-2 text-[9px] leading-4 text-slate-300" role="status">
                    {actionMessage}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runLabAction("outage")}
                  disabled={busy || !API_URL}
                  title={!API_URL ? "Configure a public API URL to enable lab controls" : undefined}
                  className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[9px] font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  Trigger simulated outage
                </button>
                <button
                  onClick={() => runLabAction("recovery")}
                  disabled={busy || !API_URL}
                  title={!API_URL ? "Configure a public API URL to enable lab controls" : undefined}
                  className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[9px] font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  Clear simulated outage
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
