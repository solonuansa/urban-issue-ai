"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { clearAuthSession, getAuthUser } from "@/lib/auth";
import {
  getReport,
  getReportAuditLogs,
  type ReportAuditLog,
  type ReportData,
} from "@/services/api";

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const reportId = useMemo(() => Number(params.id), [params.id]);

  const [report, setReport] = useState<ReportData | null>(null);
  const [logs, setLogs] = useState<ReportAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const [reportRes, auditRes] = await Promise.all([
        getReport(reportId),
        getReportAuditLogs(reportId),
      ]);
      setReport(reportRes.report);
      setLogs(auditRes.logs);
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <section className="app-card p-5 md:p-7">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Report Detail #{reportId}</h1>
        <p className="text-sm text-slate-500 mt-2">Complete detail with workflow and audit history.</p>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
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
          </section>

          <section className="app-card p-5 md:p-6">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900">Audit Trail</h2>
            </div>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No audit logs found.</p>
            ) : (
              <div className="overflow-x-auto">
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
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
