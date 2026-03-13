"use client";

import dynamic from "next/dynamic";
import type { HotspotItem } from "@/services/api";

const HotspotMapClient = dynamic(() => import("./_HotspotMap"), { ssr: false });

export default function HotspotMap({
  hotspots,
}: {
  hotspots: HotspotItem[];
}) {
  return <HotspotMapClient hotspots={hotspots} />;
}
