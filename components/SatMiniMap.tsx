"use client";
import { useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Real GIBS tiled viewport: Leaflet requests the actual provider tiles for
 * the current view (correct projection, no custom tile math, no wedges).
 * Zoom/pan are genuine map operations; the marker stays geographic.
 */
export default function SatMiniMap({
  template,
  product,
  date,
  lat,
  lon,
  label,
  opacity,
  tall,
  showControls,
  onLoad,
  onTileError,
}: {
  template: string;
  product: string;
  date: string;
  lat: number;
  lon: number;
  label: string;
  opacity?: number;
  tall?: boolean;
  showControls?: boolean;
  onLoad?: () => void;
  onTileError?: () => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  // Temporary visual diagnostics (spec: dev debug mode): live GIBS tile
  // request/load/failure counts prove what the provider returned.
  const counts = useRef({ req: 0, ok: 0, err: 0 });
  const [tick, setTick] = useState(0);
  void tick;
  const bump = () => setTick((t) => t + 1);
  return (
    <div className={`satMap${tall ? " satTall" : ""}`}>
      <MapContainer
        key={`${lat.toFixed(2)},${lon.toFixed(2)}`}
        ref={mapRef}
        center={[lat, lon]}
        zoom={5}
        minZoom={2}
        // GIBS GoogleMapsCompatible_Level9 tops out at level 9: allowing
        // deeper zoom requests out-of-range tiles (HTTP 400) that render as
        // holes. Verified live against the endpoint.
        maxZoom={9}
        scrollWheelZoom={false}
        style={{ height: tall ? 440 : 340, width: "100%" }}
        attributionControl
        aria-label={`NASA GIBS satellite imagery over ${label}`}
      >
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <TileLayer
          url={template}
          opacity={opacity ?? 0.85}
          zIndex={10}
          attribution="NASA EOSDIS GIBS"
          eventHandlers={{
            load: () => {
              onLoad?.();
              // Escalate only when NOTHING rendered (all tiles failed) —
              // isolated tile hiccups must not nuke the whole viewport.
              if (counts.current.ok === 0 && counts.current.err > 0) onTileError?.();
            },
            tileloadstart: () => {
              counts.current.req += 1;
              bump();
            },
            tileload: () => {
              counts.current.ok += 1;
              bump();
            },
            tileerror: () => {
              counts.current.err += 1;
              bump();
            },
          }}
        />
        {/* NOTE: no third-party labels overlay. The CARTO labels endpoint
            was verified live to return byte-identical placeholder tiles for
            every coordinate/zoom (not real labels), so it is removed. The
            OSM standard basemap already carries geographic labels. */}
        <CircleMarker
          center={[lat, lon]}
          radius={7}
          pathOptions={{ color: "#ffd166", fillColor: "#ffd166", fillOpacity: 0.9 }}
        >
          <Popup>
            <b>{label}</b>
            <br />
            {lat.toFixed(2)}, {lon.toFixed(2)}
            <br />
            {product} · {date}
          </Popup>
        </CircleMarker>
      </MapContainer>
      {showControls && (
        <div className="satZoomBar" role="group" aria-label="Satellite map zoom">
          <button className="tab" onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom satellite in">+</button>
          <button className="tab" onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom satellite out">−</button>
          <button
            className="tab"
            onClick={() => mapRef.current?.setView([lat, lon], 5)}
            aria-label="Reset satellite view"
          >
            RESET
          </button>
          <span className="tileDbg" title="Live GIBS tile request outcome">
            TILES {counts.current.ok}/{counts.current.req} OK · {counts.current.err} FAILED
          </span>
        </div>
      )}
    </div>
  );
}
