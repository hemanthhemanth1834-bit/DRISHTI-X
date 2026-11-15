"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { LEVEL_COLOR, type WarningLevel } from "@/lib/engine";
import { pointerSmooth } from "@/lib/pointer";

/**
 * ROOT CAUSE OF THE PREVIOUS BREAKS (fixed here):
 * The day surface was a live NASA GIBS WMS GetMap requested with
 * VERSION=1.3.0 + BBOX=-90,-180,90,180. WMS 1.3.0 axis order for
 * EPSG:4326 is lat,lon while most examples/use assume lon,lat — a
 * server-dependent ambiguity. A wrong-extent (or partially blank)
 * image stretched over the full sphere is exactly what produces
 * black vertical strips / missing wedges / broken wrapping.
 * Fix: the globe now uses stable bundled equirectangular textures
 * (NASA Blue Marble-derived, MIT via the three.js repo, verified
 * 2:1 POT), validated before use. Live GIBS stays in the satellite
 * viewer + map overlays where equirect mapping is not required.
 */

export interface EarthProps {
  level: WarningLevel;
  rain: number;
  lat: number;
  lon: number;
  label: string;
  gibsDate: string;
  radarStatus: string;
  frameTime: string;
  /** When true the frame loop stops (canvas keeps its last frame). Used to
   *  park the globe offscreen without paying GPU cost or remounting. */
  paused?: boolean;
}

const TEX = {
  day: "/textures/earth_atmos_2048.jpg",
  clouds: "/textures/earth_clouds_1024.png",
  lights: "/textures/earth_lights_2048.png",
  normal: "/textures/earth_normal_2048.jpg",
};

/** India (78.9°E) faces the camera: texture u=0.25 (lon −90°) faces +Z by default. */
const INDIA_U = (78.9 + 180) / 360;
const BASE_ROT_Y = Math.PI / 2 - INDIA_U * Math.PI * 2;

/** Drag/inertia tuning (radians, frame-rate independent via dt). */
const DRAG_SENSITIVITY = 0.0045;
const VERTICAL_SENSITIVITY = 0.0028;
const ROTATION_DAMPING = 2.2; // exp decay rate ≈ 0.92 @60fps
const MAX_TILT = 0.5;
const IDLE_SPEED = 0.045; // rad/s ≈140s/rev — ~22% faster than before, still cinematic
const BOOST_MULT = 1.6;

/** Shared drag state — refs only, no per-pixel React state. */
export interface SpinRig {
  spinY: number;
  tiltX: number;
  velY: number;
  dragging: boolean;
  lastX: number;
  lastY: number;
  pointerId: number | null;
  autoBlend: number; // 0 during drag → 1 when idle (smooth auto return)
  boostUntil: number;
  dist: number; // camera distance (wheel zoom, damped)
  distTarget: number;
}

const MIN_DIST = 1.9;
const MAX_DIST = 5.5;

export function createSpinRig(): SpinRig {
  return { spinY: 0, tiltX: 0, velY: 0, dragging: false, lastX: 0, lastY: 0, pointerId: null, autoBlend: 1, boostUntil: 0, dist: 3.1, distTarget: 3.1 };
}

/** Wheel zoom with damping. Replaces the drei OrbitControls import so the
 *  client bundle stays on fiber + three only (rotation is custom drag). */
function ZoomRig({ rig }: { rig: React.RefObject<SpinRig | null> }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    const r = rig.current;
    if (!r) return;
    r.dist += (r.distTarget - r.dist) * 0.12;
    camera.position.z = r.dist;
  });
  return null;
}

function latLonToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const u = (lon + 180) / 360;
  const phi = u * Math.PI * 2;
  const theta = ((90 - lat) * Math.PI) / 180;
  return [-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r, Math.sin(phi) * Math.sin(theta) * r];
}

function loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
  return new Promise((res, rej) => {
    new THREE.TextureLoader().load(
      url,
      (t) => {
        // Explicit wrapping: seamless around the 0°/360° longitude join,
        // clamped at the poles. Mipmaps on (POT), linear filtering.
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        res(t);
      },
      undefined,
      rej
    );
  });
}

