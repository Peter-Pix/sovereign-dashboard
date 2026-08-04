// Reálná data z git logů a filesystému
// Tohle se později nahradí API/backendem, ale pro teď je to živější než fake čísla

const projects = [
  { name: "petrpiskacek.cz", status: "ok", meta: "Portfolio", lastCommit: "před 19 min", dirty: false },
  { name: "petrpiskacek.cloud", status: "warn", meta: "AI Hřiště", lastCommit: "před 18 hod", dirty: true },
  { name: "petrpiskacek.online", status: "warn", meta: "Příběh", lastCommit: "před 2 dny", dirty: true },
  { name: "Karel Robot", status: "ok", meta: "E-mailový admin", lastCommit: "před 2 týdny", dirty: false },
  { name: "4rap.cz", status: "idle", meta: "Rapová databáze", lastCommit: "před 13 dny", dirty: false },
  { name: "TextBrain v2", status: "warn", meta: "Cognitive Augmentation", lastCommit: "před 32 hod", dirty: true },
  { name: "Robíci", status: "ok", meta: "AI Rodina", lastCommit: "před 2 dny", dirty: false },
  { name: "Crisis Management", status: "ok", meta: "Audit Agency", lastCommit: "před 3 dny", dirty: false },
  { name: "Housekeeper", status: "ok", meta: "System Maintenance", lastCommit: "před 3 dny", dirty: false },
  { name: "Projects Management", status: "warn", meta: "AI PM", lastCommit: "před 3 dny", dirty: true },
  { name: "Paparazzi", status: "ok", meta: "Screen Capture", lastCommit: "Běží", dirty: false },
  { name: "Sovereign OS", status: "ok", meta: "Infrastructure", lastCommit: "Teď", dirty: false },
];

const pipeline = [
  { id: "archivist", task: "Aktivovat Archivistu", desc: "Spustit audit projektů — dokumentace, pros/cons, technical debt", priority: "high" },
  { id: "scout", task: "Aktivovat Scouta", desc: "Hledat firmy s neefektivitou vhodnou pro AI automatizaci", priority: "high" },
  { id: "strategist", task: "Aktivovat Strategistu", desc: "Připravit pitch na základě Scoutových leadů", priority: "medium" },
  { id: "event", task: "První Sovereign Event", desc: "Zpracovat Paparazzi captures do prvního postu", priority: "medium" },
  { id: "cleanup", task: "Vyčistit dirty working trees", desc: ".cloud, .online, TextBrain, Projects Management", priority: "low" },
];

const log = [
  { time: "02:41", tag: "progress", text: "Paparazzi spuštěn — 5 captures v iCloudu" },
  { time: "02:32", tag: "milestone", text: "Sovereign Dashboard v1 — command center" },
  { time: "02:26", tag: "milestone", text: "Sovereign OS struktura — central-brain + 5 workspace" },
  { time: "02:22", tag: "victory", text: "petrpiskacek.cz push — Sovereign Cut messaging live" },
  { time: "01:18", tag: "milestone", text: "Sovereign Law — Write-Isolation + Voice Engine" },
  { time: "01:07", tag: "milestone", text: "Voice recalibration — la lidi rozumí framework" },
  { time: "00:57", tag: "struggle", text: "Sovereign Efficiency text — první verze moc uhlazená" },
];

export { projects, pipeline, log };
