"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, RotateCw } from "lucide-react";

import { clearAuthSession, getAuthUser } from "@/lib/auth";
import {
  assignReportOperator,
  checkBackendHealth,
  getMe,
  getOperators,
  getReport,
  getReportAuditLogs,
  updateReportStatus,
  type OperatorUser,
  type ReportAuditLog,
  type ReportData,
  type ReportStatus,
} from "@/services/api";

const transitionMap: Record<ReportStatus, ReportStatus[]> = {
  NEW: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
  REJECTED: [],
};

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reportId = useMemo(() => Number(params.id), [params.id]);

  const [report, setReport] = useState<ReportData | null>(null);
  const [logs, setLogs] = useState<ReportAuditLog[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [canOperate, setCanOperate] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<"status" | "assign" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!Number.isFinite(reportId) || reportId <= 0) {
      setError("Invalid report ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const sessionUser = getAuthUser();
      if (!sessionUser) {
        router.push("/login");
        return;
      }

      const meRes = await getMe();
      const isOperator = meRes.user.role === "operator" || meRes.user.role === "admin";
      setCanOperate(isOperator);

      const [reportRes, auditRes, operatorRes] = await Promise.all([
        getReport(reportId),
        getReportAuditLogs(reportId),
        isOperator ? getOperators() : Promise.resolve({ operators: [] }),
      ]);
      setReport(reportRes.report);
      setLogs(auditRes.logs);
      setOperators(operatorRes.operators);
      setAssigneeId(reportRes.report.assigned_to_user_id ?? null);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load report details.";
      if (message.includes("401") || message.toLowerCase().includes("authentication")) {
        clearAuthSession();
        router.push("/login");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [reportId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!error) return;
    const nonDismissable = error.toLowerCase().includes("invalid report id");
    if (nonDismissable) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  const onAssign = async () => {
    if (!report || !assigneeId) return;
    setPendingAction("assign");
    try {
      await assignReportOperator({
        reportId: report.id,
        assigned_to_user_id: assigneeId,
      });
      await fetchData();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to assign operator.";
      setError(message);
    } finally {
      setPendingAction(null);
    }
  };

  const onStatusChange = async (nextStatus: ReportStatus) => {
    if (!report) return;
    setPendingAction("status");
    try {
      await updateReportStatus({
        reportId: report.id,
        status: nextStatus,
      });
      await fetchData();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update status.";
      setError(message);
    } finally {
      setPendingAction(null);
    }
  };

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
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <section className="app-card p-5 md:p-7">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Report Detail #{reportId}</h1>
        <p className="text-sm text-slate-500 mt-2">Complete detail with workflow and audit history.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={runHealthCheck}
            disabled={healthChecking}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
              onClick={fetchData}
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

      {loading ? (
        <section className="app-card p-5 text-sm text-slate-500">Loading report...</section>
      ) : report ? (
        <>
          <section className="app-card p-5 md:p-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Issue</p>
                <p className="font-semibold capitalize">{report.issue_type}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Severity</p>
                <p className="font-semibold capitalize">{report.severity_level}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Priority</p>
                <p className="font-semibold">{report.priority_label}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Status</p>
                <p className="font-semibold">{report.status}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Urgency Score</p>
                <p className="font-semibold">{report.urgency_score}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Created At</p>
                <p className="font-semibold">{new Date(report.created_at).toLocaleString("en-GB")}</p>
              </div>
            </div>
            {report.auto_response && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-500 mb-1">System response</p>
                <p className="text-sm text-slate-700">{report.auto_response}</p>
              </div>
            )}
            {canOperate && (
              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 mb-2">Assign operator</p>
                  <div className="flex items-center gap-2">
                    <select
                      value={assigneeId ?? ""}
                      onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs w-full"
                    >
                      <option value="">Unassigned</option>
                      {operators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.full_name} ({op.role})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={onAssign}
                      disabled={pendingAction !== null || !assigneeId}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      Assign
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-500 mb-2">Workflow action</p>
                  <div className="flex flex-wrap gap-1">
                    {transitionMap[report.status].length === 0 ? (
                      <span className="text-xs text-slate-500">Final status</span>
                    ) : (
                      transitionMap[report.status].map((nextStatus) => (
                        <button
                          key={nextStatus}
                          onClick={() => onStatusChange(nextStatus)}
                          disabled={pendingAction !== null}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-40"
                        >
                          {nextStatus}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="app-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900">Audit Trail</h2>
            </div>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No audit logs found.</p>
            ) : (
              <div className="space-y-2">
                <div className="md:hidden space-y-2">
                  {logs.map((log) => (
                    <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {new Date(log.created_at).toLocaleString("en-GB")}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <p className="text-slate-500">
                          Prev: <span className="font-medium text-slate-700">{log.previous_status ?? "-"}</span>
                        </p>
                        <p className="text-slate-500">
                          New: <span className="font-medium text-slate-700">{log.new_status ?? "-"}</span>
                        </p>
                        <p className="text-slate-500">
                          By: <span className="font-medium text-slate-700">#{log.changed_by_user_id}</span>
                        </p>
                        <p className="text-slate-500">
                          Assigned:{" "}
                          <span className="font-medium text-slate-700">
                            {log.assigned_to_user_id ? `#${log.assigned_to_user_id}` : "-"}
                          </span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">Note: {log.note ?? "-"}</p>
                    </article>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        {["Time", "Prev", "New", "By", "Assigned", "Note"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-xs text-slate-600">{new Date(log.created_at).toLocaleString("en-GB")}</td>
                          <td className="px-3 py-2 text-xs">{log.previous_status ?? "-"}</td>
                          <td className="px-3 py-2 text-xs">{log.new_status ?? "-"}</td>
                          <td className="px-3 py-2 text-xs">#{log.changed_by_user_id}</td>
                          <td className="px-3 py-2 text-xs">{log.assigned_to_user_id ? `#${log.assigned_to_user_id}` : "-"}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{log.note ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
