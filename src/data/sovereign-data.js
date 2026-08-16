// Seed data pro Pipeline a Log (statické pohledy).
// Pulse/Paparazzi berou reálná data z API — viz server/index.cjs.

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

export { pipeline, log };
