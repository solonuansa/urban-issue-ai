"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, CheckCheck, RefreshCw } from "lucide-react";

import { clearAuthSession, getAuthUser } from "@/lib/auth";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/services/api";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "assignment", label: "Assignment" },
  { value: "status_update", label: "Status Update" },
  { value: "workflow", label: "Workflow" },
  { value: "info", label: "Info" },
];

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sessionUser = getAuthUser();
      if (!sessionUser) {
        router.push("/login");
        return;
      }
      const res = await getNotifications({
        limit: 100,
        unread_only: unreadOnly,
        type: typeFilter === "all" ? undefined : typeFilter,
      });
      setItems(res.notifications);
      setUnreadCount(res.unread_count);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load notifications.";
      if (message.includes("401") || message.toLowerCase().includes("authentication")) {
        clearAuthSession();
        router.push("/login");
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [router, typeFilter, unreadOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markRead = async (item: NotificationItem) => {
    if (item.is_read) return;
    setBusyId(item.id);
    try {
      await markNotificationRead(item.id);
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    setMarkAllLoading(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } finally {
      setMarkAllLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <section className="app-card p-5 md:p-7">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="app-section-title">Alerts</p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 mt-1">Notification Center</h1>
            <p className="text-sm text-slate-500 mt-2">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={markAll}
              disabled={markAllLoading || unreadCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" />
              Mark All Read
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${
                typeFilter === f.value
                  ? "bg-teal-700 text-white border-teal-700"
                  : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
          <label className="ml-auto inline-flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Unread only
          </label>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </section>
      )}

      <section className="app-card overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Loading notifications...</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className={`px-5 py-4 ${item.is_read ? "bg-white" : "bg-teal-50/50"}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <BellRing className={`w-4 h-4 ${item.is_read ? "text-slate-400" : "text-teal-600"}`} />
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{item.body}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {new Date(item.created_at).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.related_report_id && (
                      <Link
                        href={`/reports/${item.related_report_id}`}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open Report #{item.related_report_id}
                      </Link>
                    )}
                    {!item.is_read && (
                      <button
                        onClick={() => markRead(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
