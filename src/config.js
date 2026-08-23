// Jediné místo pro API base URL a auth token.
// Override přes VITE_API_URL / VITE_AUTH_TOKEN (např. .env.local), default je lokální dev server.
export const API = import.meta.env.VITE_API_URL ?? "http://localhost:8891";

// Auth token pro mutační endpointy (spouštění agentů, bug tickety).
// Musí odpovídat SOVEREIGN_AUTH_TOKEN v server/.env.
export const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN ?? "";

// Hlavičky pro mutační (POST/PATCH) requesty.
export function authHeaders(extra = {}) {
  const h = { ...extra };
  if (AUTH_TOKEN) h["x-auth-token"] = AUTH_TOKEN;
  return h;
}

// ===== Client-side cache (15 min cooldown) =====
// Komponenty se remountují při každém přepnutí tabu (App.jsx podmíněně renderuje).
// Bez cache by každý přepínač tabu znovu sbíral data. Tohle drží data 15 min.
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minut
const _cache = new Map();

// fetch s cache: vrátí cached data, pokud jsou mladší než TTL.
// force=true vynutí nový fetch (např. manuální refresh).
export async function cachedFetch(url, { force = false, ttl = CACHE_TTL_MS } = {}) {
  const now = Date.now();
  const hit = _cache.get(url);
  if (!force && hit && now - hit.at < ttl) {
    return hit.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _cache.set(url, { at: now, data });
  return data;
}

// Invalidate cache pro konkrétní URL (např. po mutaci).
export function invalidateCache(url) {
  _cache.delete(url);
}
