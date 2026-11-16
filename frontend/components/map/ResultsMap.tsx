"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Layer,
  Map as MapGL,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { setWorkerUrl, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Minus, Plus } from "lucide-react";
import type { Bounds } from "@/lib/listing-filters";

// Free vector tiles with no key; the attribution is drawn by the map.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FONT = ["Noto Sans Bold"];
const SOURCE_ID = "results";
const CLUSTER_LAYER = "clusters";
const POINT_LAYER = "points";

// Turbopack doesn't bundle MapLibre's worker, so it is served from /public.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type MapPoint = {
  id: number;
  lat: number;
  lng: number;
  label: string; // short price for the pin
  title: string;
  subtitle: string;
  price: string;
  href: string;
  image?: string;
};

type Props = {
  points: MapPoint[];
  activeId: number | null; // hovered or selected card
  onActivate: (id: number | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
  center: [number, number, number]; // lng, lat, zoom
  overlay?: React.ReactNode; // pills over the top of the map
  footer?: React.ReactNode; // pill over the bottom of the map
};

export default function ResultsMap({ points, activeId, onActivate, onBoundsChange, center, overlay, footer }: Props) {
  const mapRef = useRef<MapRef>(null);
  const [popupId, setPopupId] = useState<number | null>(null);
  const [cursor, setCursor] = useState("grab");

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, label: p.label, active: p.id === activeId || p.id === popupId ? 1 : 0 },
      })),
    }),
    [points, activeId, popupId]
  );

  const reportBounds = useCallback(
    (map: MapLibreMap) => {
      const b = map.getBounds();
      onBoundsChange({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
    },
    [onBoundsChange]
  );

  // Move to a new town when the filter changes.
  useEffect(() => {
    mapRef.current?.flyTo({ center: [center[0], center[1]], zoom: center[2], duration: 600 });
  }, [center]);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const map = mapRef.current?.getMap();
      if (!feature || !map) {
        setPopupId(null);
        return;
      }
      if (feature.layer?.id === CLUSTER_LAYER && feature.geometry.type === "Point") {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        const coords = feature.geometry.coordinates as [number, number];
        source
          .getClusterExpansionZoom(feature.properties.cluster_id as number)
          .then((zoom) => map.easeTo({ center: coords, zoom, duration: 500 }))
          .catch(() => {});
        return;
      }
      const id = Number(feature.properties.id);
      setPopupId(id);
      onActivate(id);
      document.getElementById(`result-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [onActivate]
  );

  const popup = points.find((p) => p.id === popupId);

  return (
    <div className="absolute inset-0">
      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE}
        initialViewState={{ longitude: center[0], latitude: center[1], zoom: center[2] }}
        style={{ width: "100%", height: "100%" }}
        cursor={cursor}
        interactiveLayerIds={[CLUSTER_LAYER, POINT_LAYER]}
        onMouseEnter={(e) => {
          setCursor("pointer");
          const id = e.features?.[0]?.properties?.id;
          if (id !== undefined) onActivate(Number(id));
        }}
        onMouseLeave={() => {
          setCursor("grab");
          onActivate(null);
        }}
        onClick={handleClick}
        onLoad={(e) => reportBounds(e.target)}
        onMoveEnd={(e) => reportBounds(e.target)}
        attributionControl={{ compact: true }}
      >
        <Source id={SOURCE_ID} type="geojson" data={geojson} cluster clusterRadius={46} clusterMaxZoom={14}>
          {/* Soft halo, then the solid blue disc with the count: the reference marker */}
          <Layer
            id="cluster-halo"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": "#2160e8",
              "circle-opacity": 0.16,
              "circle-radius": ["step", ["get", "point_count"], 24, 10, 28, 50, 34],
            }}
          />
          <Layer
            id={CLUSTER_LAYER}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": "#2160e8",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
              "circle-radius": ["step", ["get", "point_count"], 15, 10, 18, 50, 22],
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": FONT,
              "text-size": 12,
              "text-allow-overlap": true,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
          <Layer
            id="point-halo"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": "#2160e8",
              "circle-opacity": 0.18,
              "circle-radius": ["case", ["==", ["get", "active"], 1], 22, 16],
            }}
          />
          <Layer
            id={POINT_LAYER}
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": ["case", ["==", ["get", "active"], 1], "#0f1d33", "#2160e8"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 3,
              "circle-radius": ["case", ["==", ["get", "active"], 1], 11, 8],
            }}
          />
          <Layer
            id="point-label"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "text-field": ["get", "label"],
              "text-font": FONT,
              "text-size": ["case", ["==", ["get", "active"], 1], 13, 11],
              "text-offset": [0, 1.35],
              "text-anchor": "top",
              "symbol-sort-key": ["case", ["==", ["get", "active"], 1], 0, 1],
            }}
            paint={{ "text-color": "#0f1d33", "text-halo-color": "#ffffff", "text-halo-width": 2 }}
          />
        </Source>

        {popup && (
          <Popup
            longitude={popup.lng}
            latitude={popup.lat}
            anchor="bottom"
            offset={18}
            closeOnClick={false}
            onClose={() => setPopupId(null)}
            maxWidth="260px"
          >
            <Link href={popup.href} className="block w-60 text-ink">
              {popup.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={popup.image} alt="" className="h-32 w-full object-cover" />
              )}
              <div className="p-3">
                <p className="text-[13px] text-muted-ink">{popup.subtitle}</p>
                <p className="mt-0.5 font-semibold">{popup.title}</p>
                <p className="mt-1.5 font-bold">{popup.price}</p>
              </div>
            </Link>
          </Popup>
        )}
      </MapGL>

      {overlay && <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-end gap-2 [&>*]:pointer-events-auto">{overlay}</div>}

      {footer && <div className="absolute bottom-5 left-1/2 -translate-x-1/2">{footer}</div>}

      <div className="absolute right-3 bottom-8 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className="grid size-10 place-items-center text-ink-2 hover:bg-subtle"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        <span className="mx-2 h-px bg-line" />
        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className="grid size-10 place-items-center text-ink-2 hover:bg-subtle"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
      </div>
    </div>
  );
}
