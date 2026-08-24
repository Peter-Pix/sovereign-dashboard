# Error Handling — vylepšení

> Plán proveden 24. 8. 2026. 12 slabých míst rozdělených do 3 fází.

## Fáze 1: Kritické (security + crash protection)

### Bug 1: TOCTOU v loadEnv
**Fix:** try/catch kolem `readFileSync`. Pokud se file změní mezi existsSync a readFileSync, vrátí prázdný env (process stále běží s defaults).

### Bug 2: uncaughtException graceful shutdown
**Fix:**
- 5s grace period pro in-flight HTTP requests
- Zapsat shutdown reason do souboru (`logs/crash-{timestamp}.log`)
- Pak teprve `process.exit(1)`

### Bug 3: Async route handlers bez error handler
**Fix:** Express 5 `app.use((err, req, res, next) => {...})` — error middleware.
Musí být **POSLEDNÍ** v chainu (po routes).

### Bug 4: SSE endpoint error handling
**Fix:** Každý `await` v SSE handleru obalen v try/catch. Při chybě
pošle `data: { type: "error", content: msg }` a ukončí spojení.

## Fáze 2: Střední (UX + debugging)

### Bug 5: Executor errors nejsou strukturované
**Fix:** Queue log items mají `error.message` + `error.code` + `error.timestamp` + `retryable: boolean`.

### Bug 6: Silent failures v getGitMeta
**Fix:** Pokud `run()` vrátí prázdný string, vrátit `null` (ne crashnout).
Přidat fallback na `fs.statSync` mtime když git není dostupný.

### Bug 7: Nekonzistentní HTTP status kódy
**Fix:** Centrální error mapper:
- Validation (isSafeName fail) → 400
- Not found (resource missing) → 404
- Auth (no token) → 401, (bad token) → 403
- Rate limit (too many) → 429
- Upstream (Ollama fail) → 502
- Internal (bug) → 500

### Bug 8: unhandledRejection neukončuje process
**Fix:** V produkci exit(1), v dev mode (NODE_ENV !== production) jen warn.

### Bug 9: Chybí Express error middleware
**Fix:** Přidat `app.use((err, req, res, next) => {...})`.

## Fáze 3: Drobné

- **Bug 11**: Correlation ID pro každý request
- **Bug 12**: Graceful degradation v paparazzi

## Order of execution

1. ✅ Error middleware (Bug 9) — základ pro ostatní
2. ✅ Centralizovaný error logger (Bug 5)
3. ✅ Async route safety (Bug 3)
4. ✅ SSE error handler (Bug 4)
5. ✅ Graceful shutdown (Bug 2)
6. ✅ loadEnv TOCTOU (Bug 1)
7. ✅ Git silent fail (Bug 6)
8. ✅ HTTP status mapper (Bug 7)
9. ✅ unhandledRejection exit (Bug 8)
10. ✅ Correlation ID (Bug 11)
11. ✅ Paparazzi graceful degradation (Bug 12)
