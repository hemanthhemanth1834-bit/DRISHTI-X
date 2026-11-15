/**
 * Free terrain context via AWS TerrainRGB/Terrarium tiles (no key, ODbL-ish
 * open use). Decodes elevation server-side with zero new dependencies
 * (pure-JS PNG inflate, same technique as the project's tile probes).
 * Best-effort: timeouts + graceful OFFLINE. Feeds labelled indicators only —
 * NOT a hydrological model, NOT flood depth.
 */
import { inflateSync } from "node:zlib";

export interface TerrainStats {
  status: "READY" | "OFFLINE";
  meanM: number | null;
  minM: number | null;
  maxM: number | null;
  reliefM: number | null;
  lowlandFrac: number | null;
  zoom: number;
  note: string;
}

function lonLatToTile(lat: number, lon: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const y = Math.min(n - 1, Math.max(0, Math.floor((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n))));
  return [x, y];
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodeElev(png: Buffer): number[] {
  if (!png.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) throw new Error("not PNG");
  const ctype = png[25];
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (ctype !== 2 && ctype !== 6) throw new Error("unexpected color type");
  const ch = ctype === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    if (png.toString("ascii", off + 4, off + 8) === "IDAT") idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  let prev = Buffer.alloc(stride);
  const out: number[] = [];
  for (let y = 0; y < h; y += 2) {
    const f = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      row[x] = (row[x] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? ((a + b) >> 1) : paeth(a, b, c))) & 255;
    }
    for (let x = 0; x < w; x += 2) {
      out.push(row[x * ch] * 256 + row[x * ch + 1] + row[x * ch + 2] / 256 - 32768);
    }
    prev = row;
  }
  return out;
}

export async function sampleTerrain(lat: number, lon: number): Promise<TerrainStats> {
  const z = 12;
  const [cx, cy] = lonLatToTile(lat, lon, z);
  const fail: TerrainStats = {
    status: "OFFLINE", meanM: null, minM: null, maxM: null, reliefM: null,
    lowlandFrac: null, zoom: z, note: "Terrain tiles unavailable — elevation inputs use point value only.",
  };
  try {
    const urls: string[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        urls.push(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${cx + dx}/${cy + dy}.png`);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12000);
    let bufs: Buffer[];
    try {
      bufs = await Promise.all(
        urls.map(async (u) => {
          const r = await fetch(u, { headers: { "User-Agent": "DRISHTI-X-PS26071 terrain" }, signal: ctl.signal, next: { revalidate: 604800 } });
          if (!r.ok) throw new Error(`terrain ${r.status}`);
          return Buffer.from(await r.arrayBuffer());
        })
      );
    } finally {
      clearTimeout(t);
    }
    const vals = bufs.flatMap((b) => {
      try {
        return decodeElev(b);
      } catch {
        return [];
      }
    });
    if (vals.length < 1000) return fail;
    let mean = 0;
    for (const v of vals) mean += v;
    mean /= vals.length;
    let sd = 0;
    let mn = Infinity;
    let mx = -Infinity;
    let low = 0;
    for (const v of vals) {
      sd += (v - mean) ** 2;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (v < 25) low++;
    }
    sd = Math.sqrt(sd / vals.length);
    low /= vals.length;
    const r = (v: number) => Math.round(v * 10) / 10;
    return {
      status: "READY",
      meanM: r(mean),
      minM: r(mn),
      maxM: r(mx),
      reliefM: r(sd),
      lowlandFrac: Math.round(low * 1000) / 1000,
      zoom: z,
      note: `Terrarium DEM z${z} 3×3 tiles around point: mean ${r(mean)} m, relief (std) ${r(sd)} m, lowland(<25m) ${Math.round(low * 100)}%. Screening indicators only.`,
    };
  } catch {
    return fail;
  }
}
