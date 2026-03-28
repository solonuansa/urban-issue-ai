"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

import HotspotMap from "@/components/HotspotMap";
import {
  checkBackendHealth,
  getCitizenHotspotAreas,
  getCitizenHotspots,
  getCitizenRouteSafety,
  getCitizenHotspotTrend,
  getCitizenNearbyRisk,
  type HotspotAreaSegment,
  type HotspotItem,
} from "@/services/api";

type SavedRoute = {
  id: string;
  name: string;
  startLat: string;
  startLng: string;
  endLat: string;
  endLng: string;
};

const SAVED_ROUTES_KEY = "urban_issue_safety_saved_routes";
const ALERT_COOLDOWN_KEY = "urban_issue_alert_cooldown";

export default function SafetyMapPage() {
  const router = useRouter();
  const [days, setDays] = useState(14);
  const [issueType, setIssueType] = useState<"pothole" | "all">("pothole");
  const [hotspots, setHotspots] = useState<HotspotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [tips, setTips] = useState<string[]>([]);
  const [criticalAreas, setCriticalAreas] = useState(0);
  const [highAreas, setHighAreas] = useState(0);
  const [startLat, setStartLat] = useState("");
  const [startLng, setStartLng] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLng, setEndLng] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationRiskInfo, setLocationRiskInfo] = useState<string | null>(null);
  const [nearbyRisk, setNearbyRisk] = useState<{
    level: "LOW" | "MEDIUM" | "HIGH";
    score: number;
    count: number;
    alert: {
      should_alert: boolean;
      level: "LOW" | "MEDIUM" | "HIGH";
      message: string;
      cooldown_minutes: number;
    };
    items: Array<{ id: number; issue_type: string; distance_km: number; priority_label: string }>;
  } | null>(null);
  const [dismissAlert, setDismissAlert] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [routeName, setRouteName] = useState("");
  const [trendData, setTrendData] = useState<Array<{ date: string; incoming: number; high_priority: number }>>([]);
  const [areaSegments, setAreaSegments] = useState<HotspotAreaSegment[]>([]);
  const [routeSafety, setRouteSafety] = useState<{
    best: {
      label: string;
      risk_level: "LOW" | "MEDIUM" | "HIGH";
      risk_score: number;
      near_count: number;
      high_count: number;
      distance_km: number;
      duration_min: number;
    } | null;
    routes: Array<{
      rank: number;
      label: string;
      risk_level: "LOW" | "MEDIUM" | "HIGH";
      risk_score: number;
      near_count: number;
      high_count: number;
      distance_km: number;
      duration_min: number;
      maps_url: string;
    }>;
  } | null>(null);
  const [routeSafetyLoading, setRouteSafetyLoading] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [healthChecking, setHealthChecking] = useState(false);
  const [healthStatus, setHealthStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await getCitizenHotspots({
          days,
          issue_type: issueType,
          grid_size: 0.01,
        });
        if (!active) return;
        setHotspots(res.hotspots);
        setHeadline(res.advisory.headline);
        setTips(res.advisory.tips);
        setCriticalAreas(res.meta.critical_areas);
        setHighAreas(res.meta.high_areas);
        const trendRes = await getCitizenHotspotTrend({ days, issue_type: issueType });
        setTrendData(trendRes.trend);
        const areaRes = await getCitizenHotspotAreas({
          days,
          issue_type: issueType,
          grid_size: 0.01,
        });
        setAreaSegments(areaRes.areas);
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Gagal memuat peta area rawan.";
        if (message.includes("401")) {
          router.push("/login");
          return;
        }
        if (active) {
          setError(message);
          setHotspots([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [days, issueType, router, reloadSeq]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SAVED_ROUTES_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedRoute[];
      if (Array.isArray(parsed)) {
        setSavedRoutes(parsed.slice(0, 8));
      }
    } catch {
      // no-op
    }
  }, []);

  const topHotspots = useMemo(() => hotspots.slice(0, 8), [hotspots]);

  const analyzeRouteSafety = async () => {
    const aLat = Number.parseFloat(startLat);
    const aLng = Number.parseFloat(startLng);
    const bLat = Number.parseFloat(endLat);
    const bLng = Number.parseFloat(endLng);
    if (Number.isNaN(aLat) || Number.isNaN(aLng) || Number.isNaN(bLat) || Number.isNaN(bLng)) {
      setLocationRiskInfo("Isi koordinat awal dan tujuan dengan benar.");
      return;
    }

    setRouteSafetyLoading(true);
    try {
      const res = await getCitizenRouteSafety({
        start_lat: aLat,
        start_lng: aLng,
        end_lat: bLat,
        end_lng: bLng,
        days,
        issue_type: issueType,
        corridor_km: 0.4,
      });
      setRouteSafety({
        best: res.best
          ? {
              label: res.best.label,
              risk_level: res.best.risk_level,
              risk_score: res.best.risk_score,
              near_count: res.best.near_count,
              high_count: res.best.high_count,
              distance_km: res.best.distance_km,
              duration_min: res.best.duration_min,
            }
          : null,
        routes: res.routes,
      });
      setLocationRiskInfo(
        res.best
          ? `Analisis rute selesai: ${res.best.label} (${res.best.risk_level})`
          : "Analisis rute selesai."
      );
    } catch {
      setLocationRiskInfo("Gagal menganalisis rute. Coba lagi.");
      setRouteSafety(null);
    } finally {
      setRouteSafetyLoading(false);
    }
  };

  useEffect(() => {
    if (!nearbyRisk) return;
    const raw = window.localStorage.getItem(ALERT_COOLDOWN_KEY);
    let cooldownMap: Record<string, number> = {};
    if (raw) {
      try {
        cooldownMap = JSON.parse(raw) as Record<string, number>;
      } catch {
        cooldownMap = {};
      }
    }
    const now = Date.now();
    const cooldownUntil = cooldownMap[nearbyRisk.alert.level] ?? 0;
    const suppressedByCooldown = cooldownUntil > now;
    setDismissAlert(!nearbyRisk.alert.should_alert || suppressedByCooldown);
  }, [nearbyRisk]);

  const detectCurrentLocationRisk = () => {
    if (!navigator.geolocation) {
      setLocationRiskInfo("Browser tidak mendukung geolocation.");
      return;
    }
    if (hotspots.length === 0) {
      setLocationRiskInfo("Data hotspot belum tersedia.");
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setStartLat(lat.toFixed(6));
        setStartLng(lng.toFixed(6));
        try {
          const res = await getCitizenNearbyRisk({
            latitude: lat,
            longitude: lng,
            radius_km: 3,
            days: 30,
            issue_type: issueType,
            limit: 8,
          });
          setNearbyRisk({
            level: res.meta.risk_level,
            score: res.meta.risk_score,
            count: res.meta.count,
            alert: {
              should_alert: res.meta.alert.should_alert,
              level: res.meta.alert.level,
              message: res.meta.alert.message,
              cooldown_minutes: res.meta.alert.cooldown_minutes,
            },
            items: res.items.map((i) => ({
              id: i.id,
              issue_type: i.issue_type,
              distance_km: i.distance_km,
              priority_label: i.priority_label,
            })),
          });
          setLocationRiskInfo(
            `Risiko sekitar lokasi (${res.meta.radius_km} km): ${res.meta.risk_level} dengan ${res.meta.count} laporan aktif.`
          );
        } catch {
          setLocationRiskInfo("Gagal menghitung risiko sekitar lokasi.");
          setNearbyRisk(null);
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        setLocationRiskInfo("Gagal mengambil lokasi. Pastikan izin lokasi aktif.");
        setNearbyRisk(null);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveCurrentRoute = () => {
    if (!startLat || !startLng || !endLat || !endLng) {
      setLocationRiskInfo("Isi koordinat awal dan tujuan dulu sebelum menyimpan rute.");
      return;
    }
    const name = routeName.trim() || `Rute ${savedRoutes.length + 1}`;
    const newRoute: SavedRoute = {
      id: `${Date.now()}`,
      name,
      startLat,
      startLng,
      endLat,
      endLng,
    };
    const next = [newRoute, ...savedRoutes].slice(0, 8);
    setSavedRoutes(next);
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(next));
    setRouteName("");
  };

  const loadSavedRoute = (route: SavedRoute) => {
    setStartLat(route.startLat);
    setStartLng(route.startLng);
    setEndLat(route.endLat);
    setEndLng(route.endLng);
  };

  const removeSavedRoute = (id: string) => {
    const next = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(next);
    window.localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(next));
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
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8 space-y-6">
      <section className="app-card p-5 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">Peta Area Rawan Isu</h1>
            <p className="text-sm text-slate-500 mt-2">
              Bantu warga menghindari area dengan banyak laporan, khususnya jalan berlubang yang berisiko membahayakan.
            </p>
          </div>
          <Link
            href="/report"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Laporkan Isu Baru
          </Link>
          <button
            onClick={runHealthCheck}
            disabled={healthChecking}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${healthChecking ? "animate-spin" : ""}`} />
            Check backend health
          </button>
        </div>
      </section>

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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="app-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-red-500">Critical Areas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{criticalAreas}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500">High Areas</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{highAreas}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Hotspots</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{hotspots.length}</p>
        </div>
        <div className="app-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600">Issue Filter</p>
          <p className="text-sm font-semibold text-teal-700 mt-2">{issueType === "pothole" ? "Pothole" : "All issues"}</p>
        </div>
      </section>

      <section className="app-card p-5 md:p-6">
        <h2 className="text-base font-semibold text-slate-900">Area Administratif dengan Isu Tertinggi</h2>
        <p className="text-xs text-slate-500 mt-1">
          Ringkasan wilayah untuk membantu warga memahami area yang perlu ekstra waspada.
        </p>
        {areaSegments.length === 0 ? (
          <p className="text-xs text-slate-500 mt-3">Belum ada area yang terpetakan.</p>
        ) : (
          <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {areaSegments.slice(0, 6).map((area) => (
              <div key={area.area_id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs font-semibold text-slate-800">{area.area_name}</p>
                <p className="text-[11px] text-slate-500 mt-1">{area.city}</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Risk {area.risk_level} - Score {area.risk_score}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Hotspot {area.hotspot_count} - High {area.high_count}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="app-card p-5 md:p-6">
        <h2 className="text-base font-semibold text-slate-900">Trend Area Rawan</h2>
        <p className="text-xs text-slate-500 mt-1">
          Memantau laporan aktif harian untuk melihat tren risiko di wilayah sekitar.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="incoming"
                name="Open reports"
                stroke="#0f766e"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="high_priority"
                name="High priority"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {nearbyRisk && nearbyRisk.alert.should_alert && !dismissAlert && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-700">
                Peringatan Risiko {nearbyRisk.alert.level} di Sekitar Lokasi Anda
              </p>
              <p className="text-xs text-red-600 mt-1">{nearbyRisk.alert.message}</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
              <Link
                href="/report"
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 text-center"
              >
                Laporkan Bahaya
              </Link>
              <button
                onClick={() => {
                  const raw = window.localStorage.getItem(ALERT_COOLDOWN_KEY);
                  let cooldownMap: Record<string, number> = {};
                  if (raw) {
                    try {
                      cooldownMap = JSON.parse(raw) as Record<string, number>;
                    } catch {
                      cooldownMap = {};
                    }
                  }
                  const now = Date.now();
                  cooldownMap[nearbyRisk.alert.level] =
                    now + nearbyRisk.alert.cooldown_minutes * 60 * 1000;
                  window.localStorage.setItem(ALERT_COOLDOWN_KEY, JSON.stringify(cooldownMap));
                  setDismissAlert(true);
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Tutup
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="app-card p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value={7}>7 hari terakhir</option>
            <option value={14}>14 hari terakhir</option>
            <option value={30}>30 hari terakhir</option>
          </select>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value as "pothole" | "all")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          >
            <option value="pothole">Jalan berlubang</option>
            <option value="all">Semua isu</option>
          </select>
        </div>
        {loading ? (
          <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
            Memuat peta area rawan...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
            <p>{error}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setReloadSeq((prev) => prev + 1)}
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
          </div>
        ) : hotspots.length === 0 ? (
          <div className="h-80 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
            Tidak ada data hotspot untuk filter ini.
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl overflow-hidden border border-slate-200">
              <HotspotMap hotspots={hotspots} mode="heatmap" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-800">Area Paling Rawan</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {topHotspots.map((item, idx) => (
                  <div key={`${item.lat}-${item.lng}`} className="px-4 py-3 border-b border-slate-100 last:border-0">
                    <p className="text-xs font-semibold text-slate-700">
                      #{idx + 1} - {item.risk_level} ({item.count} laporan)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      High: {item.high_count} - Open: {item.open_count}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="app-card p-5 md:p-6">
        <h2 className="text-base font-semibold text-slate-900">Indikator Rute Aman</h2>
        <p className="text-xs text-slate-500 mt-1">
          Masukkan titik awal dan tujuan (latitude/longitude) untuk estimasi risiko jalur.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <button
            onClick={detectCurrentLocationRisk}
            disabled={locationLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 w-full sm:w-auto"
          >
            {locationLoading ? "Mendeteksi lokasi..." : "Gunakan lokasi saya"}
          </button>
          {locationRiskInfo && <p className="text-xs text-slate-600 break-words">{locationRiskInfo}</p>}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          <input
            value={startLat}
            onChange={(e) => setStartLat(e.target.value)}
            placeholder="Start lat (contoh: -6.20)"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          />
          <input
            value={startLng}
            onChange={(e) => setStartLng(e.target.value)}
            placeholder="Start lng (contoh: 106.81)"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          />
          <input
            value={endLat}
            onChange={(e) => setEndLat(e.target.value)}
            placeholder="End lat"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          />
          <input
            value={endLng}
            onChange={(e) => setEndLng(e.target.value)}
            placeholder="End lng"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
          />
        </div>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            placeholder="Nama rute (opsional)"
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs w-full sm:w-auto"
          />
          <button
            onClick={saveCurrentRoute}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 w-full sm:w-auto"
          >
            Simpan Rute
          </button>
          <button
            onClick={analyzeRouteSafety}
            disabled={routeSafetyLoading}
            className="rounded-md border border-teal-300 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 disabled:opacity-60 w-full sm:w-auto"
          >
            {routeSafetyLoading ? "Menganalisis..." : "Analisis Rute AI"}
          </button>
        </div>
        {savedRoutes.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">Rute Tersimpan</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {savedRoutes.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{r.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.startLat}, {r.startLng} {"->"} {r.endLat}, {r.endLng}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => loadSavedRoute(r)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex-1 sm:flex-none"
                    >
                      Pakai
                    </button>
                    <button
                      onClick={() => removeSavedRoute(r.id)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 flex-1 sm:flex-none"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          {!routeSafety?.best ? (
            <p className="text-xs text-slate-500">
              Isi semua koordinat lalu klik &quot;Analisis Rute AI&quot;.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                Risk Level:{" "}
                <span
                  className={
                    routeSafety.best.risk_level === "HIGH"
                      ? "text-red-600"
                      : routeSafety.best.risk_level === "MEDIUM"
                      ? "text-amber-600"
                      : "text-teal-700"
                  }
                >
                  {routeSafety.best.risk_level}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                {routeSafety.best.label} - Score: {routeSafety.best.risk_score} - Nearby:{" "}
                {routeSafety.best.near_count} (High: {routeSafety.best.high_count}) - Estimasi{" "}
                {routeSafety.best.distance_km} km / {routeSafety.best.duration_min} menit
              </p>
            </div>
          )}
        </div>
        {routeSafety && routeSafety.routes.length > 1 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">Saran Jalur Alternatif (Routing Engine)</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {routeSafety.routes.slice(1).map((alt) => (
                <div key={`${alt.label}-${alt.rank}`} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {alt.label} - {alt.risk_level} - score {alt.risk_score} - {alt.distance_km} km
                  </p>
                  <a
                    href={alt.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Buka di Google Maps
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
        {nearbyRisk && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">
                Risiko Sekitar Lokasi:{" "}
                <span
                  className={
                    nearbyRisk.level === "HIGH"
                      ? "text-red-600"
                      : nearbyRisk.level === "MEDIUM"
                      ? "text-amber-600"
                      : "text-teal-700"
                  }
                >
                  {nearbyRisk.level}
                </span>{" "}
                (score {nearbyRisk.score})
              </p>
            </div>
            <div className="px-4 py-3 text-xs text-slate-600 space-y-1">
              {nearbyRisk.items.length === 0 ? (
                <p>Tidak ada laporan aktif dalam radius terdekat.</p>
              ) : (
                nearbyRisk.items.slice(0, 5).map((item) => (
                  <p key={item.id}>
                    #{item.id} - {item.issue_type} - {item.priority_label} - {item.distance_km.toFixed(2)} km
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      <section className="app-card p-5 md:p-6">
        <h2 className="text-base font-semibold text-slate-900">Informasi Keselamatan Warga</h2>
        <p className="text-sm text-slate-600 mt-2">{headline}</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {tips.map((tip) => (
            <li key={tip}>- {tip}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
