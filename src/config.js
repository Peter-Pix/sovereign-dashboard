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
