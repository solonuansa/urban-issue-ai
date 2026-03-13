"use client";

import dynamic from "next/dynamic";
import type { HotspotItem } from "@/services/api";

const HotspotMapClient = dynamic(() => import("./_HotspotMap"), { ssr: false });

export default function HotspotMap({
  hotspots,
  mode,
  onSelectHotspot,
}: {
  hotspots: HotspotItem[];
  mode: "circles" | "heatmap";
  onSelectHotspot?: (item: HotspotItem) => void;
}) {
  return (
    <HotspotMapClient
      hotspots={hotspots}
      mode={mode}
      onSelectHotspot={onSelectHotspot}
    />
  );
}
