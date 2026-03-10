"use client";

import dynamic from "next/dynamic";
import type { LocationPickerMapProps } from "./_LocationPickerMap";

const LocationPickerMap = dynamic(() => import("./_LocationPickerMap"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
      <p className="text-sm text-slate-500">Loading map...</p>
    </div>
  ),
});

export default function LocationPicker(props: LocationPickerMapProps) {
  return <LocationPickerMap {...props} />;
}
