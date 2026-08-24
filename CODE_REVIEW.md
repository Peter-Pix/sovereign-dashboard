# Sovereign Dashboard — Code Review & Fix Plan

> Audit proveden 24. 8. 2026. Celkem **14 bugů** v 7 souborech.

## 🟥 Kritické (5) — opravit ihned

### Bug 1: Path traversal v `/api/files`
**Soubor:** `server/routes/files.cjs`  
**Problém:** `path.relative()` kontrola je křehká. `path.relative('/root', '/root/../etc/passwd')` vrací `'../etc/passwd'` — ale kontrola `!rel.startsWith('..')` by měla fungovat. Problém je jinde — `path.resolve(p)` bez validace přijímá absolutní cesty. Útočník s auth může číst `/etc/passwd` přes `?p=/etc/passwd` (pokud `/etc` začíná na `..`).

**Fix:**
```js
const abs = path.resolve(p);
// Nejdříve ověř, že abs je string (jinak throw)
// Pak ověř, že NEZAČÍNÁ na disallowed prefix (case-insensitive)
```

### Bug 2: Activity z `mtime` adresáře, ne z gitu
**Soubor:** `server/lib/projects.cjs` → `getProjectInfo()`  
**Problém:** `mtime` adresáře se mění při každém přístupu (build, IDE sync, …). Všechny projekty vypadají „hot".

**Fix:** Použít `git log -1 --format=%ct` pro timestamp posledního commitu. Spočítat `age = (now - lastCommitTimestamp * 1000)`.

### Bug 3: Race condition v executor route
**Soubor:** `server/routes/executor.cjs`  
**Problém:** `let running = false` je sdílená proměnná, ale `executeOneTask` a `executeAllTasks` ji mohou nastavit současně.

**Fix:** Použít `Promise`-based mutex, ne boolean flag.

### Bug 4: Chybějící `isSafeName` v `bugs` a `agents` routes
**Soubor:** `server/routes/bugs.cjs`, `server/routes/agents.cjs`  
**Problém:** `project` a `name` parametry se používají v `path.join` bez validace. Path traversal!

**Fix:** Přidat `if (!isSafeName(project)) return 400;` na začátek každého handleru.

### Bug 5: Zombie openclaw procesy po timeout
**Soubor:** `server/routes/agents.cjs` (řádek 88)  
**Problém:** `execFile("openclaw", args, { timeout: ... })` — Node timeout neposílá SIGKILL, jen ukončí JS callback.

**Fix:** Přidat `killSignal: "SIGKILL"`.

## 🟧 Střední (5) — opravit v tomto kole

### Bug 6: Leads dedup kolize
**Fix:** Kombinovat `name + city` jako klíč.

### Bug 7: `/api/bugs` path traversal — viz Bug 4
### Bug 8: `/api/projects/:name/run-agent` path traversal — viz Bug 4

### Bug 9: Hardcoded `lastMsg`
**Fix:** Použít `git log -1 --format=%s` (subject).

### Bug 10: `/api/executor/run-all` drží HTTP spojení
**Fix:** Přesunout na background queue (už existuje `enqueueProjectTasks`!).

## 🟡 Drobné (4) — opravit když bude čas

- Bug 11: Inline `#` v env parseru
- Bug 12: M-series core detection
- Bug 13: `runningJobs` cleanup při crashi
- Bug 14: Per-project cache

## 📋 Order of execution
1. ✅ Path traversal (Bug 1, 4, 7, 8) — security kritické
2. ✅ Activity z gitu (Bug 2)
3. ✅ Race condition mutex (Bug 3)
4. ✅ Zombie kill (Bug 5)
5. ✅ Leads dedup (Bug 6)
6. ✅ Real commit msg (Bug 9)
7. ✅ Async run-all (Bug 10)
