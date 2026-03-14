"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import HotspotMap from "@/components/HotspotMap";
import { getCitizenHotspots, getCitizenNearbyRisk, type HotspotItem } from "@/services/api";

function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const cx = x1 + clamped * dx;
  const cy = y1 + clamped * dy;
  return Math.hypot(px - cx, py - cy);
}

function toMapsDirUrl(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  waypointLat: number,
  waypointLng: number
): string {
  const params = new URLSearchParams({
    api: "1",
    origin: `${startLat},${startLng}`,
    destination: `${endLat},${endLng}`,
    waypoints: `${waypointLat},${waypointLng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

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
    items: Array<{ id: number; issue_type: string; distance_km: number; priority_label: string }>;
  } | null>(null);
  const [dismissAlert, setDismissAlert] = useState(false);

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
  }, [days, issueType, router]);

  const topHotspots = useMemo(() => hotspots.slice(0, 8), [hotspots]);
  const routeRisk = useMemo(() => {
    const aLat = Number.parseFloat(startLat);
    const aLng = Number.parseFloat(startLng);
    const bLat = Number.parseFloat(endLat);
    const bLng = Number.parseFloat(endLng);

    if (
      Number.isNaN(aLat) ||
      Number.isNaN(aLng) ||
      Number.isNaN(bLat) ||
      Number.isNaN(bLng) ||
      hotspots.length === 0
    ) {
      return null;
    }

    const corridor = 0.003; // ~300m latitude band
    const nearHotspots = hotspots.filter((h) => {
      const d = pointToSegmentDistance(h.lat, h.lng, aLat, aLng, bLat, bLng);
      return d <= corridor;
    });

    const score = nearHotspots.reduce((acc, h) => acc + h.risk_score, 0);
    const criticalCount = nearHotspots.filter((h) => h.risk_level === "CRITICAL").length;
    const highCount = nearHotspots.filter((h) => h.risk_level === "HIGH").length;

    let label: "LOW" | "MEDIUM" | "HIGH";
    if (criticalCount >= 1 || score >= 50) label = "HIGH";
    else if (highCount >= 2 || score >= 20) label = "MEDIUM";
    else label = "LOW";

    const advice =
      label === "HIGH"
        ? "Rute melewati area rawan tinggi. Disarankan cari jalur alternatif."
        : label === "MEDIUM"
        ? "Rute cukup berisiko. Kurangi kecepatan dan waspada lubang jalan."
        : "Rute relatif lebih aman berdasarkan data hotspot saat ini.";

    return {
      label,
      advice,
      nearCount: nearHotspots.length,
      criticalCount,
      highCount,
      score: Number(score.toFixed(2)),
    };
  }, [startLat, startLng, endLat, endLng, hotspots]);

  const alternativeRoutes = useMemo(() => {
    if (!routeRisk || routeRisk.label === "LOW") return [];

    const aLat = Number.parseFloat(startLat);
    const aLng = Number.parseFloat(startLng);
    const bLat = Number.parseFloat(endLat);
    const bLng = Number.parseFloat(endLng);
    if (
      Number.isNaN(aLat) ||
      Number.isNaN(aLng) ||
      Number.isNaN(bLat) ||
      Number.isNaN(bLng)
    ) {
      return [];
    }

    const dx = bLat - aLat;
    const dy = bLng - aLng;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const midLat = (aLat + bLat) / 2;
    const midLng = (aLng + bLng) / 2;
    const offset = routeRisk.label === "HIGH" ? 0.01 : 0.006;

    const candidates = [
      {
        label: "Alternatif A",
        waypointLat: Number((midLat + nx * offset).toFixed(6)),
        waypointLng: Number((midLng + ny * offset).toFixed(6)),
      },
      {
        label: "Alternatif B",
        waypointLat: Number((midLat - nx * offset).toFixed(6)),
        waypointLng: Number((midLng - ny * offset).toFixed(6)),
      },
    ];

    return candidates.map((c) => ({
      ...c,
      mapsUrl: toMapsDirUrl(aLat, aLng, bLat, bLng, c.waypointLat, c.waypointLng),
    }));
  }, [routeRisk, startLat, startLng, endLat, endLng]);

  useEffect(() => {
    setDismissAlert(false);
  }, [nearbyRisk?.level]);

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
        </div>
      </section>

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

      {nearbyRisk && nearbyRisk.level === "HIGH" && !dismissAlert && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 md:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-700">Peringatan Risiko Tinggi di Sekitar Lokasi Anda</p>
              <p className="text-xs text-red-600 mt-1">
                Prioritaskan keselamatan: hindari kecepatan tinggi, jaga jarak aman, dan pertimbangkan jalur alternatif.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/report"
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Laporkan Bahaya
              </Link>
              <button
                onClick={() => setDismissAlert(true)}
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
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
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={detectCurrentLocationRisk}
            disabled={locationLoading}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {locationLoading ? "Mendeteksi lokasi..." : "Gunakan lokasi saya"}
          </button>
          {locationRiskInfo && <p className="text-xs text-slate-600">{locationRiskInfo}</p>}
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
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          {!routeRisk ? (
            <p className="text-xs text-slate-500">
              Isi semua koordinat untuk melihat estimasi risiko rute.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                Risk Level:{" "}
                <span
                  className={
                    routeRisk.label === "HIGH"
                      ? "text-red-600"
                      : routeRisk.label === "MEDIUM"
                      ? "text-amber-600"
                      : "text-teal-700"
                  }
                >
                  {routeRisk.label}
                </span>
              </p>
              <p className="text-xs text-slate-600">{routeRisk.advice}</p>
              <p className="text-xs text-slate-500">
                Hotspot sekitar jalur: {routeRisk.nearCount} (Critical: {routeRisk.criticalCount}, High:{" "}
                {routeRisk.highCount}) - Score: {routeRisk.score}
              </p>
            </div>
          )}
        </div>
        {alternativeRoutes.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-800">Saran Jalur Alternatif (Eksperimental)</p>
            </div>
            <div className="px-4 py-3 space-y-2">
              {alternativeRoutes.map((alt) => (
                <div key={alt.label} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">
                    {alt.label}: waypoint {alt.waypointLat}, {alt.waypointLng}
                  </p>
                  <a
                    href={alt.mapsUrl}
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
