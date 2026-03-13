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
import HotspotMap from "@/components/HotspotMap";
import { clearAuthSession, getAuthUser, type AuthUser } from "@/lib/auth";
import {
  getHotspotReports,
  getHotspotRiskPolicy,
  getHotspots,
  getMe,
  getReportMetrics,
  getReports,
  updateReportStatus,
  assignReportOperator,
  exportReportMetricsCsv,
  getOperators,
  getReportAuditLogs,
  updateHotspotRiskPolicy,
  type ReportData as Report,
  type HotspotRiskPolicy,
  type ReportMetricsResponse,
  type ReportStatus,
  type HotspotItem,
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
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [operators, setOperators] = useState<OperatorUser[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
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
  const [hotspotDays, setHotspotDays] = useState(14);
  const [hotspotMode, setHotspotMode] = useState<"OPEN" | "ALL" | "HIGH">("OPEN");
  const [hotspotVisualMode, setHotspotVisualMode] = useState<"circles" | "heatmap">("heatmap");
  const [hotspotRiskFilter, setHotspotRiskFilter] = useState<
    "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  >("ALL");
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotItem | null>(null);
  const [selectedHotspotReports, setSelectedHotspotReports] = useState<Report[]>([]);
  const [hotspotDetailLoading, setHotspotDetailLoading] = useState(false);
  const [hotspotPolicy, setHotspotPolicy] = useState<HotspotRiskPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    weight_total: 1,
    weight_high: 1.8,
    weight_open: 1.2,
    medium_score_min: 8,
    high_score_min: 16,
    critical_score_min: 28,
    medium_count_min: 4,
    high_count_min: 8,
    critical_count_min: 12,
    critical_high_count_min: 3,
  });
  const [policySaving, setPolicySaving] = useState(false);

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

        const [reportRes, metricRes, operatorRes, hotspotRes, policyRes] = await Promise.all([
          getReports({
            priority: priorityFilter as "ALL" | "HIGH" | "MEDIUM" | "LOW",
            status: statusFilter,
            search,
            page,
            page_size: pageSize,
          }),
          getReportMetrics(),
          getOperators(),
          getHotspots({
            days: hotspotDays,
            status: hotspotMode === "ALL" ? undefined : "OPEN",
            priority: hotspotMode === "HIGH" ? "HIGH" : undefined,
            grid_size: 0.01,
          }),
          getHotspotRiskPolicy(),
        ]);
        setReports(reportRes.reports);
        setTotalPages(reportRes.meta?.total_pages ?? 1);
        setTotalRows(reportRes.meta?.total ?? reportRes.reports.length);
        setMetrics(metricRes);
        setHotspots(hotspotRes.hotspots);
        setHotspotPolicy(policyRes.policy);
        setPolicyForm({
          weight_total: policyRes.policy.weights.total,
          weight_high: policyRes.policy.weights.high,
          weight_open: policyRes.policy.weights.open,
          medium_score_min: policyRes.policy.score_min.medium,
          high_score_min: policyRes.policy.score_min.high,
          critical_score_min: policyRes.policy.score_min.critical,
          medium_count_min: policyRes.policy.count_min.medium,
          high_count_min: policyRes.policy.count_min.high,
          critical_count_min: policyRes.policy.count_min.critical,
          critical_high_count_min: policyRes.policy.count_min.critical_high_count,
        });
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
    [priorityFilter, router, statusFilter, search, page, pageSize, hotspotDays, hotspotMode]
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchData(true);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  const loadHotspotDetail = useCallback(
    async (item: HotspotItem) => {
      setSelectedHotspot(item);
      setHotspotDetailLoading(true);
      try {
        const res = await getHotspotReports({
          lat: item.lat,
          lng: item.lng,
          days: hotspotDays,
          status: hotspotMode === "ALL" ? undefined : "OPEN",
          priority: hotspotMode === "HIGH" ? "HIGH" : undefined,
          grid_size: 0.01,
          limit: 50,
        });
        setSelectedHotspotReports(res.reports);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load hotspot reports.";
        setError(message);
        setSelectedHotspotReports([]);
      } finally {
        setHotspotDetailLoading(false);
      }
    },
    [hotspotDays, hotspotMode]
  );

  const saveHotspotPolicy = async () => {
    if (me?.role !== "admin") return;
    setPolicySaving(true);
    try {
      const res = await updateHotspotRiskPolicy(policyForm);
      setHotspotPolicy(res.policy);
      setPolicyForm({
        weight_total: res.policy.weights.total,
        weight_high: res.policy.weights.high,
        weight_open: res.policy.weights.open,
        medium_score_min: res.policy.score_min.medium,
        high_score_min: res.policy.score_min.high,
        critical_score_min: res.policy.score_min.critical,
        medium_count_min: res.policy.count_min.medium,
        high_count_min: res.policy.count_min.high,
        critical_count_min: res.policy.count_min.critical,
        critical_high_count_min: res.policy.count_min.critical_high_count,
      });
      await fetchData(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update hotspot risk policy.";
      setError(message);
    } finally {
      setPolicySaving(false);
    }
  };

  const filteredHotspots = useMemo(() => {
    if (hotspotRiskFilter === "ALL") return hotspots;
    return hotspots.filter((item) => item.risk_level === hotspotRiskFilter);
  }, [hotspots, hotspotRiskFilter]);

  const hotspotRiskSummary = useMemo(() => {
    return hotspots.reduce(
      (acc, item) => {
        acc[item.risk_level] += 1;
        return acc;
      },
      { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
    );
  }, [hotspots]);

  useEffect(() => {
    if (filteredHotspots.length === 0) {
      setSelectedHotspot(null);
      setSelectedHotspotReports([]);
      return;
    }
    if (!selectedHotspot) {
      loadHotspotDetail(filteredHotspots[0]);
      return;
    }
    const stillExists = filteredHotspots.some(
      (h) => h.lat === selectedHotspot.lat && h.lng === selectedHotspot.lng
    );
    if (!stillExists) {
      loadHotspotDetail(filteredHotspots[0]);
    }
  }, [filteredHotspots, selectedHotspot, loadHotspotDetail]);

  const topHotspots = filteredHotspots.slice(0, 10);

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

      {me?.role === "admin" && (
        <motion.section variants={itemVariants} className="app-card p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Hotspot Risk Policy (Admin)</h2>
              <p className="text-xs text-slate-500 mt-1">
                Ubah bobot dan threshold risiko area tanpa edit env.
              </p>
            </div>
            {hotspotPolicy && (
              <p className="text-xs text-slate-500">
                Source: <span className="font-semibold text-slate-700">{hotspotPolicy.source}</span>
              </p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { key: "weight_total", label: "Weight Total", step: "0.1" },
              { key: "weight_high", label: "Weight High", step: "0.1" },
              { key: "weight_open", label: "Weight Open", step: "0.1" },
              { key: "medium_score_min", label: "Score Medium", step: "0.1" },
              { key: "high_score_min", label: "Score High", step: "0.1" },
              { key: "critical_score_min", label: "Score Critical", step: "0.1" },
              { key: "medium_count_min", label: "Count Medium", step: "1" },
              { key: "high_count_min", label: "Count High", step: "1" },
              { key: "critical_count_min", label: "Count Critical", step: "1" },
              { key: "critical_high_count_min", label: "Critical High Count", step: "1" },
            ].map((field) => (
              <label key={field.key} className="text-xs text-slate-600">
                <span className="font-semibold">{field.label}</span>
                <input
                  type="number"
                  step={field.step}
                  value={policyForm[field.key as keyof typeof policyForm]}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      [field.key]:
                        field.step === "1"
                          ? Number.parseInt(e.target.value || "0", 10)
                          : Number.parseFloat(e.target.value || "0"),
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end">
            <button
              onClick={saveHotspotPolicy}
              disabled={policySaving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {policySaving ? "Saving..." : "Save Policy"}
            </button>
          </div>
        </motion.section>
      )}

      <motion.section variants={itemVariants} className="app-card p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Issue Hotspot Map</h2>
            <p className="text-xs text-slate-500 mt-1">
              Area dengan konsentrasi laporan tertinggi.
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-700 inline-block" />
                Low
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Medium
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                High
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-800 inline-block" />
                Critical
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={hotspotDays}
              onChange={(e) => setHotspotDays(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </select>
            <select
              value={hotspotMode}
              onChange={(e) => setHotspotMode(e.target.value as "OPEN" | "ALL" | "HIGH")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="OPEN">Open only</option>
              <option value="ALL">All reports</option>
              <option value="HIGH">High priority</option>
            </select>
            <select
              value={hotspotVisualMode}
              onChange={(e) => setHotspotVisualMode(e.target.value as "circles" | "heatmap")}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="heatmap">Heatmap</option>
              <option value="circles">Circles</option>
            </select>
            <select
              value={hotspotRiskFilter}
              onChange={(e) =>
                setHotspotRiskFilter(
                  e.target.value as "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
                )
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="ALL">All risk</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-red-600">Critical Areas</p>
            <p className="text-lg font-bold text-red-700">{hotspotRiskSummary.CRITICAL}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/40 px-3 py-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-red-500">High Areas</p>
            <p className="text-lg font-bold text-red-600">{hotspotRiskSummary.HIGH}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-amber-600">Medium Areas</p>
            <p className="text-lg font-bold text-amber-700">{hotspotRiskSummary.MEDIUM}</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <p className="text-[10px] uppercase font-bold tracking-wider text-teal-600">Low Areas</p>
            <p className="text-lg font-bold text-teal-700">{hotspotRiskSummary.LOW}</p>
          </div>
        </div>
        {filteredHotspots.length === 0 ? (
          <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
            No hotspot data for selected filters and risk level.
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl overflow-hidden border border-slate-200">
              <HotspotMap
                hotspots={filteredHotspots}
                mode={hotspotVisualMode}
                onSelectHotspot={loadHotspotDetail}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Top Hotspot Areas</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {topHotspots.map((item, idx) => {
                  const active =
                    selectedHotspot?.lat === item.lat && selectedHotspot?.lng === item.lng;
                  return (
                    <button
                      key={`${item.lat}-${item.lng}`}
                      onClick={() => loadHotspotDetail(item)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 ${
                        active ? "bg-teal-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-700">
                        #{idx + 1} - {item.count} issues
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Risk: {item.risk_level} - Score {item.risk_score}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        High: {item.high_count} - Open: {item.open_count}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedHotspot && (
          <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">
                Reports in selected area ({selectedHotspot.lat.toFixed(4)}, {selectedHotspot.lng.toFixed(4)})
              </p>
            </div>
            {hotspotDetailLoading ? (
              <div className="px-4 py-6 text-sm text-slate-500">Loading area reports...</div>
            ) : selectedHotspotReports.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500">No reports in this hotspot bucket.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["ID", "Issue", "Priority", "Status", "Date"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedHotspotReports.slice(0, 12).map((r) => (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-xs text-slate-600">
                          <Link href={`/reports/${r.id}`} className="font-semibold text-teal-700 hover:underline">
                            #{r.id}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-xs font-semibold capitalize text-slate-700">{r.issue_type}</td>
                        <td className="px-4 py-2"><PriorityBadge priority={r.priority_label} /></td>
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600">{r.status}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">
                          {new Date(r.created_at).toLocaleDateString("en-GB")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </motion.section>

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
            onClick={() => {
              setPage(1);
              fetchData(true);
            }}
            className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Apply Filter
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issue, status, severity, ID"
            className="app-input w-full md:max-w-md"
          />
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
        <div className="px-5 py-3 border-t border-slate-200/60 bg-slate-50/40 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Page {page} / {totalPages} - Total {totalRows}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
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

