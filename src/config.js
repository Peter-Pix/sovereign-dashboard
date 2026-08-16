// Jediné místo pro API base URL.
// Override přes VITE_API_URL (např. .env.local), default je lokální dev server.
export const API = import.meta.env.VITE_API_URL ?? "http://localhost:8891";
