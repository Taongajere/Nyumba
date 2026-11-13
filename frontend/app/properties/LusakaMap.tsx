"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet's default pin icons in Next.js so they never show up as broken images
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

// Helper that smoothly flies the map camera whenever you pick a new landmark
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 12, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function LusakaMap({
  listings,
  landmark,
  radiusKm,
}: {
  listings: any[];
  landmark: { name: string; lat: number | null; lng: number | null };
  radiusKm: number;
}) {
  // Default center: Lusaka city center (-15.4167, 28.2833)
  const center: [number, number] =
    landmark.lat !== null && landmark.lng !== null
      ? [landmark.lat, landmark.lng]
      : [-15.4167, 28.2833];

  // Only keep listings that have saved GPS coordinates
  const pinnedListings = listings.filter(
    (l) => l.property?.latitude != null && l.property?.longitude != null
  );

  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-[#133a2a]/20 bg-white shadow-sm">
      <div className="h-80 w-full sm:h-96">
        <MapContainer
          center={center}
          zoom={12}
          scrollWheelZoom={false}
          className="h-full w-full z-0"
        >
          {/* Free OpenStreetMap street tiles */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <RecenterMap center={center} />

          {/* If a landmark is chosen, draw the landmark pin + search radius circle */}
          {landmark.lat !== null && landmark.lng !== null && (
            <>
              <Marker position={[landmark.lat, landmark.lng]} icon={landmarkIcon}>
                <Popup>
                  <strong>{landmark.name}</strong>
                  <br />
                  Showing homes within {radiusKm} km
                </Popup>
              </Marker>

              <Circle
                center={[landmark.lat, landmark.lng]}
                radius={radiusKm * 1000} // Leaflet measures radius in meters
                pathOptions={{
                  color: "#133a2a",
                  fillColor: "#133a2a",
                  fillOpacity: 0.1,
                }}
              />
            </>
          )}

          {/* Drop a house pin for every matching property */}
          {pinnedListings.map((listing) => (
            <Marker
              key={listing.id}
              position={[listing.property.latitude, listing.property.longitude]}
              icon={propertyIcon}
            >
              <Popup>
                <div className="text-sm">
                  <strong className="text-[#133a2a]">
                    {listing.property.title}
                  </strong>
                  <p className="my-1 font-bold">
                    K{Number(listing.price).toLocaleString()} ({listing.kind})
                  </p>
                  <Link
                    href={`/properties/${listing.id}`}
                    className="font-semibold text-[#9a741c] underline"
                  >
                    View details →
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}