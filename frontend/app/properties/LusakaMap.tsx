"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const propertyIcon = L.divIcon({
  className: "",
  html: `<div style="background:#133a2a;color:#fff;border:2px solid #d4a843;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏠</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const landmarkIcon = L.divIcon({
  className: "",
  html: `<div style="background:#d4a843;color:#133a2a;border:2px solid #133a2a;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,0.3);">📍</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

export default function LusakaMap({
  listings,
  landmark,
  radiusKm,
}: {
  listings: any[];
  landmark: { name: string; lat: number | null; lng: number | null };
  radiusKm: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // 1. Build the map table ONCE when the page opens, and clean it up properly on exit
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-15.4167, 28.2833], // Lusaka center
      zoom: 12,
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // 2. Redraw pins, circles, and camera position whenever filters or listings change
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    // Clear old pins and circles before drawing updated ones
    layerGroup.clearLayers();

    // If a landmark is chosen, fly there and draw the radius circle
    if (landmark.lat !== null && landmark.lng !== null) {
      map.flyTo([landmark.lat, landmark.lng], 12, { duration: 0.8 });

      L.marker([landmark.lat, landmark.lng], { icon: landmarkIcon })
        .bindPopup(
          `<strong>${landmark.name}</strong><br/>Showing homes within ${radiusKm} km`
        )
        .addTo(layerGroup);

      L.circle([landmark.lat, landmark.lng], {
        radius: radiusKm * 1000,
        color: "#133a2a",
        fillColor: "#133a2a",
        fillOpacity: 0.1,
      }).addTo(layerGroup);
    } else {
      map.flyTo([-15.4167, 28.2833], 12, { duration: 0.8 });
    }

    // Add a house pin for every matching property that has GPS coordinates
    listings.forEach((listing) => {
      const lat = listing.property?.latitude;
      const lng = listing.property?.longitude;
      if (lat == null || lng == null) return;

      const title = listing.property?.title || "Untitled Property";
      const price = Number(listing.price).toLocaleString();

      L.marker([lat, lng], { icon: propertyIcon })
        .bindPopup(
          `<div style="font-size:13px;">
            <strong style="color:#133a2a;">${title}</strong>
            <p style="margin:4px 0;font-weight:bold;">K${price} (${listing.kind})</p>
            <a href="/properties/${listing.id}" style="font-weight:600;color:#9a741c;text-decoration:underline;">
              View details →
            </a>
          </div>`
        )
        .addTo(layerGroup);
    });
  }, [listings, landmark, radiusKm]);

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-[#133a2a]/20 bg-white shadow-sm">
      <div ref={containerRef} className="z-0 h-80 w-full sm:h-96" />
    </div>
  );
}