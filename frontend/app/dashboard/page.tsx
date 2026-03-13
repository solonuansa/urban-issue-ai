"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { RotateCw, Plus, ShieldAlert, Download, ClipboardList } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import PriorityBadge from "@/components/PriorityBadge";
import { clearAuthSession, getAuthUser, type AuthUser } from "@/lib/auth";
import {
  getMe,
  getReportMetrics,
  getReports,
  updateReportStatus,
  assignReportOperator,
  exportReportMetricsCsv,
  getOperators,
  getReportAuditLogs,
  type ReportData as Report,
  type ReportMetricsResponse,
  type ReportStatus,
  type OperatorUser,
  type ReportAuditLog,
} from "@/services/api";

const PRIORITY_COLORS = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#14b8a6" };
const STATUS_OPTIONS: Array<ReportStatus | "ALL"> = [
  "ALL",
  "NEW",
  "IN_REVIEW",
  "IN_PROGRESS",
  "RESOLVED",
  "REJECTED",
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const transitionMap: Record<ReportStatus, ReportStatus[]> = {
  NEW: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["IN_PROGRESS", "REJECTED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
  REJECTED: [],
};

function SkeletonRows() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {[35, 70, 60, 50, 55, 80, 90, 90, 60].map((w, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: `${w}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<AuthUser | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [metrics, setMetrics] = useState<ReportMetricsResponse | null>(null);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pendingStatusId, setPendingStatusId] = useState<number | null>(null);
  const [pendingAssignId, setPendingAssignId] = useState<number | null>(null);
  const [assigneeByReport, setAssigneeByReport] = useState<Record<number, number | null>>({});
  const [auditTarget, setAuditTarget] = useState<number | null>(null);
  const [auditLogs, setAuditLogs] = useState<ReportAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const userRes = await getMe();
        setMe(userRes.user);

        if (userRes.user.role === "citizen") {
          setError("Operator/admin access required for dashboard.");
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const [reportRes, metricRes, operatorRes] = await Promise.all([
          getReports({
            priority: priorityFilter as "ALL" | "HIGH" | "MEDIUM" | "LOW",
            status: statusFilter,
          }),
          getReportMetrics(),
          getOperators(),
        ]);
        setReports(reportRes.reports);
        setMetrics(metricRes);
        setOperators(operatorRes.operators);
        setAssigneeByReport((prev) => {
          const next = { ...prev };
          for (const report of reportRes.reports) {
            if (!(report.id in next)) {
              next[report.id] = report.assigned_to_user_id ?? null;
            }
          }
          return next;
        });
        setError(null);
        setLastUpdated(new Date());
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load dashboard data.";
        if (message.includes("401") || message.toLowerCase().includes("authentication")) {
          clearAuthSession();
          router.push("/login");
          return;
        }
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [priorityFilter, router, statusFilter]
  );

  useEffect(() => {
    const sessionUser = getAuthUser();
    if (!sessionUser) {
      router.push("/login");
      return;
    }
    setMe(sessionUser);
    fetchData();
  }, [fetchData, router]);

  const counts = useMemo(() => {
    const fallback = {
      total_reports: reports.length,
      status_counts: {
        NEW: reports.filter((r) => r.status === "NEW").length,
        IN_REVIEW: reports.filter((r) => r.status === "IN_REVIEW").length,
        IN_PROGRESS: reports.filter((r) => r.status === "IN_PROGRESS").length,
        RESOLVED: reports.filter((r) => r.status === "RESOLVED").length,
        REJECTED: reports.filter((r) => r.status === "REJECTED").length,
      },
      priority_counts: {
        HIGH: reports.filter((r) => r.priority_label === "HIGH").length,
        MEDIUM: reports.filter((r) => r.priority_label === "MEDIUM").length,
        LOW: reports.filter((r) => r.priority_label === "LOW").length,
      },
    };

    return metrics?.summary ?? fallback;
  }, [metrics, reports]);

  const chartData = [
    { name: "HIGH", count: counts.priority_counts.HIGH },
    { name: "MEDIUM", count: counts.priority_counts.MEDIUM },
    { name: "LOW", count: counts.priority_counts.LOW },
  ];

  const advanced = metrics?.advanced ?? {
    mttr_hours: 0,
    sla_breached_high: 0,
    aging_backlog_over_7d: 0,
    resolution_rate_14d: 0,
    top_issue_types: [],
  };

  const statCards = [
    { label: "Total reports", value: counts.total_reports, className: "text-slate-900", note: "All incoming issues" },
    { label: "In progress", value: counts.status_counts.IN_PROGRESS, className: "text-amber-600", note: "Work underway" },
    { label: "Resolved", value: counts.status_counts.RESOLVED, className: "text-teal-600", note: "Completed tickets" },
    { label: "Rejected", value: counts.status_counts.REJECTED, className: "text-rose-600", note: "Closed as invalid" },
  ];

  const updateStatus = async (report: Report, nextStatus: ReportStatus) => {
    setPendingStatusId(report.id);
    try {
      await updateReportStatus({
        reportId: report.id,
        status: nextStatus,
      });
      await fetchData(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update report status.";
      setError(message);
    } finally {
      setPendingStatusId(null);
    }
  };

  const assignOperator = async (report: Report) => {
    const assignee = assigneeByReport[report.id];
    if (!assignee) {
      setError("Select an operator before assigning.");
      return;
    }

    setPendingAssignId(report.id);
    try {
      await assignReportOperator({
        reportId: report.id,
        assigned_to_user_id: Number(assignee),
      });
      await fetchData(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to assign operator.";
      setError(message);
    } finally {
      setPendingAssignId(null);
    }
  };

  const openAudit = async (reportId: number) => {
    setAuditTarget(reportId);
    setAuditLoading(true);
    try {
      const res = await getReportAuditLogs(reportId);
      setAuditLogs(res.logs);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load audit logs.";
      setError(message);
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const exportCsv = async () => {
    try {
      const blob = await exportReportMetricsCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "report_analytics.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to export CSV.";
      setError(message);
    }
  };

  if (me?.role === "citizen") {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="app-card p-6 border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 text-amber-700">
            <ShieldAlert className="w-5 h-5" />
            <p className="font-semibold">Dashboard operator hanya untuk role operator/admin.</p>
          </div>
          <Link href="/report" className="inline-block mt-4 text-sm font-semibold text-teal-700 hover:underline">
            Buat laporan baru
          </Link>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={containerVariants} className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <motion.section variants={itemVariants} className="app-card p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="app-section-title">Operations Overview</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-1">Civic Issues Dashboard</h1>
            <p className="text-sm text-slate-500 mt-2">Workflow monitoring, SLA trend, and priority distribution.</p>
            {lastUpdated && (
              <p className="text-xs text-slate-400 mt-2 font-medium">
                Last updated: {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            {me && <p className="text-xs text-slate-500 mt-2">Signed in as {me.full_name} ({me.role})</p>}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:shadow-sm transition-all disabled:opacity-60"
            >
              <RotateCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/report"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 hover:shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              New Report
            </Link>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </motion.section>

      {error && (
        <motion.section variants={itemVariants} className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </motion.section>
      )}

      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="app-card glass-panel group p-4 md:p-5 hover:-translate-y-1 transition-all duration-300">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{card.label}</p>
            <p className={`text-3xl font-bold mt-2 ${card.className}`}>
              {loading ? <span className="inline-block h-8 w-10 bg-slate-200/50 rounded animate-pulse" /> : card.value}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">{card.note}</p>
          </div>
        ))}
      </motion.section>

      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="app-card p-4 md:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">MTTR</p>
          <p className="text-2xl font-bold mt-2 text-slate-900">{advanced.mttr_hours}h</p>
          <p className="text-xs text-slate-500 mt-2">Average time to resolve</p>
        </div>
        <div className="app-card p-4 md:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">SLA Breach HIGH</p>
          <p className="text-2xl font-bold mt-2 text-rose-600">{advanced.sla_breached_high}</p>
          <p className="text-xs text-slate-500 mt-2">High-priority overdue/late</p>
        </div>
        <div className="app-card p-4 md:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Aging Backlog 7d+</p>
          <p className="text-2xl font-bold mt-2 text-amber-600">{advanced.aging_backlog_over_7d}</p>
          <p className="text-xs text-slate-500 mt-2">Open tickets older than 7 days</p>
        </div>
        <div className="app-card p-4 md:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Resolution Rate 14d</p>
          <p className="text-2xl font-bold mt-2 text-teal-700">{advanced.resolution_rate_14d}%</p>
          <p className="text-xs text-slate-500 mt-2">Resolved vs incoming in last 14 days</p>
        </div>
      </motion.section>

      {!loading && !error && (
        <motion.section variants={itemVariants} className="grid lg:grid-cols-3 gap-6">
          <div className="app-card p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Priority Distribution</h2>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={chartData} barSize={52}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="app-card p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Trend 14 Hari</h2>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={metrics?.trend_14d ?? []}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incoming" stroke="#0f766e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="app-card p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Top Issue Types</h2>
            </div>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={advanced.top_issue_types}>
                <XAxis dataKey="issue_type" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      )}

      <motion.section variants={itemVariants} className="app-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/60 bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {["ALL", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200 ${
                  priorityFilter === p
                    ? "bg-teal-700 text-white shadow-md shadow-teal-700/20"
                    : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                Priority {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200 ${
                  statusFilter === s
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData(true)}
            className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Apply Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                {["ID", "Type", "Severity", "Score", "Priority", "Status", "Assignee", "Action", "Date"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 bg-white/50">
              {loading ? (
                <SkeletonRows />
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-slate-500">No reports found.</p>
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r.id} className="group hover:bg-teal-50/40 transition-colors duration-200">
                    <td className="px-5 py-4 text-xs font-medium text-slate-500">#{r.id}</td>
                    <td className="px-5 py-4 text-slate-800 font-semibold capitalize">{r.issue_type}</td>
                    <td className="px-5 py-4 text-slate-600 capitalize text-xs font-medium">{r.severity_level}</td>
                    <td className="px-5 py-4 text-xs font-semibold">{r.urgency_score}</td>
                    <td className="px-5 py-4"><PriorityBadge priority={r.priority_label} /></td>
                    <td className="px-5 py-4 text-xs font-bold text-slate-600">{r.status}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <select
                          value={assigneeByReport[r.id] ?? ""}
                          onChange={(e) =>
                            setAssigneeByReport((prev) => ({
                              ...prev,
                              [r.id]: e.target.value ? Number(e.target.value) : null,
                            }))
                          }
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {operators.map((op) => (
                            <option key={op.id} value={op.id}>
                              {op.full_name} ({op.role})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => assignOperator(r)}
                          disabled={pendingAssignId === r.id}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {transitionMap[r.status].length === 0 ? (
                          <span className="text-xs text-slate-400">Final</span>
                        ) : (
                          transitionMap[r.status].map((nextStatus) => (
                            <button
                              key={nextStatus}
                              disabled={pendingStatusId === r.id}
                              onClick={() => updateStatus(r, nextStatus)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {nextStatus}
                            </button>
                          ))
                        )}
                        <button
                          onClick={() => openAudit(r.id)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                        >
                          <ClipboardList className="w-3 h-3" />
                          Audit
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-slate-500">
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.section>

      {auditTarget && (
        <motion.section variants={itemVariants} className="app-card p-5 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">Audit Log Report #{auditTarget}</h2>
            <button className="text-xs font-semibold text-slate-500 hover:text-slate-700" onClick={() => setAuditTarget(null)}>
              Close
            </button>
          </div>
          {auditLoading ? (
            <p className="text-sm text-slate-500">Loading logs...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500">No audit logs.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    {["Time", "Prev", "New", "Changed By", "Assigned", "Note"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
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
          )}
        </motion.section>
      )}
    </motion.div>
  );
}
