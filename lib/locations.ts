export interface DemoLocation {
  name: string;
  state: string;
  lat: number;
  lon: number;
}

export const DEMO_LOCATIONS: DemoLocation[] = [
  { name: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867 },
  { name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lon: 80.648 },
  { name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lon: 83.2185 },
  { name: "Rajahmundry", state: "Andhra Pradesh", lat: 17.0005, lon: 81.804 },
  { name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707 },
  { name: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946 },
  { name: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777 },
  { name: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639 },
  { name: "Delhi", state: "Delhi", lat: 28.6139, lon: 77.209 },
];

export const DEFAULT_LOCATION = DEMO_LOCATIONS[1];

export const INDIA_CENTER: [number, number] = [22.5, 79.5];

export type SourceStatus =
  | "LIVE"
  | "RECENT"
  | "DELAYED"
  | "DEGRADED"
  | "OFFLINE"
  | "DEMO"
  | "READY"
  | "AUTH";

export interface Provenance {
  source: string;
  fetchedAt: string;
  status: SourceStatus;
  detail?: string;
}
