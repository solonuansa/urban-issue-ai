"use client";

import dynamic from "next/dynamic";

interface MapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
}

// Leaflet requires the browser's `window` object — disable SSR.
const LeafletMap = dynamic(() => import("./_LeafletMap"), { ssr: false });

export default function Map(props: MapProps) {
  return <LeafletMap {...props} />;
}

