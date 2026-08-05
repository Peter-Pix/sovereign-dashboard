# 📸 Paparazzi — Data Collector & Ekosystémový Přehled

> Paparazzi není jen foťák. Je to **sběrač dat o projektech** — fotí, čte git stav, měří aktivitu a health, a sumarizuje to do stručného přehledu, kde jsou zbytečnosti vyhozené.

## Co Paparazzi dělá

| Vrstva | Co sbírá | Jak |
|--------|----------|-----|
| 📷 **Captures** | Screenshoty z iCloudu (`Paparazzi/`) | Čte `.jpg`, parsuje `timestamp_tag_title` |
| 📊 **Data collection** | Reálná data o projektech | Git + filesystem scan v `~/projects` |
| 🧠 **Sumarizace** | Stručný přehled „co se děje" | `summarizeProjects()` — vyhodí zbytečnosti |

## Data collection — co se sbírá o každém projektu

Pro každý git projekt pod `~/projects/`:

- **Git stav** — poslední commit (relativní + iso), hash, message, branch
- **Dirty** — `git status --short` má obsah?
- **Aktivita** — počet commitů za 7 / 30 dní
- **Health skóre (0–100)** — kombinace:
  - aktivita (30 bodů)
  - čistý working tree (25)
  - má README ≥ 5 řádků (20 + 5)
  - konzistentní aktivita (10)
  - nízký počet TODO (10)
- **TODO/FIXME** — grep přes zdrojáky (bez `node_modules`, `.git`)
- **Dokumentace** — má README? kolik řádků?
- **Deps** — `package.json` dependencies / devDependencies
- **Autoři** — poslední committeři
- **Velikost** — `du -sk` zdrojáku

### Klasifikace aktivity

| Úroveň | Commitů / 30 dní | Význam |
|--------|------------------|--------|
| 🔥 `hot` | ≥ 10 | Aktivně se staví |
| ⚡ `active` | 3–9 | Zdravý rytmus |
| 🐢 `slow` | 1–2 | Téměř stojí |
| 💤 `idle` | 0 | Opuštěný |

## Sumarizace — vyhození zbytečností

`summarizeProjects(projects)` přečte všechny projekty a vyrobí **3–6 řádků**, které řeknou to podstatné:

```
Sleduji 12 projektů. 2 žhavých, 3 aktivních, 3 pomalejších, 4 idle.
🔥 Žhavé: petrpiskacek.cz, sovereign-dashboard.
⚠️ Dirty working tree: petrpiskacek.cloud, textbrain-v2.
📄 Bez README: 4rap.cz.
```

Zbytečnosti (každý commit, každý TODO, plné seznamy) se **nevyhazují do přehledu** — přehled ukazuje jen agregáty a výjimky, které stojí za pozornost.

## API

| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/paparazzi` | Seznam captures (screenshoty) |
| GET | `/api/paparazzi/data` | Data collection: `{ projects, summary }` |

## Jak to spustit

```bash
cd ~/projects/sovereign-dashboard
node server/index.cjs   # API na :8891
npm run dev             # UI na :8890
```

Paparazzi tab v UI → **Přehled** (data + sumarizace) a **Captures** (foto).
