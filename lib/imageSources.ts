/**
 * Central image-source registry (PS 26071 visual relevance only).
 * Every visual in the app must resolve to one of these providers —
 * no stock photos, no AI-generated imagery, no random hotlinks.
 *
 * NOTE (2026): RainViewer's free API retains past radar maps; its
 * satellite-IR service was discontinued, so no IR layer is offered.
 */

export type ImageKind = "radar" | "satellite" | "nwp" | "basemap";

export interface ImageSource {
  id: string;
  name: string;
  provider: string;
  kind: ImageKind;
  attribution: string;
  description: string;
  resolution: string;
  refreshMin: number;
}

export const IMAGE_SOURCES: ImageSource[] = [
  {
    id: "rainviewer-radar",
    name: "Radar Reflectivity",
    provider: "RainViewer",
    kind: "radar",
    attribution: "Weather data by RainViewer",
    description: "Composite radar reflectivity, 10-minute past frames",
    resolution: "512px tiles",
    refreshMin: 5,
  },
  {
    id: "gibs-truecolor",
    name: "True Color (Terra MODIS)",
    provider: "NASA GIBS",
    kind: "satellite",
    attribution: "NASA EOSDIS GIBS",
    description: "Daily corrected reflectance, cloud/atmosphere context for rainfall analysis",
    resolution: "250 m",
    refreshMin: 1440,
  },
  {
    id: "gibs-viirs",
    name: "True Color (Suomi NPP VIIRS)",
    provider: "NASA GIBS",
    kind: "satellite",
    attribution: "NASA EOSDIS GIBS",
    description: "Daily corrected reflectance, sharper daytime cloud field",
    resolution: "375 m",
    refreshMin: 1440,
  },
  {
    id: "gibs-721",
    name: "Bands 7-2-1 false color (Terra MODIS)",
    provider: "NASA GIBS",
    kind: "satellite",
    attribution: "NASA EOSDIS GIBS",
    description: "Shortwave-IR false color: flood/wet-land and vegetation contrast for inundation context",
    resolution: "500 m",
    refreshMin: 1440,
  },
  {
    id: "osm",
    name: "OpenStreetMap basemap",
    provider: "OpenStreetMap",
    kind: "basemap",
    attribution: "© OpenStreetMap contributors",
    description: "Reference geography under data layers (tile policy respected: cached, standard zoom)",
    resolution: "256px tiles",
    refreshMin: 0,
  },
];

export interface GibsLayer {
  id: string;
  gibsLayer: string;
  satellite: string;
  product: string;
  resolution: string;
  format: "jpg" | "png";
}

export const GIBS_LAYERS: GibsLayer[] = [
  {
    id: "terra-truecolor",
    gibsLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    satellite: "Terra MODIS",
    product: "Corrected Reflectance (True Color)",
    resolution: "250 m",
    format: "jpg",
  },
  {
    id: "viirs-truecolor",
    gibsLayer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    satellite: "Suomi NPP VIIRS",
    product: "Corrected Reflectance (True Color)",
    resolution: "375 m",
    format: "jpg",
  },
  {
    id: "modis-721",
    gibsLayer: "MODIS_Terra_CorrectedReflectance_Bands721",
    satellite: "Terra MODIS",
    product: "Bands 7-2-1 false color (flood/vegetation contrast)",
    resolution: "500 m",
    format: "jpg",
  },
];

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

/** WMTS template with Leaflet-style tokens (GIBS order is z/y/x). */
export function gibsTemplate(layer: string, date: string, format: "jpg" | "png"): string {
  return `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${format}`;
}

/** Slippy-map tile indices for a lat/lon at zoom z. */
export function tileXYZ(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const latR = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const y = Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)));
  return { x, y };
}

/** Fill a {z}/{y}/{x} GIBS template with concrete indices. */
export function fillGibs(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x));
}

const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

/**
 * Single equirectangular image for spherical texture mapping
 * (BBOX covers the whole globe; time = daily product date).
 */
export function gibsWMS(layer: string, date: string, w = 2048, h = 1024, format = "image/jpeg"): string {
  const p = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.3.0",
    LAYERS: layer,
    CRS: "EPSG:4326",
    BBOX: "-90,-180,90,180",
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: format,
    TIME: date,
  });
  return `${GIBS_WMS}?${p.toString()}`;
}

export const GIBS_DAY_LAYER = "MODIS_Terra_CorrectedReflectance_TrueColor";
export const GIBS_NIGHT_LAYER = "VIIRS_SNPP_DayNightBand_ENCC";
