// server/lib/streamUtils.cjs — ANSI + chunk utility pro SSE streamy

/**
 * Strip ANSI escape codes z textu.
 * Ořízne taky progress indikátory openclaw (⠋⠙⠹⠸⠼⠴⠦⠧⸩✔⟳ atd.).
 */
function stripAnsi(raw) {
  if (!raw) return "";

  // Odstraň ANSI escape sekvence (barevné kódy, cursor movement, clear, atd.)
  // oxlint-disable-next-line no-control-regex -- ANSI ESC (U+001B) je záměrný
  let text = raw.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");

  // Odstraň progress indikátory openclaw (spinery a checkmarks)
  text = text.replace(/[⠋⠙⠹⠸⠼⠴⠦⠧⸩✔✓⟳↻⚡🌐📡💬📝🔍✅❌✗✘×+\-*/\\|‣▪▸▸►]/gu, "");

  // Odstraň progress řádky (prázdné nebo jen s indikátory)
  text = text.replace(/^[\s⠋⠙⠹⠸⠼⠴⠦⠧⸩✔✓⟳\->|\\/]+$/gmu, "");

  // Odstraň leading/trailing whitespace z každého řádku (pro čistý výstup)
  text = text.split("\n").map(l => l.trimEnd()).join("\n");

  // Odstraň prázdné řádky na začátku a konci
  text = text.trim();

  return text;
}

/**
 * Přiměřeně velký chunk pro SSE — oddělí na hranicích řádků pokud možno.
 * Snaží se dát alespoň 20 znaků nebo celý řádek.
 */
function makeChunk(raw) {
  const text = stripAnsi(raw);
  if (!text) return null;

  // Pokud je to více řádků, vrátíme vše
  if (text.includes("\n")) return text;

  // Krátký kousek — počkáme na víc
  if (text.length < 20) return null;

  return text;
}

module.exports = { stripAnsi, makeChunk };
