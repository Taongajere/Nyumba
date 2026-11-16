"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Layer,
  Map as MapGL,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { setWorkerUrl, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LUSAKA_CENTER, formatZMW, type Listing } from "@/lib/listings";
import type { Bounds } from "@/lib/use-listing-search";

// Free vector style with no API key. Attribution is shown by the map itself.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SOURCE_ID = "listings";
const CLUSTER_LAYER = "clusters";
const POINT_LAYER = "unclustered-point";
const FONT = ["Noto Sans Bold"];

// Turbopack doesn't bundle MapLibre's worker, so serve it from /public (see scripts-copy-maplibre-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

type Props = {
  listings: Listing[];
  visible: boolean; // false while the mobile "List" view is showing
  onBoundsChange: (bounds: Bounds) => void;
};

// "ZMW 6,500" -> "6.5k" so pins stay small. The popup shows the full price.
function compactZMW(price: string): string {
  const n = Number(price);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export default function ListingsMap({ listings, visible, onBoundsChange }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);

  // Only listings with GPS coordinates can be pinned.
  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: listings.flatMap((listing) => {
        const { latitude, longitude } = listing.property;
        if (latitude == null || longitude == null) return [];
        return [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
            properties: { id: listing.id, label: compactZMW(listing.price) },
          },
        ];
      }),
    }),
    [listings]
  );

  // Hidden maps (mobile list view) measure 0×0 on mount; resize when they appear.
  useEffect(() => {
    if (visible) mapRef.current?.getMap().resize();
  }, [visible]);

  const reportBounds = useCallback(
    (map: MapLibreMap) => {
      const b = map.getBounds();
      onBoundsChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    },
    [onBoundsChange]
  );

  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    const map = mapRef.current?.getMap();
    if (!feature || !map) {
      setSelectedId(null);
      return;
    }

    if (feature.layer?.id === CLUSTER_LAYER && feature.geometry.type === "Point") {
      // Zoom into a cluster so its pins separate.
      const source = map.getSource(SOURCE_ID) as GeoJSONSource;
      const clusterId = feature.properties.cluster_id as number;
      const center = feature.geometry.coordinates as [number, number];
      source
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map.easeTo({ center, zoom, duration: 500 });
        })
        .catch(() => {});
      return;
    }

    setSelectedId(Number(feature.properties.id));
  }, []);

  const selected = listings.find((listing) => listing.id === selectedId) ?? null;

  return (
    <div className="relative h-full w-full">
    <MapGL
      ref={mapRef}
      mapStyle={MAP_STYLE}
      initialViewState={{ longitude: LUSAKA_CENTER[0], latitude: LUSAKA_CENTER[1], zoom: 11.5 }}
      style={{ width: "100%", height: "100%" }}
      cursor={hovering ? "pointer" : "grab"}
      interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={handleClick}
      onLoad={(e) => reportBounds(e.target)}
      onMoveEnd={(e) => reportBounds(e.target)}
      attributionControl={{ compact: true }}
    >
      <NavigationControl position="top-right" showCompass={false} />

      <Source
        id={SOURCE_ID}
        type="geojson"
        data={geojson}
        cluster
        clusterRadius={50}
        clusterMaxZoom={14}
      >
        <Layer
          id={CLUSTER_LAYER}
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "#133a2a",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3,
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 50, 28],
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": FONT,
            "text-size": 13,
            "text-allow-overlap": true,
          }}
          paint={{ "text-color": "#ffffff" }}
        />
        <Layer
          id={POINT_LAYER}
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "#d4a843",
            "circle-stroke-color": "#133a2a",
            "circle-stroke-width": 2,
            "circle-radius": 8,
          }}
        />
        <Layer
          id="unclustered-label"
          type="symbol"
          filter={["!", ["has", "point_count"]]}
          layout={{
            "text-field": ["get", "label"],
            "text-font": FONT,
            "text-size": 12,
            "text-offset": [0, -1.2],
            "text-anchor": "bottom",
          }}
          paint={{
            "text-color": "#133a2a",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
          }}
        />
      </Source>

      {selected && selected.property.latitude != null && selected.property.longitude != null && (
        <Popup
          longitude={selected.property.longitude}
          latitude={selected.property.latitude}
          anchor="bottom"
          offset={14}
          closeOnClick={false}
          onClose={() => setSelectedId(null)}
          maxWidth="260px"
        >
          <div className="space-y-1 text-sm text-foreground">
            <p className="font-semibold">{selected.property.title}</p>
            <p className="text-xs text-muted-foreground">
              {selected.property.neighbourhood || "Lusaka"} · {selected.property.bedrooms} bed
              {selected.property.bedrooms === 1 ? "" : "s"}
            </p>
            <p className="font-bold text-primary">{formatZMW(selected.price)}</p>
            <Link
              href={`/properties/${selected.id}`}
              className={cn(buttonVariants({ size: "sm" }), "mt-1 w-full")}
            >
              View details
            </Link>
          </div>
        </Popup>
      )}
    </MapGL>

      <button
        type="button"
        onClick={() =>
          mapRef.current?.flyTo({ center: LUSAKA_CENTER, zoom: 11.5, duration: 700 })
        }
        className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-primary shadow-md transition hover:bg-secondary"
      >
        Reset view
      </button>
    </div>
  );
}
