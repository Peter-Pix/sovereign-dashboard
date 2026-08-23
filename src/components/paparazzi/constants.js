// Sdílené konstanty a helpery pro Paparazzi komponenty.

export const tagColors = {
  STRUGGLE: "#e85d5d",
  VICTORY: "#3ecf8e",
  PROGRESS: "#e5b34b",
  IDLE: "#5c5c5c",
};

export const activityMeta = {
  hot: { label: "Žhavý", color: "#3ecf8e", icon: "🔥" },
  active: { label: "Aktivní", color: "#e5b34b", icon: "⚡" },
  slow: { label: "Pomalý", color: "#5c5c5c", icon: "🐢" },
  idle: { label: "Idle", color: "#3a3a3a", icon: "💤" },
};

export const healthColor = (h) => (h >= 70 ? "#3ecf8e" : h >= 40 ? "#e5b34b" : "#e85d5d");

export function fmtBytes(bytes) {
  if (!bytes) return "?";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + " GB";
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + " MB";
}
