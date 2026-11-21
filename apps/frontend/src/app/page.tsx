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

const API_URL = process.env.NEXT_PUBLIC_OPSATLAS_API_URL ?? "http://localhost:8000";

type HealthStatus = "healthy" | "degraded" | "failed";

type Service = {
  id: string;
  name: string;
  kind: string;
  status: HealthStatus;
  status_source: "real" | "derived";
  detail: string;
};

type Topology = {
  telemetry_label: string;
  services: Service[];
  dependencies: Array<{ source: string; target: string }>;
};

const statusStyles: Record<HealthStatus, { dot: string; border: string; badge: string }> = {
  healthy: { dot: "bg-emerald-400", border: "border-emerald-500/60", badge: "bg-emerald-500/15 text-emerald-300" },
  degraded: { dot: "bg-amber-400", border: "border-amber-500/60", badge: "bg-amber-500/15 text-amber-300" },
  failed: { dot: "bg-red-400", border: "border-red-500/70", badge: "bg-red-500/15 text-red-300" },
};

function ServiceNode({ data, selected }: NodeProps<Node<{ service: Service }>>) {
  const service = data.service;
  const style = statusStyles[service.status];
  return (
    <div className={`w-[175px] rounded-xl border ${style.border} ${selected ? "ring-2 ring-sky-400" : ""} bg-[#111827] px-3 py-3 shadow-xl`}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-slate-500" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100">{service.name}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
      </div>
      <div className="mt-2 text-[10px] uppercase tracking-wider text-slate-500">{service.kind}</div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-slate-500" />
    </div>
  );
}

const nodeTypes = { service: ServiceNode };

const positionById: Record<string, { x: number; y: number }> = {
  "member-portal": { x: 390, y: 0 },
  "api-gateway": { x: 390, y: 150 },
  "account-service": { x: 60, y: 320 },
  "order-service": { x: 390, y: 320 },
  "payment-service": { x: 720, y: 320 },
  postgresql: { x: 390, y: 500 },
};

export default function Home() {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [selectedId, setSelectedId] = useState("postgresql");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function refreshTopology() {
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
    setBusy(true);
    setActionMessage(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/lab/postgres/${action}`, { method: "POST" });
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
      position: positionById[service.id] ?? { x: 390, y: 320 },
      data: { service },
    }));
  }, [topology]);

  const edges = useMemo<Edge[]>(() => {
    if (!topology) return [];
    return topology.dependencies.map((dependency) => {
      const target = topology.services.find((service) => service.id === dependency.target);
      const unhealthy = target?.status === "failed" || target?.status === "degraded";
      return {
        id: `${dependency.source}-${dependency.target}`,
        source: dependency.source,
        target: dependency.target,
        animated: unhealthy,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: unhealthy ? "#f59e0b" : "#64748b" },
        style: { stroke: unhealthy ? "#f59e0b" : "#475569", strokeWidth: 1.5 },
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
  const isOutage = counts.failed > 0;

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-800 bg-[#0a1220]/95 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300">
            <span className="text-lg font-bold">O</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide">OpsAtlas</h1>
            <p className="text-[11px] text-slate-500">Infrastructure Digital Twin</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden items-center gap-2 text-slate-400 sm:flex">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-400" : "bg-emerald-400"}`} />
            {error ? "API disconnected" : "Telemetry connected"}
          </div>
          <button className="rounded-md border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800">UTC  {lastUpdated?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? "--:--"}</button>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden w-16 flex-col items-center border-r border-slate-800 py-5 md:flex">
          {["⌂", "◎", "△", "◇", "⌘"].map((icon, index) => (
            <button key={icon} className={`mb-2 grid h-10 w-10 place-items-center rounded-lg text-lg ${index === 1 ? "bg-sky-500/15 text-sky-300" : "text-slate-500 hover:bg-slate-800"}`}>{icon}</button>
          ))}
        </aside>

        <div className="w-full p-4 lg:p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}. Confirm the backend is running at <code>{API_URL}</code>.
            </div>
          )}

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Operations</p>
              <h2 className="mt-1 text-2xl font-semibold">Infrastructure Overview</h2>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div>Telemetry label</div>
              <div className="max-w-md text-slate-400">{topology?.telemetry_label ?? "Waiting for topology data"}</div>
            </div>
          </div>

          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Total Services", counts.total, "text-slate-100"],
              ["Healthy", counts.healthy, "text-emerald-300"],
              ["Degraded", counts.degraded, "text-amber-300"],
              ["Failed", counts.failed, "text-red-300"],
              ["Active Incidents", isOutage ? 1 : 0, "text-sky-300"],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-slate-800 bg-[#0d1728] p-4">
                <div className="text-xs text-slate-500">{label}</div>
                <div className={`mt-2 text-3xl font-semibold ${color}`}>{value}</div>
              </div>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#091321]">
              <div className="flex h-12 items-center justify-between border-b border-slate-800 px-4">
                <div>
                  <h3 className="text-sm font-semibold">Infrastructure Topology</h3>
                  <p className="text-[10px] text-slate-500">Live dependency graph · {lastUpdated ? "refreshes every 3s" : "connecting"}</p>
                </div>
                <div className="flex gap-3 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-400" />Healthy</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />Degraded</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-400" />Failed</span>
                </div>
              </div>
              <div className="h-[530px]">
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
                    minZoom={0.55}
                  >
                    <Background color="#1e293b" gap={20} />
                    <Controls showInteractive={false} />
                    <MiniMap
                      pannable
                      zoomable
                      nodeColor={(node) => {
                        const service = (node.data as { service: Service }).service;
                        return service.status === "failed" ? "#ef4444" : service.status === "degraded" ? "#f59e0b" : "#10b981";
                      }}
                      maskColor="rgba(7,16,31,.75)"
                    />
                  </ReactFlow>
                ) : (
                  <div className="grid h-full place-items-center text-sm text-slate-500">Waiting for topology data…</div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-[#0d1728] p-4">
                <h3 className="text-sm font-semibold">Service Details</h3>
                {selectedService ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{selectedService.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{selectedService.kind}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[selectedService.status].badge}`}>{selectedService.status}</span>
                    </div>
                    <dl className="mt-5 space-y-3 border-t border-slate-800 pt-4 text-xs">
                      <div><dt className="text-slate-500">Status source</dt><dd className="mt-1 text-slate-300">{selectedService.status_source}</dd></div>
                      <div><dt className="text-slate-500">Detail</dt><dd className="mt-1 leading-5 text-slate-300">{selectedService.detail}</dd></div>
                    </dl>
                  </div>
                ) : <p className="mt-3 text-xs text-slate-500">Select a service to inspect it.</p>}
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0d1728] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Lab Recovery Controls</h3>
                  <span className="rounded bg-sky-500/10 px-2 py-1 text-[9px] font-bold text-sky-300">LAB ONLY</span>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Controls the explicit hackathon demo override. It does not stop Docker or host infrastructure.</p>
                <button
                  onClick={() => runLabAction("outage")}
                  disabled={busy}
                  className="mt-4 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                >Trigger PostgreSQL Outage</button>
                <button
                  onClick={() => runLabAction("recovery")}
                  disabled={busy}
                  className="mt-2 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                >Clear Demo Outage</button>
                {actionMessage && <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-4 text-slate-400">{actionMessage}</p>}
              </div>
            </aside>
          </section>
        </div>
      </div>
    </main>
  );
}
