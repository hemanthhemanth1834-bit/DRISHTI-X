"use client";
import { useEffect, useRef, useState } from "react";

export interface Place {
  name: string;
  admin1: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

interface Saved extends Place {
  savedAt: number;
}

const RECENT_KEY = "drishti-recent";
const FAV_KEY = "drishti-fav";

function readLS(key: string): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (x): x is Saved =>
          typeof x === "object" && x !== null &&
          typeof (x as Saved).name === "string" &&
          Number.isFinite((x as Saved).latitude) &&
          Number.isFinite((x as Saved).longitude)
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function placeLabel(p: Place): string {
  const area = [p.admin1, p.country].filter(Boolean).join(", ");
  return area ? `${p.name}, ${area}` : p.name;
}

/**
 * Global city search: debounced keyless geocoding with keyboard support,
 * recent searches + favorites (local only), device location, and full
 * a11y combobox semantics. Selecting a place calls onPick — the single
 * location update that drives map, weather, radar, satellite and models.
 */
export default function CitySearch({ onPick }: { onPick: (lat: number, lon: number, label: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [hi, setHi] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error" | "empty">("idle");
  const [recent, setRecent] = useState<Saved[]>([]);
  const [favs, setFavs] = useState<Saved[]>([]);
  const [geoState, setGeoState] = useState<"idle" | "busy" | "denied">("idle");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, Place[]>());

  useEffect(() => {
    setRecent(readLS(RECENT_KEY));
    setFavs(readLS(FAV_KEY));
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDoc = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDoc);
    };
  }, []);

  // Debounced (300ms) search with obsolete-request cancellation + tiny cache.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      ctl.current?.abort();
      setResults([]);
      setState("idle");
      return;
    }
    setState("loading");
    const hit = cache.current.get(query.toLowerCase());
    const id = setTimeout(() => {
      if (hit) {
        setResults(hit);
        setState(hit.length ? "idle" : "empty");
        return;
      }
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal: c.signal })
        .then((r) => r.json() as Promise<{ results?: Place[] }>)
        .then((j) => {
          const list = Array.isArray(j.results) ? j.results : [];
          if (cache.current.size > 20) cache.current.clear();
          cache.current.set(query.toLowerCase(), list);
          setResults(list);
          setHi(0);
          setState(list.length ? "idle" : "empty");
          setOpen(true);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setState("error");
          setOpen(true);
        });
    }, 300);
    return () => {
      clearTimeout(id);
      ctl.current?.abort();
    };
  }, [q]);

  const remember = (p: Place) => {
    const entry = { ...p, savedAt: Date.now() };
    setRecent((prev) => {
      const next = [entry, ...prev.filter((x) => x.name !== p.name || x.country !== p.country)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — session-only */
      }
      return next;
    });
  };

  const pick = (p: Place) => {
    remember(p);
    setOpen(false);
    setQ("");
    setResults([]);
    onPick(p.latitude, p.longitude, placeLabel(p));
  };

  const toggleFav = (p: Place) => {
    setFavs((prev) => {
      const has = prev.some((x) => x.name === p.name && x.country === p.country);
      const next = has ? prev.filter((x) => !(x.name === p.name && x.country === p.country)) : [{ ...p, savedAt: Date.now() }, ...prev].slice(0, 8);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const useDevice = () => {
    if (!navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoState("idle");
        const p: Place = {
          name: "Device location",
          admin1: "",
          country: "",
          latitude: Math.round(pos.coords.latitude * 10000) / 10000,
          longitude: Math.round(pos.coords.longitude * 10000) / 10000,
          timezone: "auto",
        };
        pick(p);
      },
      () => setGeoState("denied"),
      { timeout: 10000 }
    );
  };

  const showList = results.length > 0;
  const showRecent = q.trim().length < 2 && (recent.length > 0 || favs.length > 0);

  return (
    <div className="citySearch" ref={boxRef}>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls="city-results"
        aria-activedescendant={showList ? `city-opt-${hi}` : undefined}
        aria-label="Search any city worldwide"
        placeholder="🔎 Search any city…  (Ctrl K)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && showList) {
            e.preventDefault();
            setHi((h) => (h + 1) % results.length);
          } else if (e.key === "ArrowUp" && showList) {
            e.preventDefault();
            setHi((h) => (h - 1 + results.length) % results.length);
          } else if (e.key === "Enter" && showList && results[hi]) {
            e.preventDefault();
            pick(results[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="cityDrop" id="city-results" role="listbox" aria-label="City results">
          {state === "loading" && <p className="cityMsg">SEARCHING LOCATIONS…</p>}
          {state === "error" && <p className="cityMsg">LOCATION SEARCH UNAVAILABLE — dashboard keeps working.</p>}
          {state === "empty" && (
            <p className="cityMsg">
              NO CITY FOUND for “{q.trim()}” — try city + country, or city + state.
            </p>
          )}
          {showList &&
            results.map((r, i) => {
              const saved = favs.some((x) => x.name === r.name && x.country === r.country);
              return (
                <div
                  key={`${r.name}-${r.country}-${r.latitude}-${i}`}
                  id={`city-opt-${i}`}
                  role="option"
                  aria-selected={i === hi}
                  className={`cityOpt${i === hi ? " hi" : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(r)}
                >
                  <span>
                    <b>{r.name.toUpperCase()}</b>
                    <em>{[r.admin1, r.country].filter(Boolean).join(" · ") || "—"}</em>
                    <em className="cityCoords">LAT {r.latitude.toFixed(4)} · LON {r.longitude.toFixed(4)}</em>
                  </span>
                  <button
                    className="favBtn"
                    aria-label={saved ? "Remove favorite" : "Save favorite"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFav(r);
                    }}
                  >
                    {saved ? "★" : "☆"}
                  </button>
                </div>
              );
            })}
          {showRecent && (
            <>
              {favs.length > 0 && <p className="citySec">★ SAVED</p>}
              {favs.map((f) => (
                <button key={`f-${f.name}-${f.country}`} className="cityRow" onClick={() => pick(f)}>
                  ★ {placeLabel(f)}
                </button>
              ))}
              {recent.length > 0 && <p className="citySec">RECENT</p>}
              {recent.map((f) => (
                <button key={`r-${f.name}-${f.country}-${f.savedAt}`} className="cityRow" onClick={() => pick(f)}>
                  ◉ {placeLabel(f)}
                </button>
              ))}
              <button
                className="cityRow cityClear"
                onClick={() => {
                  setRecent([]);
                  try {
                    localStorage.removeItem(RECENT_KEY);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                CLEAR RECENT
              </button>
            </>
          )}
          <button className="cityRow" onClick={useDevice} disabled={geoState === "busy"}>
            {geoState === "busy" ? "LOCATING…" : geoState === "denied" ? "LOCATION BLOCKED — USE SEARCH" : "◉ USE MY LOCATION"}
          </button>
        </div>
      )}
    </div>
  );
}
