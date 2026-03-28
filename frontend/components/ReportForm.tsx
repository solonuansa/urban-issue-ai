"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { submitReport, type SubmitReportResponse } from "../services/api";
import { getAuthToken } from "@/lib/auth";
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
  const previewUrlRef = useRef<string | null>(null);

  const handleLocationChange = useCallback((lat: number, lng: number, address: string) => {
    setPickedLocation({ lat, lng, address });
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid image file (JPG, PNG, or WEBP).");
      return;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;

    setImage(file);
    setPreview(previewUrl);
    setError(null);
  };

  const resetForm = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
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
    if (!getAuthToken()) {
      setError("Please sign in first to submit a report.");
      return;
    }

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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15 },
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

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  if (reportData) {
    return (
      <motion.div initial="hidden" animate="show" variants={containerVariants} className="space-y-6 pb-8">
        <motion.section variants={itemVariants} className="app-card overflow-hidden border-teal-200 shadow-md shadow-teal-900/5">
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50/30 p-5 md:p-6 border-b border-teal-100/50">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                <div>
                  <h3 className="text-teal-800 font-bold tracking-wide">Report Submitted Successfully</h3>
                  <p className="text-sm text-teal-600/80 mt-0.5 font-medium">Reference ID: #{reportData.id}</p>
                </div>
              </div>
              <PriorityBadge priority={reportData.priority_label} className="self-start md:self-auto bg-white" />
            </div>
          </div>
          
          <div className="p-5 md:p-6 bg-white/50 space-y-6">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Classification Engine Result</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Issue type</p>
                  <p className="text-sm font-bold text-slate-800 capitalize mt-1.5">{reportData.issue_type}</p>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Severity</p>
                  <p className="text-sm font-bold text-slate-800 capitalize mt-1.5">{reportData.severity_level}</p>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">AI Confidence</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="h-1.5 bg-slate-100 rounded-full flex-1 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${(reportData.cv_confidence ?? 0) * 100}%` }} transition={{ duration: 1, delay: 0.5 }} className="h-full bg-slate-400 rounded-full" />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{(((reportData.cv_confidence ?? 0) * 100).toFixed(0))}%</span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Urgency score</p>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 bg-slate-100 rounded-full flex-1 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${reportData.urgency_score}%` }} transition={{ duration: 1, delay: 0.7 }} className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full" />
                    </div>
                    <span className="text-xs font-bold text-slate-700" style={{ fontFamily: "var(--font-jetbrains-mono)" }}>{reportData.urgency_score}</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
               <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">System Response</h3>
               <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
                 <p className="text-sm text-slate-700 leading-relaxed font-medium">{reportData.auto_response}</p>
               </div>
            </div>
            
            <div>
               <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Location Context</h3>
               <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm h-48">
                 <Map latitude={reportData.latitude} longitude={reportData.longitude} />
               </div>
            </div>
          </div>
        </motion.section>

        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={resetForm}
            className="flex-1 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold py-3 hover:bg-slate-50 hover:shadow-sm transition-all active:scale-[0.98]"
          >
            Submit another report
          </button>
          <a
            href="/dashboard"
            className="flex-1 rounded-xl bg-teal-700 text-white text-sm font-bold py-3 text-center shadow-md shadow-teal-900/20 hover:bg-teal-800 transition-all active:scale-[0.98]"
          >
            Open dashboard
          </a>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.form 
      initial="hidden" 
      animate="show" 
      variants={containerVariants} 
      onSubmit={handleSubmit} 
      className="space-y-6 pb-8 max-w-3xl mx-auto"
    >
      <motion.section variants={itemVariants} className="app-card glass-panel p-5 md:p-7 shadow-sm">
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
          className={`relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden ${
            dragOver
              ? "border-teal-500 bg-teal-50 shadow-inner scale-[1.02]"
              : preview
                ? "border-slate-200 bg-white"
                : "border-slate-300 bg-slate-50/50 hover:border-teal-400 hover:bg-slate-50 group"
          }`}
        >
          {preview ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative">
              <div className="relative w-full h-[280px]">
                <Image src={preview} alt="Preview" fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 768px" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
              <div className="absolute bottom-4 right-4 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (previewUrlRef.current) {
                      URL.revokeObjectURL(previewUrlRef.current);
                      previewUrlRef.current = null;
                    }
                    setImage(null);
                    setPreview(null);
                  }}
                  className="rounded-lg border border-white/20 bg-white/20 backdrop-blur-md px-3 py-2 text-[11px] sm:text-xs font-bold text-white hover:bg-white/30 transition-all shadow-lg flex items-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  Replace photo
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="h-[240px] flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-teal-500 group-hover:scale-110 transition-all duration-300 mb-4">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              </div>
              <p className="text-sm font-bold text-slate-700">Drag & drop image here</p>
              <p className="text-xs font-medium text-slate-500 mt-1.5">or click to browse from your device</p>
              <div className="mt-4 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                JPG, PNG, WEBP Only
              </div>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            required
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        {image && (
          <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Selected: <span className="font-bold text-slate-700">{image.name}</span> ({(image.size / 1024 / 1024).toFixed(2)} MB)
          </motion.p>
        )}
      </motion.section>

      <motion.section variants={itemVariants} className="app-card glass-panel p-5 md:p-7 shadow-sm">
        <StepBadge index="2" title="Pinpoint Location" />
        <div className="rounded-2xl overflow-hidden border border-slate-200">
          <LocationPicker onChange={handleLocationChange} />
        </div>
      </motion.section>

      <motion.section variants={itemVariants} className="app-card glass-panel p-5 md:p-7 shadow-sm">
        <StepBadge index="3" title="Road Context" />
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          {LOCATION_PRESETS.map((preset, idx) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setSelectedPreset(idx);
                setLocationImportance(preset.value);
              }}
              className={`relative rounded-xl border p-3.5 sm:p-4 text-left transition-all duration-200 overflow-hidden ${
                selectedPreset === idx
                  ? "border-teal-500 bg-teal-50/50 shadow-[0_0_15px_rgba(20,184,166,0.1)] scale-[1.02]"
                  : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              {selectedPreset === idx && (
                <motion.div layoutId="preset-active" className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
              )}
              <div className="flex items-center justify-between">
                <p className={`text-sm font-bold tracking-wide ${selectedPreset === idx ? "text-teal-800" : "text-slate-700"}`}>
                  {preset.label}
                </p>
                {selectedPreset === idx && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500"><polyline points="20 6 9 17 4 12"></polyline></svg>
                )}
              </div>
              <p className="text-xs font-medium text-slate-500 mt-1.5">{preset.desc}</p>
            </button>
          ))}
        </div>
      </motion.section>

      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 flex flex-col gap-2">
           <div className="flex items-center gap-2 font-bold"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Error</div>
          {error}
        </motion.div>
      )}

      {missingRequirements.length > 0 && !loading && (
        <motion.div variants={itemVariants} className="text-[11px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50/50 border border-amber-200/50 px-4 py-3 rounded-xl flex items-center justify-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          Requires: {missingRequirements.join(" & ")}.
        </motion.div>
      )}

      <motion.button
        variants={itemVariants}
        type="submit"
        disabled={isSubmitDisabled}
        className="relative w-full rounded-2xl bg-teal-700 text-white py-3.5 sm:py-4 text-sm font-bold tracking-wide overflow-hidden shadow-lg shadow-teal-900/20 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2.5">
            <SpinnerIcon />
            Analyzing with AI Engine...
          </span>
        ) : (
          "Submit Verification Report"
        )}
      </motion.button>
    </motion.form>
  );
}
