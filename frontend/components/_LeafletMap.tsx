"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon paths broken by webpack bundling
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapProps {
  latitude: number;
  longitude: number;
  zoom?: number;
}

export default function LeafletMap({ latitude, longitude, zoom = 14 }: MapProps) {
  useEffect(() => {
    L.Marker.prototype.options.icon = DefaultIcon;
  }, []);

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={zoom}
      className="h-64 w-full z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={DefaultIcon}>
        <Popup>Reported point</Popup>
      </Marker>
    </MapContainer>
  );
}
