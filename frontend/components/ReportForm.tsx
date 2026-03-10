"use client";

import { useCallback, useState } from "react";
import { submitReport, type SubmitReportResponse } from "../services/api";
import PriorityBadge from "./PriorityBadge";
import Map from "./Map";
import LocationPicker from "./LocationPicker";

const LOCATION_PRESETS = [
  { label: "Main Road", value: 100, desc: "Arterial roads and highways" },
  { label: "Secondary", value: 70, desc: "District and collector roads" },
  { label: "Residential", value: 40, desc: "Housing area streets" },
  { label: "Alley", value: 20, desc: "Narrow lanes and footpaths" },
];

function StepBadge({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-semibold flex items-center justify-center">{index}</span>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" />
    </svg>
  );
}

export default function ReportForm() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [locationImportance, setLocationImportance] = useState(70);
  const [selectedPreset, setSelectedPreset] = useState(1);
  const [result, setResult] = useState<SubmitReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLocationChange = useCallback((lat: number, lng: number, address: string) => {
    setPickedLocation({ lat, lng, address });
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (JPG, PNG, or WEBP).");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  };

  const resetForm = () => {
    setResult(null);
    setImage(null);
    setPreview(null);
    setPickedLocation(null);
    setLocationImportance(70);
    setSelectedPreset(1);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image || !pickedLocation) return;

    setLoading(true);
    setError(null);

    try {
      const data = await submitReport({
        image,
        latitude: pickedLocation.lat,
        longitude: pickedLocation.lng,
        location_importance: locationImportance,
      });
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Submission failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reportData = result?.data;
  const isSubmitDisabled = loading || !image || !pickedLocation;
  const missingRequirements = [
    !image ? "photo evidence" : null,
    !pickedLocation ? "location pin" : null,
  ].filter(Boolean) as string[];

  if (reportData) {
    return (
      <div className="space-y-5 pb-8">
        <section className="app-card p-5 md:p-6 border-emerald-200 bg-emerald-50/60">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-emerald-700 font-semibold">Report successfully submitted</p>
              <p className="text-sm text-emerald-700/80 mt-1">Reference ID: #{reportData.id}</p>
            </div>
            <PriorityBadge priority={reportData.priority_label} />
          </div>
        </section>

        <section className="app-card p-5 md:p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Classification Result</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Issue type</p>
              <p className="text-sm font-semibold text-slate-900 capitalize mt-1">{reportData.issue_type}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Severity</p>
              <p className="text-sm font-semibold text-slate-900 capitalize mt-1">{reportData.severity_level}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Confidence</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {(((reportData.cv_confidence ?? 0) * 100).toFixed(0))}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500 mb-1.5">Urgency score</p>
              <div className="flex items-center gap-2">
                <div className="h-2 bg-slate-200 rounded-full flex-1">
                  <div className="h-2 bg-teal-600 rounded-full" style={{ width: `${reportData.urgency_score}%` }} />
                </div>
                <span className="text-xs text-slate-700" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{reportData.urgency_score}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="app-card p-5 md:p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-2">Automated Response</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{reportData.auto_response}</p>
        </section>

        <section className="app-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">Reported Location</h3>
          </div>
          <Map latitude={reportData.latitude} longitude={reportData.longitude} />
        </section>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={resetForm}
            className="flex-1 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium py-2.5 hover:bg-slate-50"
          >
            Submit another report
          </button>
          <a
            href="/dashboard"
            className="flex-1 rounded-xl bg-teal-700 text-white text-sm font-semibold py-2.5 text-center hover:bg-teal-800"
          >
            Open dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-8">
      <section className="app-card p-5 md:p-6">
        <StepBadge index="1" title="Upload Evidence" />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={`relative rounded-2xl border-2 border-dashed transition ${
            dragOver
              ? "border-teal-500 bg-teal-50"
              : preview
                ? "border-slate-200"
                : "border-slate-300 bg-slate-50/40 hover:border-teal-400"
          }`}
        >
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" className="w-full h-60 object-cover rounded-2xl" />
              <div className="absolute right-3 top-3">
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setPreview(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                >
                  Change photo
                </button>
              </div>
            </div>
          ) : (
            <div className="h-52 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-semibold text-slate-700">Drop image here or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">Supported formats: JPG, PNG, WEBP</p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            required
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        {image && (
          <p className="mt-3 text-xs text-slate-500">
            Selected: <span className="font-medium text-slate-700">{image.name}</span> ({(image.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}
      </section>

      <section className="app-card p-5 md:p-6">
        <StepBadge index="2" title="Set Location" />
        <LocationPicker onChange={handleLocationChange} />
      </section>

      <section className="app-card p-5 md:p-6">
        <StepBadge index="3" title="Road Context" />
        <div className="grid sm:grid-cols-2 gap-3">
          {LOCATION_PRESETS.map((preset, idx) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setSelectedPreset(idx);
                setLocationImportance(preset.value);
              }}
              className={`rounded-xl border p-3.5 text-left transition ${
                selectedPreset === idx
                  ? "border-teal-500 bg-teal-50"
                  : "border-slate-200 hover:border-slate-300 bg-white"
              }`}
            >
              <p className={`text-sm font-semibold ${selectedPreset === idx ? "text-teal-800" : "text-slate-800"}`}>
                {preset.label}
              </p>
              <p className="text-xs text-slate-500 mt-1">{preset.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {missingRequirements.length > 0 && !loading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Complete required input: {missingRequirements.join(" and ")}.
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full rounded-xl bg-teal-700 text-white py-3 text-sm font-semibold hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <SpinnerIcon />
            Processing report...
          </span>
        ) : (
          "Submit report"
        )}
      </button>
    </form>
  );
}
