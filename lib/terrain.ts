/**
 * Terrain-provider interface (optional, no fabricated values).
 *
 * Current state: only Open-Meteo point elevation is connected
 * (see fetchElevation in lib/providers.ts). DEM / slope / flow-accumulation /
 * drainage-network / river-proximity inputs are NOT connected — the risk
 * engine accepts elevationM: number | null and degrades transparently
 * (see terrainNote in EngineOutput.inundation).
 *
 * To connect a future free DEM source (e.g. AWS Terrain Tiles, Copernicus
 * GLO-30 sample, OSM waterways via Overpass), implement TerrainProvider and
 * pass its output into EngineInput without touching lib/engine.ts scoring.
 */
export interface TerrainSample {
  elevationM: number | null;
  slopeDeg: number | null;
  drainageDensityKmPerKm2: number | null;
  riverDistanceKm: number | null;
  source: string;
  sampledAt: string;
}

export interface TerrainProvider {
  id: string;
  sample(lat: number, lon: number): Promise<TerrainSample>;
}

export const TERRAIN_STATUS = "NOT CONNECTED — point elevation only (Open-Meteo); DEM/slope/drainage pending" as const;
