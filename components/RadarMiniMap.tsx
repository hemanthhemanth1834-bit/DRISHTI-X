"use client";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { tileXYZ } from "@/lib/imageSources";
import { RADAR_MAX_NATIVE_ZOOM } from "@/lib/radar";

/**
 * Live radar mini-map: geographic basemap + real RainViewer frame tiles +
 * location marker. Used when single-tile snapshots are empty (sparse
 * regional coverage) so the observation keeps geographic meaning.
 */
export default function RadarMiniMap({
  host,
  path,
  timeLabel,
  lat,
  lon,
  label,
  opacity,
  tall,
  zoom = 6,
  onCoverage,
}: {
  host: string;
  path: string;
  timeLabel: string;
  lat: number;
  lon: number;
  label: string;
  opacity?: number;
  tall?: boolean;
  zoom?: number;
  /** Real echo-presence probe: fraction of colored pixels in the center
   *  radar tile (same URL the map loads, browser-cached, CORS-open). */
  onCoverage?: (pct: number | null) => void;
}) {
  useEffect(() => {
    if (!onCoverage) return;
    let dead = false;
    const { x, y } = tileXYZ(lat, lon, 6);
    const url = `${host}${path}/256/6/${x}/${y}/2/1_1.png`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (dead) return;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d", { willReadFrequently: true });
        if (!g) {
          onCoverage(null);
          return;
        }
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let col = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 16) {
          n++;
          if (d[i + 3] > 16 && (Math.abs(d[i] - d[i + 1]) > 12 || Math.abs(d[i + 1] - d[i + 2]) > 12)) col++;
        }
        onCoverage(col / n);
      } catch {
        onCoverage(null);
      }
    };
    img.onerror = () => {
      if (!dead) onCoverage(null);
    };
    img.src = url;
    return () => {
      dead = true;
    };
  }, [host, path, lat, lon, onCoverage]);

  return (
    <div className={`radarMap${tall ? " radarTall" : ""}`}>
      <MapContainer
        key={`${lat.toFixed(2)},${lon.toFixed(2)}`}
        center={[lat, lon]}
        zoom={zoom}
        scrollWheelZoom={false}
        // Definite pixel height (NOT 100%): every ancestor above this map
        // has indefinite height, and percentage heights collapse to zero —
        // which rendered Leaflet at 0px and showed only the dark background.
        style={{ height: tall ? 420 : 340, width: "100%" }}
        attributionControl
        aria-label={`Precipitation radar map over ${label}`}
      >
        {/* OSM standard only: verified keyless (HTTP 200, no signup).
            A CARTO dark alternate was removed — same provider family as the
            placeholder-label endpoint, so it is no longer trusted here. */}
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <TileLayer
          url={`${host}${path}/512/{z}/{x}/{y}/2/1_1.png`}
          tileSize={512}
          zoomOffset={-1}
          // Verified ceiling: levels 8+ serve static error tiles; Leaflet
          // upscales level 7 instead. Basemap keeps full zoom range.
          maxNativeZoom={RADAR_MAX_NATIVE_ZOOM}
          opacity={opacity ?? 0.75}
          zIndex={10}
          attribution="Weather data by RainViewer"
        />
        <CircleMarker
          center={[lat, lon]}
          radius={7}
          pathOptions={{ color: "#ff6b86", fillColor: "#ff6b86", fillOpacity: 0.85 }}
        >
          <Popup>
            <b>{label}</b>
            <br />
            {lat.toFixed(2)}, {lon.toFixed(2)}
            <br />
            {timeLabel}
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
