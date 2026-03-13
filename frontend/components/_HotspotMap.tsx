"use client";

import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { HotspotItem } from "@/services/api";

const DEFAULT_CENTER: [number, number] = [-6.2, 106.816];

function getMarkerColor(item: HotspotItem): string {
  if (item.risk_level === "CRITICAL") return "#b91c1c";
  if (item.risk_level === "HIGH") return "#dc2626";
  if (item.risk_level === "MEDIUM") return "#f59e0b";
  return "#0f766e";
}

export default function HotspotMap({
  hotspots,
  mode,
  onSelectHotspot,
}: {
  hotspots: HotspotItem[];
  mode: "circles" | "heatmap";
  onSelectHotspot?: (item: HotspotItem) => void;
}) {
  const maxCount = hotspots.length ? Math.max(...hotspots.map((h) => h.count)) : 1;
  const center: [number, number] = hotspots.length
    ? [hotspots[0].lat, hotspots[0].lng]
    : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={12} className="h-80 w-full z-0" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mode === "heatmap" &&
        hotspots.map((item) => {
          const intensity = item.count / maxCount;
          const color = getMarkerColor(item);
          return (
            <Circle
              key={`heat-${item.lat}-${item.lng}`}
              center={[item.lat, item.lng]}
              radius={200 + intensity * 900}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.08 + intensity * 0.25,
                opacity: 0.3,
                weight: 0.8,
              }}
            />
          );
        })}
      {hotspots.map((item) => {
        const radius = 5 + (item.count / maxCount) * 16;
        const color = getMarkerColor(item);
        return (
          <CircleMarker
            key={`${item.lat}-${item.lng}`}
            center={[item.lat, item.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: mode === "heatmap" ? 0.6 : 0.35,
              weight: mode === "heatmap" ? 2 : 1.5,
            }}
            eventHandlers={{
              click: () => onSelectHotspot?.(item),
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">Hotspot Area</p>
                <p>Total issues: {item.count}</p>
                <p>High priority: {item.high_count}</p>
                <p>Open issues: {item.open_count}</p>
                <p>Risk: {item.risk_level}</p>
                <p className="text-slate-500 mt-1">
                  {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
