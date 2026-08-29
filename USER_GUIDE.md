# 🎛️ Sovereign Command — Kompletní uživatelská příručka

> **Sovereign Command** — centrální nervový systém pro Sovereign OS.
> Dark, minimalistický operační dashboard, který nahrazuje roztroušené terminálové kontroly jediným command centerem.

Tato příručka tě provede vším — od prvního spuštění přes každou záložku až po pokročilé workflow a řešení problémů. Je psaná prakticky: co kliknout, co očekávat, a jak z každé funkce dostat maximum.

---

## 📖 Obsah

1. [Co je Sovereign Command](#-co-je-sovereign-command)
2. [Rychlý start](#-rychlý-start)
3. [Záložky UI — kompletní průvodce](#-záložky-ui--kompletní-průvodce)
4. [Autonomní exekuce tasků](#-autonomní-exekuce-tasků)
5. [Roadmapy — plánování a sledování](#-roadmapy--plánování-a-sledování)
6. [Agenti a SSE streamy](#-agenti-a-sse-streamy)
7. [Funkce Paparazzi (integrovány do záložky Projekty)](#-funkce-paparazzi-integrovány-do-záložky-projekty)
8. [Konfigurace a tuning výkonu](#-konfigurace-a-tuning-výkonu)
9. [REST API — integrace a automatizace](#-rest-api--integrace-a-automatizace)
10. [Užitečné workflow](#-užitečné-workflow)
11. [Tipy a triky](#-tipy-a-triky)
12. [Řešení problémů](#-řešení-problémů)
13. [Rozšiřitelnost](#-rozšiřitelnost)
14. [FAQ](#-faq)

---

## 🚀 Co je Sovereign Command

Sovereign Command je **real-time operační dashboard** pro správu lokálních Git projektů, agentní pipeline, logů, Paparazzi captures, roadmap a **autonomní exekuce tasků**. Uzavírá kruh autonomního systému:

```
ROADMAP.md (task [ ])  →  Executor vybere agenta  →  Agent dokončí task  →  [x] odškrtnuto
```

### Klíčové schopnosti

| Schopnost | Co dělá |
|-----------|---------|
| **Projekty** | Srdce dashboardu: grid projektů, captures, reporty a detailní pohled |
| **Roadmapy** | Plánování tasků + autonomní exekuce agentů (ExecutionPanel) |
| **Leady** | Leady sesbírané Scout agentem (sektorové statistiky) |
| **Agenti** | Manifesty a logy Sovereign agentů |
| **Autonomní exekuce** | Až 3 paralelní sloty agentů s paměťovým guardem |

### Stack

- **Frontend:** React 19 + Vite + Tailwind CSS 4 (SPA)
- **Backend:** Express 5 (Node.js, CommonJS `.cjs`)
- **LLM:** Ollama (cloud modely, default `minimax-m3:cloud`)
- **Testy:** Node built-in `node:test` (unit + integration) + Playwright (e2e)

---

## ⚡ Rychlý start

### 1. Instalace (jednou)

```bash
cd ~/projects/sovereign-dashboard
npm install
```

### 2. Konfigurace `.env`

```bash
cp .env.example .env
# vygeneruj auth token:
openssl rand -hex 32
```

Do `.env` doplň:
- `SOVEREIGN_AUTH_TOKEN` — auth token pro mutační endpointy (povinné)
- `VITE_AUTH_TOKEN` — stejný token pro frontend
- `OLLAMA_API_KEY` — Bearer token z ollama.com (pro cloud modely)
- `OLLAMA_MODEL` — LLM model pro reporty (default `minimax-m3:cloud`)

> ⚠️ **Nikdy necommitovat `.env`** — obsahuje tajemství.

### 3. Spuštění

```bash
npm run dev          # frontend (3205) + backend (8891) dohromady
```

- **UI:** http://localhost:3205
- **API:** http://localhost:8891

Samostatně:

```bash
npm run server       # jen backend (node server/index.cjs)
npm run dev:frontend # jen frontend (vite --port 3205)
```

### 4. Ověř, že běží

```bash
curl http://localhost:8891/health
# → { "status": "ok", "uptime": ..., "timestamp": ... }
```

---

## 🗂️ Záložky UI — kompletní průvodce

Dashboard má **4 základní záložky** v horní navigaci, které tvoří centrum řízení:

### 1. Projekty — centrum řízení a monitoring

**Co to je:** Kombinace přehledu projektů a sběru dat (Paparazzi). Tady vidíš, co se v tvém ekosystému děje.

**Co uvidíš:**
- **Grid projektů:** Všechny projekty pod `~/projects` s real-time stavem (commit, branch, dirty stav, health skóre).
- **Paparazzi Captures:** Screenshoty z iCloudu, které ti umožňují vidět vizuální stav projektů.
- **Manažer Report:** LLM generovaný report (SSE stream), který sumarizuje stav všech projektů a vyfiltruje zbytečnosti.
- **Detail projektu:** Kliknutím na projekt se otevře detail s bug tickety a aktivními exekucemi.

**Jak používat:**
- Sleduj health skóre — klesá = projekt stagnuje.
- Používej Manažer Report pro rychlou ranní kontrolu ("co se stalo přes noc").
- Dirty working tree = pozor, build cache může být nekonzistentní.

### 2. Roadmapy — plánování a exekuce

**Co to je:** Centrální místo pro plánování tasků (`ROADMAP.md`/`PLAN.md`) a jejich autonomní spouštění.

**Jak používat:**
- Vyber projekt $
ightarrow$ vidíš jeho roadmapu s fázemi a tasky.
- Tasky s `[ ]` jsou otevřené, `[x]` hotové.
- Spusť exekuci $
ightarrow$ agent vybere task, dokončí ho a odškrtne.
- **ExecutionPanel:** Sleduješ sloty (`used/total`), frontu a aktivní streamy agentů.

### 3. Leady — Scout agent

**Co to je:** Leady sesbírané Scout agentem, sektorové statistiky + filtrování.

**Jak používat:**
- Procházej leady podle sektoru.
- Filtruj podle relevance a exportuj pro další zpracování.

### 4. Agenti — manifesty a logy

**Co to je:** Seznam všech Sovereign agentů s jejich definicemi (manifesty) a logy.

**Jak používat:**
- Prohlížej definice agentů (role, prompt, model).
- Sleduj logy jednotlivých agentů pro ladění promptů.
- Spouštěj agenty (přes Action Center nebo stream).

Kromě hlavních záložek má dashboard několik **pokročilých komponent**, které rozšiřují možnosti ovládání:

#### 🧠 ModelSwitcher — přepínání LLM modelů
Dropdown pro výběr LLM modelu pro exekuci. Dostupné modely:
- **MiniMax M3** (`ollama/minimax-m3:cloud`) — komplexní úkoly, větší context
- **Kimi K2.7 Code** (`ollama/kimi-k2.7-code:cloud`) — code generation
- **DeepSeek V4 Flash** (`ollama/deepseek-v4-flash:cloud`) — rychlé úkoly, nízká cena
- **Gemma 4 31B** (`ollama/gemma4:31b-cloud`) — vyvážený výkon

**Tip:** Přepínej model podle typu tasku — rychlé úkoly na DeepSeek, komplexní na MiniMax/Kimi.

#### 🔔 AlertBell — notifikace o alertech
Ikona se zvukem pro nové alerty. Zobrazuje počet:
- **Critical** — kritické problémy (červená)
- **Warning** — varování (žlutá)
- **Info** — informace (modrá)

Kliknutím otevřeš **AlertFeed** — seznam posledních alertů. Alerty se generují automaticky (detekce chyb, diskuse, systémové problémy).

#### ⚙️ WebhookSettings — GitHub webhooky
UI pro konfiguraci GitHub webhooků. Zobrazuje webhook URL (`/api/webhooks/github`) a umožňuje ho zkopírovat jedním kliknutím. Webhooky umožňují dashboardu reagovat na GitHub události (push, PR, issues) automaticky.

#### 📡 AgentStream — zobrazení streamu agenta
Komponenta pro zobrazování SSE streamu agentova výstupu v reálném čase. Zobrazuje stdout/stderr, progress indikátory (filtrované) a done signal.

#### 🎛️ ExecutionPanel — stav exekuce
Panel zobrazující stav exekuce — aktivní a ukončené tasky, sloty, frontu. Sdílený mezi ProjectDetail a Roadmaps pro konzistentní pohled.

#### ⌨️ Command Palette (Cmd+K)
Vyhledávání a spouštění akcí přes `Cmd+K`. Rychlý přístup k projektům, agentům a akcím bez klikání po UI.

---

## 🤖 Autonomní exekuce tasků

Toto je **srdce Sovereign Commandu** — uzavírá kruh: roadmapa → agent → dokončení → odškrtnutí.

### Jak to funguje

```
ROADMAP.md (task [ ])  →  Executor vybere agenta  →  Agent dokončí task  →  [x] odškrtnuto
```

1. **Executor** čte otevřené tasky (`[ ]`) z roadmapy projektu
2. **Vybere agenta** podle obsahu tasku (routing přes klíčová slova)
3. **Spustí agenta** (přes `openclaw agent` CLI + cloud model)
4. **Agent dokončí task** (upraví soubory, spustí testy, zapíše shrnutí)
5. **Executor odškrtne task** v ROADMAP (`[x]`)

### Paralelní pool (3 sloty)

Executor má **paralelní pool s `MAX_CONCURRENT=3` sloty**:
- Až 3 agenty mohou běžet **současně**
- Tasky se berou z fronty FIFO, ale běží paralelně
- Stav: `active[]` (všichni běžící) místo jediného `current`
- `canRun` = `slots.used < slots.total` → když `used === total`, UI tlačítka jsou **disabled**

### Adaptivní řízení (ochrana před konflikty)

Aby se zabránilo paralelní práci na stejných souborech, dashboard má dva limity:

| Limit | Hodnota | Význam |
|-------|---------|--------|
| `MAX_PER_PROJECT` | 1 | Max 1 task z jednoho projektu běží současně |
| `MAX_PER_PHASE` | 1 | Max 1 task ze stejné fáze běží současně |

**Důsledek:** Tasky z jednoho projektu běží **sériově** (konkurují si na souborech). Tasky z **různých** projektů mohou běžet paralelně.

> ⚠️ **Důležité:** Exekuce více tasků z JEDNOHO projektu **NEJDĚ do 3/3 slotů** — tasky z jednoho projektu běží sériově (`MAX_PER_PROJECT=1`, konkurují si na souborech). Slots 2/3 max (1/projekt), nikdy 3 z jednoho projektu. To je **záměrné**, ne chyba.

### Paměťový guard (ochrana proti OOM)

I když máš 3 sloty, **reálně může běžet méně agentů** kvůli paměťovému guardu (aktivní defaultně přes `EXEC_MEMORY_GUARD=1`). Guard:
- Počítá dostupnou RAM z `vm_stat` (free + inactive + speculative — reclaimable paměť na macOS)
- Rezervuje `EXEC_MIN_FREE_MB` (default 1500MB) pro systém
- Vydělí zbytek od `EXEC_AGENT_MEM_MB` (default 250MB na agenta)
- Výsledek = maximální počet agentů, kteří skutečně běží

**Příklad:** Dostupná RAM 2100MB − rezerva 1500MB = 600MB na agenty. 600 / 250 = **2 agenti max**, i když je pool 3.

Guard je **soft limit** — neblokuje frontu, jen omezuje, kolik agentů se spustí. Tasky čekají ve frontě, dokud není dost paměti.

### Loop protection

Executor má 4 vrstvy ochrany proti zacyklení:

| Limit | Hodnota | Popis |
|-------|---------|-------|
| `MAX_TASKS_PER_RUN` | 5 | Max tasků v jedné dávkové exekuci projektu |
| `MAX_RETRIES_PER_TASK` | 1 | Max pokusů na jeden task |
| `MAX_TOTAL_EXECUTIONS` | 20 | Globální budget za session |
| `COOLDOWN_MS` | 2000 | Min interval mezi exekucemi |

Tasky, které se nepodaří odškrtnout, se označí jako **"stuck"** a přeskočí se (žádný nekonečný loop).

### Jak spustit exekuci

**Přes UI (Roadmapy záložka):**
1. Otevři projekt
2. Klikni na task nebo "Spustit exekuci"
3. Sleduj SSE stream v pravém panelu
4. Task se odškrtne, když agent dokončí práci

**Přes API:**
```bash
# Spustit jeden task
curl -X POST "http://localhost:8891/api/executor/run/:project" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN"

# Pozastavit frontu (pause/resume)
curl -X POST "http://localhost:8891/api/executor/queue/pause" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN"
curl -X POST "http://localhost:8891/api/executor/queue/resume" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN"

# Reset exekučního stavu (nová session)
curl -X POST "http://localhost:8891/api/executor/reset" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN"
```

---

## 🗺️ Roadmapy — plánování a sledování

### Struktura roadmapy

Roadmapa je `ROADMAP.md` (nebo `PLAN.md`) v kořenové složce projektu. Jednoduchá syntaxe:

```markdown
# Projekt: Název projektu

## Fáze A: Název fáze
- [ ] Název tasku 1
- [x] Název tasku 2 (hotovo)
- [ ] Název tasku 3

## Fáze B: Název fáze
- [ ] Název tasku 4
```

### Podporovaná syntaxe

- **Tasky:** `- [ ]` (otevřeno), `- [x]` (hotovo)
- **Fáze:** `## Název fáze`
- **Popis tasku:** Text za pomlčkou (emoji, odkazy, atd.)
- **Závislosti:** Implicitní — tasky v jedné fázi běží sériově kvůli `MAX_PER_PROJECT=1`

### Jak dashboard čte roadmapy

1. **Načítání:** Čte `ROADMAP.md`/`PLAN.md` při spuštění projektu
2. **Dedup:** Více `.md` souborů se sloučí (neplýtvá tokeny na duplicity)
3. **Fronta:** Otevřené tasky (`[ ]`) se přidají do fronty exekuce
4. **Odškrtávání:** Když agent task dokončí, automaticky se změní na `[x]`
5. **Blokování:** Tasky ve stejné fázi běží sériově (zabrání konfliktům)

### Tipy pro efektivní roadmapy

- **Malé, atomické tasky** — dokončitelné jedním agentem v jednom běhu (max 5 min)
- **Jasné instrukce** — piš tasky jako příkazy: „Opravit bug v X", „Přidat funkci Y"
- **Fáze podle logiky** — Analýza → Implementace → Testování → Dokumentace
- **Emoji pro přehled** — 🐛 bug, ✨ feature, 📝 dokumentace, ⚡ optimalizace, 🔧 refaktor, 🧪 testy

---

## 🤖 Agenti a SSE streamy

### Jak agenti fungují

Agenti jsou definovaní v **`server/lib/agents.cjs`** ve struktuře `AGENT_TASKS` (ne v `AGENTS.md` — ten je projektový soubor s pravidly, který agent čte jako kontext). Každý agent má:
- **Jméno** (např. `The Builder`, `The Strategist`, `The Scout`)
- **Workspace** (adresář pro jeho výstupy pod `sovereign-os/workspaces/`)
- **Prompt** (instrukce, co má dělat)

**Skuteční agenti v dashboardu:**

| Agent | Display name | Zaměření |
|-------|--------------|----------|
| `builder` | The Builder | Stavění aplikací task po tasku z `ROADMAP.md` |
| `archivist` | The Archivist | Dokumentace a audit projektů |
| `scout` | The Scout | Hledání leadů a příležitostí |
| `strategist` | The Strategist | Pitche, strategie, marketing |
| `spine` | The Spine | Kontrola stavu, status reporty, Merge Master |

**Routing tasků na agenty** probíhá přes klíčová slova (`AGENT_ROUTING` v `executor.cjs`). Např. task se slovy "schema", "api", "implementovat" → `builder`; "audit", "readme" → `archivist`; "pitch", "marketing" → `strategist`. Pokud nic nesedí, spadne na `archivist`.

### SSE streamy — reálný výstup

Když spustíš agenta, zobrazí se **SSE stream** v pravém panelu. Stream zobrazuje:
- **stdout/stderr** agenta v reálném čase
- **Progress indikátory** (spinnery, checkmarks) — automaticky odstraněny pro čistý výstup
- **Strukturovaná data** (pokud agent vrátí JSON)
- **Chyby** (pokud selže)
- **Done signal** (když task skončí)

**Jak číst stream:**
- Spinnery (`⠋⠙⠹⠸⠼⠴⠦⠧⸩`) a checkmarks (`✔✓⟳`) jsou automaticky filtrovány
- ANSI escape kódy (barvy) jsou odstraněny
- Výstup je rozdělen na logické bloky (stdout, stderr, done)
- Když task skončí, zobrazí se `Done` s agentem a délkou trvání

### Ruční spuštění agenta přes CLI

```bash
# Z adresáře projektu
openclaw agent --agent The Builder --json --model ollama/minimax-m3:cloud -m "ÚKOL: [text tasku]"
```

> **Poznámka:** V produkci používej vždy UI — zajistí správné kontextové načítání, roadmap integraci a odškrtávání tasků.

### Action Center

Z karty projektu můžeš:
- **Spustit agenta** na projekt (Action Center)
- **Otevřít VS Code** deep link přímo z karty

---

## 📸 Funkce Paparazzi (integrovány do záložky Projekty)

> Paparazzi není jen foťák. Je to **sběrač dat o projektech** — fotí, čte git stav, měří aktivitu a health, a sumarizuje to do stručného přehledu, kde jsou zbytečnosti vyhozené.

### Co Paparazzi dělá

| Vrstva | Co sbírá | Jak |
|--------|----------|-----|
| 📷 **Captures** | Screenshoty z iCloudu (`Paparazzi/`) | Čte `.jpg`, parsuje `timestamp_tag_title` |
| 📊 **Data collection** | Reálná data o projektech | Git + filesystem scan v `~/projects` |
| 🧠 **Sumarizace** | Stručný přehled „co se děje" | `summarizeProjects()` — vyhodí zbytečnosti |

### Data collection — co se sbírá o každém projektu

Pro každý git projekt pod `~/projects/`:
- **Git stav** — poslední commit, hash, message, branch
- **Dirty** — `git status --short` má obsah?
- **Aktivita** — počet commitů za 7 / 30 dní
- **Health skóre (0–100)** — aktivita (30), čistý tree (25), README (20+5), konzistence (10), TODO (10)
- **TODO/FIXME** — grep přes zdrojáky (bez `node_modules`, `.git`)
- **Dokumentace** — má README? kolik řádků?
- **Deps** — `package.json` dependencies
- **Autoři** — poslední committeři
- **Velikost** — `du -sk` zdrojáku

### Klasifikace aktivity

| Úroveň | Commitů / 30 dní | Význam |
|--------|------------------|--------|
| 🔥 `hot` | ≥ 10 | Aktivně se staví |
| ⚡ `active` | 3–9 | Zdravý rytmus |
| 🐢 `slow` | 1–2 | Téměř stojí |
| 💤 `idle` | 0 | Opuštěný |

### Sumarizace — vyhození zbytečností

`summarizeProjects(projects)` vyrobí **3–6 řádků**, které řeknou to podstatné:

```
Sleduji 12 projektů. 2 žhavých, 3 aktivních, 3 pomalejších, 4 idle.
🔥 Žhavé: petrpiskacek.cz, sovereign-dashboard.
⚠️ Dirty working tree: petrpiskacek.cloud, textbrain-v2.
📄 Bez README: 4rap.cz.
```

### Manažer Report (LLM)

Paparazzi má **Manažer Report** — LLM generovaný report, který se vypisuje **token po tokenu** přes SSE stream. Obsahuje:
- **Metadata** — summary + system info
- **Tokeny** — report se vypisuje postupně
- **Done** — konec reportu

### Jak používat Paparazzi

1. Otevři záložku **Projekty**
2. **Přehled** — data + sumarizace + systém (CPU/RAM/disk gauges)
3. **Captures** — foto view + filtr
4. **History** — historie reportů
5. **ProjectCard** — karta projektu + Action Center

**Tipy:**
- Kontroluj **denně ráno** — uvidíš, co se stalo přes noc
- Hledej **stagnaci** — stejné tasky 2+ reporty = zaseknutý projekt
- Využij pro **reporting** — exportuj JSON reporty pro týdenní shrnutí

---

## ⚙️ Konfigurace a tuning výkonu

### Klíčové proměnné `.env`

| Proměnná | Význam | Default |
|----------|--------|---------|
| `SOVEREIGN_AUTH_TOKEN` | Auth token pro mutační endpointy | — (povinné) |
| `VITE_AUTH_TOKEN` | Stejný token pro frontend | — |
| `OLLAMA_URL` | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | LLM model pro reporty | `minimax-m3:cloud` |
| `OLLAMA_API_KEY` | Bearer token z ollama.com (cloud) | — |
| `EXEC_CONCURRENCY` | Max slotů v poolu | `3` |
| `EXEC_MEMORY_GUARD` | Aktivovat paměťový guard | `1` |
| `EXEC_MIN_FREE_MB` | Rezervovaná volná RAM (MB) | `1500` |
| `EXEC_AGENT_MEM_MB` | Odhad paměti na 1 agenta (MB) | `250` |
| `SOVEREIGN_EXEC_MODEL` | Model pro exekuci | `ollama/deepseek-v4-flash:cloud` |
| `SOVEREIGN_SKIP_PROJECTS` | Projekty vyřazené z exekuce | — |

### Tuning pro 8GB mašinu

**Pro běžné použití s Chrome + IDE:**
```env
EXEC_CONCURRENCY=3
EXEC_MEMORY_GUARD=1
EXEC_MIN_FREE_MB=2000   # více rezervy pro systém
EXEC_AGENT_MEM_MB=250
```

**Pro maximální paralelismus (málo jiných aplikací):**
```env
EXEC_CONCURRENCY=3
EXEC_MEMORY_GUARD=1
EXEC_MIN_FREE_MB=1200   # méně rezervy, více pro agenty
EXEC_AGENT_MEM_MB=200
```

**Pro testování bez reálných agentů:**
```env
EXEC_CONCURRENCY=3
EXEC_MEMORY_GUARD=0     # guard vypnutý — risk OOM, ale užitečné pro testy
EXECUTOR_MOCK_AGENT=1   # mock agent místo reálného openclaw agenta
```

### Monitoring paměti

```bash
# Celkové využití paměti
top -l 1 -n 0 | grep PhysMem

# Konkrétní procesy
ps aux --sort=-%mem | grep -E "(node|openclaw|Google)" | head -10

# Detailní vm_stat pro výpočet dostupné RAM
vm_stat | awk '
/bytes/ { for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+$/) { psize=$i+0; break } }
/^Pages free:/ { gsub(/\./,"",$3); free=$3+0 }
/^Pages inactive:/ { gsub(/\./,"",$3); inactive=$3+0 }
/^Pages speculative:/ { gsub(/\./,"",$3); speculative=$3+0 }
END {
  avail = (free + inactive + speculative) * psize;
  printf "Available RAM: %.0f MB\n", avail/1024/1024;
}'
```

### Jak poznat, že guard je aktivní

Dashboard loguje aktivitu guardu do `server_debug.log`:
```
[Executor] Memory guard: available RAM 2100MB → spouštím max 2/3 agentů (minFree 1500MB, ~250MB/agent)
```

---

## 🔌 REST API — integrace a automatizace

Base URL: `http://localhost:8891`

### Autentizace

Mutační endpointy (`POST`, `PATCH`) vyžadují auth token v hlavičce:
```
x-auth-token: <SOVEREIGN_AUTH_TOKEN>
```
Bez tokenu vrací `401 Unauthorized`.

### Endpointy

#### Health
| Method | Path | Popis |
|--------|------|-------|
| GET | `/health` | Stav serveru (status, uptime, timestamp) |

#### Projekty
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/projects` | Seznam všech Git projektů (inkrementální cache) |
| GET | `/api/projects/:name` | Detail projektu + bug tickety |

#### Agenti
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/agents` | Seznam agentů s manifesty a logy |
| POST | `/api/agents/:name/run` 🔒 | Spustí agenta (rate limited, max 2 paralelní) |
| POST | `/api/projects/:name/run-agent` 🔒 | Spustí agenta na projektu (Action Center) |

#### Bugy
| Method | Path | Popis |
|--------|------|-------|
| POST | `/api/bugs` 🔒 | Vytvoří bug ticket |
| PATCH | `/api/bugs/:project/:id` 🔒 | Aktualizuje bug (status, resolved) |

#### Leady
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/leads` | Seznam leadů (deduplikovaných) |

#### Soubory
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/files?p=<path>` | Čtení souboru / výpis adresáře (omezeno na allowed roots) |

#### Paparazzi
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/paparazzi` | Seznam captures (screenshoty) |
| GET | `/api/paparazzi/data` | Data collection (cache 5 min, `?refresh=1` vynutí) |
| GET | `/api/paparazzi/report` | Manažer Report — **SSE stream** |
| GET | `/api/paparazzi/history` | Historie reportů |
| POST | `/api/paparazzi/capture` 🔒 | Trigger capture request |

#### Roadmapy
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/roadmaps` | Seznam všech roadmap napříč projekty |
| GET | `/api/roadmaps/:project` | Detail roadmapy projektu (raw + parsed) |
| GET | `/api/roadmaps/state` | Stav exekuce (sloty, aktivní tasky, fronta) |

#### Executor
| Method | Path | Popis |
|--------|------|-------|
| GET | `/api/executor/next/:project` | Další nehotový task v roadmapě |
| GET | `/api/executor/state` | Stav exekuce (monitoring) |
| GET | `/api/executor/queue` | Stav fronty (délka, aktivní tasky, log) |
| POST | `/api/executor/queue/:project` 🔒 | Zařadit tasky projektu do fronty |
| POST | `/api/executor/queue/pause` 🔒 | Pozastavit frontu exekuce |
| POST | `/api/executor/queue/resume` 🔒 | Obnovit frontu exekuce |
| POST | `/api/executor/process/pause` 🔒 | Pozastavit jeden task/agenta |
| POST | `/api/executor/process/resume` 🔒 | Obnovit pozastavený task |
| POST | `/api/executor/project/pause` 🔒 | Pozastavit tasky projektu |
| POST | `/api/executor/run/:project` 🔒 | Spustí dokončení jednoho tasku |
| POST | `/api/executor/reset` 🔒 | Resetuje exekuční stav |

### Chybové kódy

| Kód | Význam |
|-----|--------|
| `400` | Invalid input (name, path) |
| `401` | Chybí auth token |
| `403` | Path outside allowed roots |
| `404` | Not found (project, agent, roadmap) |
| `429` | Rate limit (paralelní exekuce) |
| `500` | Server error |
| `503` | Auth token není nakonfigurován |

---

## 💡 Užitečné workflow

### Workflow 1: Denní kontrola projektů přes Paparazzi

**Cíl:** Rychlá ranní kontrola, co se stalo přes noc a kde je potřeba akce.

1. Otevři `http://localhost:3205` → **Paparazzi** záložka
2. Seřaď reporty podle času (nejnovější nahoře)
3. Pro každý projekt zkontroluj:
   - **Změnily se tasky?** Co se přidalo/odstranilo/odškrtalo
   - **Je nějaký task zaseknutý?** (stejný otevřený task 2+ reporty)
   - **Jaký je git stav?** Necommitnuté změny?
4. Pro projekty s akcí:
   - Otevři detail projektu
   - Spusť nejvyšší prioritu tasku
   - Pozoruj SSE stream pro průběh
   - Pokud task skončí chybou — analyzuj, oprav, zkus znovu

### Workflow 2: Implementace nové feature

**Cíl:** Strukturovaně přidat novou funkci s minimálním rizikem regrese.

1. **Analýza:** `## Fáze: Analýza` → `- [ ] Pochopit požadavek a navrhnout řešení` → agent `archivist` (audit) nebo `strategist` (strategie)
2. **Implementace:** `## Fáze: Implementace` → `- [ ] Implementovat core funkci X` → agent `builder`
3. **Testování:** `## Fáze: Testování` → `- [ ] Napsat a spustit testy pro X` → agent `builder` (testy routují na buildera)
4. **Dokumentace:** `## Fáze: Dokumentace` → `- [ ] Aktualizovat README` → agent `archivist`
5. **Kontrola:** `## Fáze: Kontrola` → `- [ ] Spustit linting, build, integrační testy` → agent `builder`

### Workflow 3: Řešení technického dluhu

1. **Identifikace** (týdně): Hledej `TODO`/`FIXME`/`HACK` v kódu, vytvoř roadmapu s fází `Technický dluh`
2. **Sprinty** (2-4h): Vyber 1-2 tasky, spusť je postupně (kvůli `MAX_PER_PROJECT=1`)
3. **Kontrola:** Ověř, že se health skóre zlepšilo

### Workflow 4: Experimentování s novými technologiemi

1. **Prozkoumání:** `- [ ] Prozkoumat knihovnu X a vhodnost pro Y` → agent `archivist` (audit/rešerše)
2. **PoC:** `- [ ] Vytvořit minimalní PoC pro integraci X do Y` → agent `builder`
3. **Rozhodnutí:** Na základě PoC a analýzy rozhodni, zda pokračovat

### Workflow 5: Noční automatizace přes cron

```bash
# Cron job každou noc v 2:00 — spustí build a testy
0 2 * * * curl -X POST "http://localhost:8891/api/projects/nase-pokladna/run-agent" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent": "The Builder", "prompt": "Spusť všechny testy a vytvoř build"}'
```

---

## 💎 Tipy a triky

### Tip 1: Využij `MAX_PER_PROJECT=1` pro bezpečné experimentování
Když testuješ rizikovou změnu, rozděl do dvou fází (bezpečná + riziková). Díky `MAX_PER_PROJECT=1` vždy běží max 1 task z rizikové fáze — snadněji obnovitelný stav.

### Tip 2: Emoji pro rychlou orientaci v roadmapách
- 🐛 Oprava bugu · ✨ Nová feature · 📝 Dokumentace · ⚡ Optimalizace · 🔧 Refaktor · 🧪 Testování · 📦 Dependency update · 🚀 Release

### Tip 3: Monitoruj frontu exekuce
```bash
# Kolik tasků čeká
curl -s http://localhost:8891/api/roadmaps/state | jq '.queueLength'

# Čekej, až se fronta vyprázdní
while [ $(curl -s http://localhost:8891/api/roadmaps/state | jq '.queueLength') -gt 0 ]; do
  sleep 5
done
echo "Fronta je prázdná!"
```

### Tip 4: Model switching pro různé typy tasků
- **Rychlé úkoly** (analýza, dokumentace): `ollama/deepseek-v4-flash:cloud`
- **Komplexní úkoly** (refaktor, algoritmy): `ollama/minimax-m3:cloud`
- **Kreativní úkoly** (psaní, brainstorming): `ollama/kimi-k2.7-code:cloud`

### Tip 5: Command Palette (Cmd+K)
Dashboard má **Command Palette** — vyhledávání a spouštění akcí přes `Cmd+K`. Rychlý přístup k projektům, agentům a akcím.

### Tip 6: Optimistické UI pro bugy
Bug tickety se přidávají **instantně** (optimistické UI) — nemusíš čekat na server. Ukládají se jako JSON do `bugs/` adresáře projektu.

### Tip 7: Inkrementální cache
`/api/projects` je <1ms díky mtime-based cache. Nemusíš se bát častého volání.

### Tip 8: Využij `resetExecutionState` pro nouzové obnovení
Pokud se zasekne exekuční worker, resetuj stav:
```bash
curl -X POST "http://localhost:8891/api/executor/reset" \
  -H "x-auth-token: $SOVEREIGN_AUTH_TOKEN"
```

---

## 🔧 Řešení problémů

### Problém: Server se neustále restartuje (`Killed: 9` v `server_err.log`)
**Příčina:** OOM kill — nedostatek paměti.
**Řešení:**
1. Zkontroluj paměť: `top -l 1 -n 0 | grep PhysMem`
2. Zvyš `EXEC_MIN_FREE_MB` v `.env` (např. na 2000)
3. Zavři nepotřebné aplikace (Chrome karty, IDE)
4. Dočasně sniž `EXEC_CONCURRENCY` na 2 nebo 1

### Problém: Tasky visí ve frontě a nikdy neběží
**Příčiny a řešení:**
- **Agent nedostane odpověď od LLM** — zkontroluj Ollama API klíč a připojení
- **Task je blokován závislostmi** — zkontroluj `MAX_PER_PROJECT` a `MAX_PER_PHASE`
- **Worker je pozastavený** — zkontroluj `paused` flag v `/api/roadmaps/state`

### Problém: Selhávají exekuce agentů s timeouty
**Příčiny a řešení:**
- **Timeout 5 min** — task je příliš složitý → rozděl na menší části
- **Chyba v promptu** — agent nerozumí → přidej kontext, zjednoduš instrukce
- **Špatný model** — zkus jiný (deepseek místo minimax pro rychlejší odpověď)

### Problém: UI nereaguje nebo se načítá pomalu
**Řešení:**
- Restartuj frontend: `./scripts/dev.sh`
- Zavři nepotřebné SSE streamy v UI
- Rozděl velké roadmapy na menší části

### Problém: Paparazzi reporty se nevytvářejí
**Řešení:**
- Zkontroluj, že backend běží (port 8891)
- Ověř, že `~/projects/` existuje a je čitelný
- Zkontroluj, že `ROADMAP.md` soubory jsou validní markdown

### Problém: Nemohu se připojit (connection refused)
**Řešení:**
- Spusť backend: `./scripts/start.sh`
- Zkontroluj port: `lsof -i :8891`
- Používej `http://localhost:8891` (ne https)

---

## 🔩 Rozšiřitelnost

### Jak přidat vlastního agenta

> ⚠️ **Agenti se nedefinují v `AGENTS.md` projektu.** Jsou hardcoded v kódu dashboardu. Přidání nového agenta vyžaduje úpravu kódu + restart serveru.

**Přidání nového agenta do `AGENT_TASKS`** (v `server/lib/agents.cjs`):
1. Otevři `server/lib/agents.cjs` → struktura `AGENT_TASKS`
2. Přidej nový záznam, např.:
   ```js
   analyst: {
     name: "The Analyst",
     workspace: "analyst",
     prompt: `Jsi The Analyst — Sovereign OS. Tvoje role: analýza dat a trendů. ...`,
   },
   ```
3. Přidej routing do `AGENT_ROUTING` (v `server/lib/executor.cjs`), aby se tasky routovaly na nového agenta:
   ```js
   { agent: "analyst", keywords: ["analyz", "trend", "data", "pruzkum"] },
   ```
4. Restartuj server (`./scripts/stop.sh && ./scripts/start.sh`)
5. Nový agent je dostupný v exekuci a UI

**Projektové `AGENTS.md`** slouží k jinému účelu — je to soubor s pravidly a kontextem pro agenta (Builder ho čte: „Přečti ROADMAP.md a AGENTS.md — pochop stack, strukturu a pravidla"). Můžeš ho upravit, aby agent dodržoval tvé konvence, ale **nevytváří nové agenty**.

### Jak přidat vlastní tool pro agenty

**Jednoduchá alternativa:** Přidej nástroje do kontextu
- Přidej soubory jako `DATA_SOURCES.md`, `API_ENDPOINTS.md` do projektu
- Agent je uvidí v kontextu a může podle nich jednat

**Pokročilá varianta:** MCP server
- Dashboard má **MCP manager** (`/api/mcp`, UI v `McpManager.jsx`)
- Připoj externí databáze pro agenty přes MCP
- Spravuj připojení/odpojení přes UI

---

## ❓ FAQ

### Kolik stojí běh dashboardu?
Pouze za Ollama Cloud API volání. `deepseek-v4-flash:cloud` ~$0.07-0.15/1M tokenů, `minimax-m3:cloud` ~$0.15-0.30/1M. Průměrný task ~500-2000 tokenů → ~$0.000035-0.0006/task.

### Proč neběží lokální modely na 8GB mašině?
Lokální modely nad ~3GB vyžadují obrovskou RAM. Na 8GB mašině → okamžitý swap death. Používej výhradně **Ollama Cloud API**.

### Jak snížit náklady na LLM?
1. Zkrať prompty
2. Zvyš využití kontextu (jen relevantní soubory)
3. Omeň počty pokusů na 1 pro jednoduché tasky
4. Používej levnější modely (deepseek místo minimax)
5. Využij cache pro opakované tasky

### Proč tasky běží na `[1/3 slotů]` místo `[3/3]`?
To je **paměťový guard v akci**. Guard dynamicky počítá, kolik agentů se vejde do dostupné RAM. Pokud vidíš `[1/3]`, volná RAM je nízká. To je **správné chování** — chrání systém před OOM.

### Jak vidím, kolik reálně běží agentů?
`/api/roadmaps/state` → pole `slots`:
- `total` — nastavený pool (`EXEC_CONCURRENCY`)
- `used` — aktuálně využité sloty (počítá guard)
- `allFull` — `true` pokud `used == total`

### Mohu běžet více dashboardů na jednom stroji?
Technicky ano, ale **nedoporučuje se** (paměť, porty, konflikty ve stavu). Lepší: jeden dashboard na stroj, nebo izolované adresáře/kontejnery.

### Jak exportovat data pro vlastní analýzy?
Všechny endpointy jsou dostupné přes REST API. Příklad nočního exportu:
```bash
0 3 * * * curl -s "http://localhost:8891/api/projects" | jq '.[] | {name, path}' > ~/reports/projects-$(date +\%F).json
```

---

## 🎯 Závěrečné doporučení

Sovereign Command je výkonný nástroj, ale jeho síla je v **kombinaci automatizace a lidského úsudku**:

1. **Začni malým** — jeden projekt, jednoduché roadmapy
2. **Iteruj** — sleduj, co funguje, co ne, přizpůsobuj
3. **Automatizuj rutinu** — nech agenty dělat opakující se, dobře definované úkoly
4. **Nech si kreativní úkoly pro sebe** — strategie, design, rozhodování
5. **Kontroluj výsledek** — nikdy nevěř slepě výstupu LLM, vždy ověř
6. **Uč se z chyb** — když agent selže, analyzuj proč a zlepšuj task/kontext

Platforma je navržena tak, aby **zvýšila produktivitu**, ne aby tě nahradila. Nejlepší výsledky dosáhneš, když budeš agenty používat jako **chytré asistenty**, kteří dělají těžkou práci, zatímco ty se soustředíš na strategii a kvalitu.

Happy building! 🚀

---

*Příručka naposledy aktualizována: 29. srpna 2026*
*Verze dashboardu: založeno na commitu f1aec5a*
*Související dokumentace: [API.md](./API.md), [PAPARAZZI.md](./PAPARAZZI.md), [README.md](./README.md)*
