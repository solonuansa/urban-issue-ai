import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Leaflet mutates DOM nodes with _leaflet_id; React Strict Mode's
  // double-mount causes "Map container is already initialized" — disable it.
  reactStrictMode: false,
  // Fix workspace root detection when multiple lockfiles exist
  outputFileTracingRoot: path.join(__dirname, "../"),
  // Allow importing CSS from node_modules (required by leaflet)
  transpilePackages: ["leaflet", "react-leaflet"],
};

export default nextConfig;
