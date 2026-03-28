"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

import { clearAuthSession, getAuthUser } from "@/lib/auth";
import { checkBackendHealth, getSlaHighBoard, type SlaHighItem } from "@/services/api";

export default function SlaBoardPage() {
  const router = useRouter();
  const [items, setItems] = useState<SlaHighItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchBoard = useCallback(async () => {
    setLoading(true);
    try {
      const sessionUser = getAuthUser();
      if (!sessionUser) {
        router.push("/login");
        return;
      }
      const res = await getSlaHighBoard();
      setItems(res.items);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load SLA board.";
      if (message.includes("401") || message.toLowerCase().includes("authentication")) {
        clearAuthSession();
        router.push("/login");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const res = await checkBackendHealth();
      const checkedAt = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setHealthStatus({
        ok: res.status === "ok",
        message: `Backend reachable (status: ${res.status}) - checked at ${checkedAt}.`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to reach backend health endpoint.";
      setHealthStatus({ ok: false, message });
      setError(message);
    } finally {
      setHealthChecking(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <section className="app-card p-5 md:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="app-section-title">SLA Board</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-1">High Priority Queue</h1>
            <p className="text-sm text-slate-500 mt-2">Sorted by breach first, then oldest ticket.</p>
          </div>
          <button
            onClick={fetchBoard}
            className="inline-flex self-start sm:self-auto items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={runHealthCheck}
            disabled={healthChecking}
            className="inline-flex self-start sm:self-auto items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RotateCw className={`w-4 h-4 ${healthChecking ? "animate-spin" : ""}`} />
            Check backend health
          </button>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBoard}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
            <button
              onClick={() => setError(null)}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {healthStatus && (
        <section
          className={`rounded-2xl px-5 py-3 text-sm flex items-center justify-between gap-3 ${
            healthStatus.ok
              ? "border border-teal-200 bg-teal-50 text-teal-800"
              : "border border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p>{healthStatus.message}</p>
          <button
            onClick={() => setHealthStatus(null)}
            className={`rounded-md border bg-white px-2.5 py-1 text-xs font-semibold ${
              healthStatus.ok ? "border-teal-200 text-teal-700" : "border-amber-200 text-amber-700"
            }`}
          >
            Close
          </button>
        </section>
      )}

      <section className="app-card overflow-hidden">
        <div className="md:hidden p-4 space-y-3">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
              No high-priority open items.
            </div>
          ) : (
            items.map((item) => (
              <div key={`m-sla-${item.id}`} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Report #{item.id}</p>
                  {item.is_breached ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                      <AlertTriangle className="w-3 h-3" />
                      Breached
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      On Track
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 space-y-1">
                  <p>Status: <span className="font-semibold">{item.status}</span></p>
                  <p>Age: {item.age_hours} hours</p>
                  <p>SLA Due: {new Date(item.sla_due_at).toLocaleString("en-GB")}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                {["Report ID", "Status", "Age (hours)", "SLA Due", "Breached"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 bg-white/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">No high-priority open items.</td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-700">#{item.id}</td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-700">{item.status}</td>
                    <td className="px-5 py-3 text-xs text-slate-700">{item.age_hours}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {new Date(item.sla_due_at).toLocaleString("en-GB")}
                    </td>
                    <td className="px-5 py-3">
                      {item.is_breached ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Breached
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          On Track
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
