"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const PinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface FlyRequest {
  lat: number;
  lng: number;
  id: number;
}

function MapController({
  onMapClick,
  flyRequest,
}: {
  onMapClick: (lat: number, lng: number) => void;
  flyRequest: FlyRequest | null;
}) {
  const map = useMap();

  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (!flyRequest) return;
    map.flyTo([flyRequest.lat, flyRequest.lng], 16, { duration: 1 });
  }, [flyRequest, map]);

  return null;
}

export interface LocationPickerMapProps {
  onChange: (lat: number, lng: number, address: string) => void;
  initialLat?: number;
  initialLng?: number;
}

interface SearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

const DEFAULT_CENTER: [number, number] = [-6.200, 106.816];

export default function LocationPickerMap({
  onChange,
  initialLat,
  initialLng,
}: LocationPickerMapProps) {
  const hasInitial = initialLat !== undefined && initialLng !== undefined;
  const [position, setPosition] = useState<[number, number] | null>(
    hasInitial ? [initialLat, initialLng] : null
  );
  const [address, setAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [searchNoResult, setSearchNoResult] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const flyIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id,en`,
        { headers: { "User-Agent": "CivicAI-urban-issue-reporting/1.0" } }
      );
      const data = await res.json();
      const addr: string = data.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setAddress(addr);
      onChangeRef.current(lat, lng, addr);
    } catch {
      const fallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setAddress(fallback);
      onChangeRef.current(lat, lng, fallback);
    }
  }, []);

  const handlePositionChange = useCallback(
    (lat: number, lng: number) => {
      setPosition([lat, lng]);
      setLocationError(null);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (query.trim().length < 3) {
      setSearchResults([]);
      setSearchNoResult(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&accept-language=id,en`,
          { headers: { "User-Agent": "CivicAI-urban-issue-reporting/1.0" } }
        );
        const data: SearchResult[] = await res.json();
        setSearchResults(data);
        setSearchNoResult(data.length === 0);
      } catch {
        setSearchResults([]);
        setSearchNoResult(true);
      } finally {
        setSearching(false);
      }
    }, 450);
  }, []);

  const selectResult = useCallback((result: SearchResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    setSearchQuery(result.display_name);
    setSearchResults([]);
    setSearchNoResult(false);
    setPosition([lat, lng]);
    setAddress(result.display_name);
    setLocationError(null);
    setFlyRequest({ lat, lng, id: ++flyIdRef.current });
    onChangeRef.current(lat, lng, result.display_name);
  }, []);

  const useGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      return;
    }
    setGpsLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGpsLoading(false);
        setPosition([lat, lng]);
        setFlyRequest({ lat, lng, id: ++flyIdRef.current });
        reverseGeocode(lat, lng);
      },
      () => {
        setGpsLoading(false);
        setLocationError("Unable to get GPS location. Please allow location access or pin manually.");
      },
      { timeout: 10000 }
    );
  }, [reverseGeocode]);

  return (
    <div className="space-y-3">
      <div className="relative z-10">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              {searching ? (
                <svg className="animate-spin text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25" />
                  <path d="M21 12a9 9 0 00-9-9" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setSearchResults([]), 150)}
              placeholder="Search by address or place name"
              className="app-input w-full pl-9"
            />
          </div>

          <button
            type="button"
            onClick={useGPS}
            disabled={gpsLoading}
            title="Use my GPS location"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {gpsLoading ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 00-9-9" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
            )}
            <span className="text-xs font-semibold">GPS</span>
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul className="absolute left-0 right-16 z-40 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {searchResults.map((r, i) => (
              <li key={i} className="border-b border-slate-100 last:border-0">
                <button
                  type="button"
                  onMouseDown={() => selectResult(r)}
                  className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-teal-50 transition"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!searching && searchNoResult && searchQuery.trim().length >= 3 && (
          <div className="absolute left-0 right-16 z-40 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow">
            No matching location found. Try another keyword.
          </div>
        )}
      </div>

      {address && (
        <div className="flex items-start gap-2 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span className="leading-snug">{address}</span>
        </div>
      )}

      {locationError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          {locationError}
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-slate-200">
        <MapContainer
          center={position ?? DEFAULT_CENTER}
          zoom={position ? 15 : 12}
          className="h-72 w-full z-0"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {position && (
            <Marker
              position={position}
              icon={PinIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const marker = e.target as L.Marker;
                  const ll = marker.getLatLng();
                  handlePositionChange(ll.lat, ll.lng);
                },
              }}
            >
              <Popup>
                <span className="text-xs">Drag marker to fine-tune location</span>
              </Popup>
            </Marker>
          )}
          <MapController onMapClick={handlePositionChange} flyRequest={flyRequest} />
        </MapContainer>
      </div>

      {!position ? (
        <p className="text-xs text-slate-500 text-center py-1">Select location by map click, search, or GPS.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex justify-between">
            <span className="text-xs text-slate-500">Latitude</span>
            <span className="text-xs text-slate-700" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              {position[0].toFixed(6)}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex justify-between">
            <span className="text-xs text-slate-500">Longitude</span>
            <span className="text-xs text-slate-700" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
              {position[1].toFixed(6)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