/** Last-resort schematic (bundled texture failing should be near-impossible). */
function fallbackSurface(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#0a1c3f");
  grad.addColorStop(0.5, "#0e2a5e");
  grad.addColorStop(1, "#0a1c3f");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ATMOS_VERT = `
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ATMOS_FRAG = `
uniform vec3 uColor;
varying vec3 vN;
void main() {
  float i = pow(clamp(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 3.5);
  gl_FragColor = vec4(uColor, 1.0) * i;
}`;

function Stars({ count = 400 }: { count?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    // Background depth layer: 0.1× pointer drift.
    if (!g.current) return;
    g.current.position.x += (pointerSmooth.x * 0.12 - g.current.position.x) * 0.06;
    g.current.position.y += (-pointerSmooth.y * 0.08 - g.current.position.y) * 0.06;
  });
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 9 + Math.random() * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph);
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    return arr;
  }, [count]);
  return (
    <group ref={g}>
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#8fb4ff" size={0.05} transparent opacity={0.55} sizeAttenuation />
    </points>
    </group>
  );
}

interface GlobeTex {
  day: THREE.Texture;
  clouds: THREE.Texture;
  lights: THREE.Texture | null;
  normal: THREE.Texture | null;
}

function Globe({ p, tex, rig, reduced }: { p: EarthProps; tex: GlobeTex; rig: React.RefObject<SpinRig | null>; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const drops = useMemo(() => {
    const n = Math.min(260, 60 + Math.round(p.rain * 4));
    return Array.from({ length: n }, (_, i) => ({
      a: (i / n) * Math.PI * 2,
      r: 1.3 + ((i * 37) % 40) / 100,
    }));
  }, [p.rain]);
  const pts = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(drops.length * 3);
    drops.forEach((d, i) => {
      arr[i * 3] = Math.cos(d.a) * d.r;
      arr[i * 3 + 1] = ((i * 53) % 200) / 100 - 1;
      arr[i * 3 + 2] = Math.sin(d.a) * d.r;
    });
    return arr;
  }, [drops]);
  const markerPos = useMemo(() => latLonToVec3(p.lat, p.lon, 1.02), [p.lat, p.lon]);

  useFrame((state, dt) => {
    const r = rig.current;
    const step = Math.min(dt, 0.05);
    // Idle cinematic spin + inertia + smooth auto-return blend.
    if (r && !reduced) {
      if (!r.dragging) {
        r.velY *= Math.exp(-ROTATION_DAMPING * step);
        r.autoBlend = Math.min(1, r.autoBlend + step / 1.5);
      }
      r.spinY += (r.autoBlend * IDLE_SPEED + r.velY) * step;
    } else if (r && reduced && !r.dragging) {
      r.velY = 0;
    }
    const spin = r?.spinY ?? 0;
    const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, r?.tiltX ?? 0));
    // Pointer parallax (lerped, clamped): ±0.12 rad horizontal, ±0.06 tilt.
    // Marker/particles/ring live inside this group, so overlays stay aligned.
    if (group.current) {
      const wantY = BASE_ROT_Y + Math.sin(state.clock.elapsedTime * 0.05) * 0.05 + pointerSmooth.x * 0.12 + spin;
      const wantX = 0.06 + pointerSmooth.y * 0.06 + tilt;
      group.current.rotation.y += (wantY - group.current.rotation.y) * 0.06;
      group.current.rotation.x += (wantX - group.current.rotation.x) * 0.06;
      group.current.position.x += (pointerSmooth.x * 0.05 - group.current.position.x) * 0.06;
    }
    // Clouds drift slightly differently (0.6× layer) for cinematic depth.
    if (cloudRef.current) {
      cloudRef.current.rotation.y += dt * 0.015;
      cloudRef.current.position.x += (pointerSmooth.x * 0.07 - cloudRef.current.position.x) * 0.06;
    }
    if (pts.current) pts.current.rotation.y += dt * 0.2;
    if (markerRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.25;
      markerRef.current.scale.setScalar(s);
    }
  });

  const atmos = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ATMOS_VERT,
        fragmentShader: ATMOS_FRAG,
        uniforms: { uColor: { value: new THREE.Color("#38c8ff") } },
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => atmos.dispose(), [atmos]);

  return (
    <group ref={group} rotation={[0.06, BASE_ROT_Y, 0.08]}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial
          map={tex.day}
          normalMap={tex.normal ?? undefined}
          emissiveMap={tex.lights ?? undefined}
          emissive={tex.lights ? "#ffffff" : "#000000"}
          emissiveIntensity={tex.lights ? 0.55 : 0}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
      <mesh ref={cloudRef} scale={1.012}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial map={tex.clouds} transparent opacity={0.6} depthWrite={false} roughness={1} />
      </mesh>
      <points ref={pts}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color={LEVEL_COLOR[p.level]} size={0.02} transparent opacity={0.85} />
      </points>
      {/* Selected-location marker at true lat/lon, colored by live risk level. */}
      <mesh ref={markerRef} position={markerPos}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={LEVEL_COLOR[p.level]} />
      </mesh>
      <mesh position={markerPos} scale={2.2}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={LEVEL_COLOR[p.level]} transparent opacity={0.25} />
      </mesh>
      {/* Single thin orbital ring: PROCEDURAL DECORATIVE ELEMENT. */}
      <mesh rotation={[Math.PI / 2.35, 0, 0.3]} scale={1.5}>
        <torusGeometry args={[1, 0.003, 8, 128]} />
        <meshBasicMaterial color="#4de3ff" transparent opacity={0.18} />
      </mesh>
      <mesh scale={1.06}>
        <sphereGeometry args={[1, 48, 48]} />
        <primitive object={atmos} attach="material" />
      </mesh>
    </group>
  );
}

export default function Earth3D(p: EarthProps) {
  const [tex, setTex] = useState<GlobeTex | null>(null);
  const [texState, setTexState] = useState<"loading" | "ok" | "fallback">("loading");
  const [manual, setManual] = useState(false); // HUD only: changes on down/up, never per-pixel
  const rig = useRef<SpinRig | null>(null);
  if (rig.current === null) rig.current = createSpinRig();
  const wrapRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(typeof window !== "undefined" && typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Wheel zoom (non-passive so globe zoom doesn't scroll the page).
  // Rotation stays custom pointer-drag; nothing else from drei is used.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rig.current;
      if (!r) return;
      r.distTarget = Math.min(MAX_DIST, Math.max(MIN_DIST, r.distTarget * (1 + e.deltaY * 0.001)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [day, clouds, lights, normal] = await Promise.all([
          loadTex(TEX.day, true),
          loadTex(TEX.clouds, true),
          loadTex(TEX.lights, true).catch(() => null),
          loadTex(TEX.normal, false).catch(() => null),
        ]);
        // Validate before applying: exact 2:1 equirectangular, non-empty.
        for (const [name, t] of [["day", day], ["clouds", clouds]] as const) {
          const img = t.image as HTMLImageElement;
          if (img.width !== img.height * 2 || img.width < 512) {
            throw new Error(`${name} texture has unexpected dimensions`);
          }
        }
        if (!live) {
          day.dispose();
          clouds.dispose();
          lights?.dispose();
          normal?.dispose();
          return;
        }
        setTex((prev) => {
          prev?.day.dispose();
          prev?.clouds.dispose();
          prev?.lights?.dispose();
          prev?.normal?.dispose();
          return { day, clouds, lights, normal };
        });
        setTexState("ok");
        if (process.env.NODE_ENV === "development") {
          const img = day.image as HTMLImageElement;
          console.info(
            `[DRISHTI-X] EARTH TEXTURE: OK (bundled ${img.width}x${img.height}) | ` +
              `CLOUD TEXTURE: OK | WEBGL: OK | GEOMETRY: OK (sphere 96x96)`
          );
        }
      } catch (e) {
        if (!live) return;
        if (typeof document !== "undefined") {
          const day = fallbackSurface();
          loadTex(TEX.clouds, true)
            .then((clouds) => live && setTex({ day, clouds, lights: null, normal: null }))
            .catch(() => live && setTex({ day, clouds: day, lights: null, normal: null }));
        }
        setTexState("fallback");
        console.error("[DRISHTI-X] earth texture failed, schematic fallback active:", e);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      setTex((prev) => {
        prev?.day.dispose();
        prev?.clouds.dispose();
        prev?.lights?.dispose();
        prev?.normal?.dispose();
        return null;
      });
    },
    []
  );

  return (
    <div
      ref={wrapRef}
      className={`orbit3d globeInteraction${manual ? " isDragging" : ""}`}
      role="img"
      aria-label={`Interactive 3D globe focused on India with live rainfall-driven particles over ${p.label}. Press and hold to revolve.`}
      onPointerDown={(e) => {
        // GLOBE DRAG / REVOLVE MODE — press and hold to take manual control.
        const r = rig.current;
        if (!r || (e.pointerType === "mouse" && e.button !== 0)) return;
        r.dragging = true;
        r.lastX = e.clientX;
        r.lastY = e.clientY;
        r.pointerId = e.pointerId;
        r.autoBlend = 0; // automatic rotation fades down, returns on release
        r.velY = 0;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture unsupported — move/up listeners below still apply */
        }
        setManual(true);
      }}
      onPointerMove={(e) => {
        const r = rig.current;
        if (!r?.dragging || (r.pointerId !== null && e.pointerId !== r.pointerId)) return;
        const boost = performance.now() < r.boostUntil ? BOOST_MULT : 1;
        const dx = e.clientX - r.lastX;
        const dy = e.clientY - r.lastY;
        r.lastX = e.clientX;
        r.lastY = e.clientY;
        const dt = 1 / 60;
        r.spinY += dx * DRAG_SENSITIVITY * boost;
        r.tiltX = Math.max(-MAX_TILT, Math.min(MAX_TILT, r.tiltX + dy * VERTICAL_SENSITIVITY * boost));
        if (!reduced.current) r.velY = 0.8 * r.velY + 0.2 * ((dx * DRAG_SENSITIVITY * boost) / dt);
      }}
      onPointerUp={(e) => {
        const r = rig.current;
        if (r && (r.pointerId === null || e.pointerId === r.pointerId)) {
          r.dragging = false;
          r.pointerId = null;
          // Inertia continues briefly, damps in useFrame, auto blends back.
        }
        setManual(false);
      }}
      onPointerCancel={() => {
        if (rig.current) {
          rig.current.dragging = false;
          rig.current.pointerId = null;
          rig.current.velY = 0;
        }
        setManual(false);
      }}
      onPointerLeave={() => {
        // Pointer capture keeps drag alive outside; only reset hover state.
        if (rig.current && !rig.current.dragging) setManual(false);
      }}
      onDoubleClick={(e) => {
        // Revolve boost: next drags feel more responsive + subtle feedback.
        // No page zoom, no navigation, globe-area only.
        e.preventDefault();
        if (rig.current) rig.current.boostUntil = performance.now() + 3000;
        setManual(true);
        setTimeout(() => {
          if (!rig.current?.dragging) setManual(false);
        }, 1200);
      }}
    >
      <Canvas
        camera={{ position: [0, 0.35, 3.1], fov: 45, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        frameloop={p.paused ? "never" : "always"}
      >
        <ambientLight intensity={0.3} />
        <directionalLight position={[4, 1.5, 3]} intensity={2.2} color="#fff4e0" />
        <directionalLight position={[-4, -0.5, -2]} intensity={0.4} color="#4d7cff" />
        <Stars />
        {tex && <Globe p={p} tex={tex} rig={rig} reduced={reduced.current} />}
        <ZoomRig rig={rig} />
      </Canvas>
      <span className="indiaTag indiaTagFloat" aria-hidden>GLOBE</span>
      {manual && (
        <span className="revolveBadge" aria-hidden>
          {rig.current?.dragging ? "REVOLVE — MANUAL CONTROL" : "REVOLVE READY"}
        </span>
      )}
      <div className="radarRing" />
      <div className="radarRing two" />
      <div className="radarRing three" />
      <p className="prov earthCaption">
        Surface: {texState === "ok" ? "NASA Blue Marble (bundled stable texture)" : texState === "fallback" ? "SURFACE OFFLINE — schematic fallback, no observation claimed" : "loading surface texture…"} ·
        live weather in map + panels · {p.radarStatus === "LIVE" ? `RADAR — RAINVIEWER · frame ${p.frameTime}` : "RADAR DATA UNAVAILABLE"} ·
        ● {p.label} {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
      </p>
    </div>
  );
}
