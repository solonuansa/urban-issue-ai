"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { RotateCw, Plus } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import PriorityBadge from "@/components/PriorityBadge";
import { getReports, type ReportData as Report } from "@/services/api";

const PRIORITY_COLORS = { HIGH: "#ef4444", MEDIUM: "#f59e0b", LOW: "#14b8a6" };

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

function SkeletonRows() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {[35, 70, 60, 50, 55, 80, 60].map((w, j) => (
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
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchReports = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await getReports();
      setReports(res.reports as Report[]);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load reports.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const counts = {
    TOTAL: reports.length,
    HIGH: reports.filter((r) => r.priority_label === "HIGH").length,
    MEDIUM: reports.filter((r) => r.priority_label === "MEDIUM").length,
    LOW: reports.filter((r) => r.priority_label === "LOW").length,
  };

  const chartData = [
    { name: "HIGH", count: counts.HIGH },
    { name: "MEDIUM", count: counts.MEDIUM },
    { name: "LOW", count: counts.LOW },
  ];

  const filtered = filter === "ALL" ? reports : reports.filter((r) => r.priority_label === filter);

  const statCards = [
    { label: "Total reports", value: counts.TOTAL, className: "text-slate-900", note: "All incoming issues" },
    { label: "High", value: counts.HIGH, className: "text-red-600", note: "Needs urgent handling" },
    { label: "Medium", value: counts.MEDIUM, className: "text-amber-600", note: "Scheduled intervention" },
    { label: "Low", value: counts.LOW, className: "text-teal-600", note: "Monitor and batch" },
  ];

  return (
    <motion.div 
      initial="hidden" 
      animate="show" 
      variants={containerVariants} 
      className="max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6"
    >
      <motion.section variants={itemVariants} className="app-card p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="app-section-title">Operations Overview</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-1">Civic Issues Dashboard</h1>
            <p className="text-sm text-slate-500 mt-2">Track reports, inspect priority levels, and keep response cycles predictable.</p>
            {lastUpdated && (
              <p className="text-xs text-slate-400 mt-2 font-medium">
                Last updated: {lastUpdated.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchReports(true)}
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
          </div>
        </div>
      </motion.section>

      {error && (
        <motion.section variants={itemVariants} className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button
            onClick={() => fetchReports(true)}
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

      {!loading && !error && reports.length > 0 && (
        <motion.section variants={itemVariants} className="app-card p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Priority Distribution</h2>
            <p className="text-xs text-slate-500">Current dataset snapshot</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={52}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  fontSize: 12,
                  boxShadow: "0 4px 20px rgba(15, 23, 42, 0.08)",
                  fontWeight: 500,
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name as keyof typeof PRIORITY_COLORS]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.section>
      )}

      <motion.section variants={itemVariants} className="app-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/60 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {["ALL", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200 ${
                  filter === p
                    ? "bg-teal-700 text-white shadow-md shadow-teal-700/20"
                    : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {!loading && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              {filtered.length} report{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                {["ID", "Type", "Severity", "Score", "Priority", "Coordinates", "Date"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 bg-white/50">
              {loading ? (
                <SkeletonRows />
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-slate-500">Unable to load data.</p>
                    <button
                      onClick={() => fetchReports(true)}
                      className="text-sm text-teal-700 font-semibold hover:underline mt-1"
                    >
                      Try again
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-slate-500">No reports in this filter.</p>
                    <Link href="/report" className="text-sm text-teal-700 font-semibold hover:underline mt-1 inline-block">
                      Create first report
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="group hover:bg-teal-50/40 transition-colors duration-200">
                    <td className="px-5 py-4 text-xs font-medium text-slate-500" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      #{r.id}
                    </td>
                    <td className="px-5 py-4 text-slate-800 font-semibold capitalize group-hover:text-teal-900 transition-colors">{r.issue_type}</td>
                    <td className="px-5 py-4 text-slate-600 capitalize text-xs font-medium">{r.severity_level}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                          <motion.div 
                            initial={{ width: 0 }} 
                            animate={{ width: `${r.urgency_score}%` }} 
                            transition={{ duration: 1, delay: 0.2 }}
                            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-400" 
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-600" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                          {r.urgency_score}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4"><PriorityBadge priority={r.priority_label} /></td>
                    <td className="px-5 py-4 text-[11px] font-medium text-slate-500" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
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
    </motion.div>
  );
}
