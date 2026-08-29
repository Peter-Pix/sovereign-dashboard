// server/lib/mcpContext.cjs — Přidává MCP datasource info do agent promptu.
//
// Agenti běží přes `openclaw agent` CLI, které má MCP tools dostupné
// (z OpenClaw-managed registru). Ale model musí vědět, že MCP nástroje
// existují. Tento modul sestaví krátkou sekci, která se vloží do promptu
// a řekne agentovi: "máš přístup k těmto MCP nástrojům, používej je".

const mcpManager = require("./mcpManager.cjs");

/**
 * Sestaví MCP sekci do promptu.
 * @returns {Promise<string>} — sekce nebo prázdný string, když žádné servery
 */
async function buildMcpContextSection({ maxServers = 10 } = {}) {
  try {
    const [servers, status] = await Promise.all([
      mcpManager.listServers(),
      mcpManager.statusServers(),
    ]);

    // Jen enabled servery
    const enabled = servers.filter((s) => s.enabled !== false).slice(0, maxServers);
    if (enabled.length === 0) return "";

    const statusMap = new Map(status.map((s) => [s.name, s]));
    const lines = enabled.map((s) => {
      const st = statusMap.get(s.name);
      const transport = s.transport || st?.transport || "stdio";
      return `- **${s.name}** (${transport})${st?.ok ? " ✓" : ""}`;
    });

    return `\n\n## Dostupný MCP nástroje (Model Context Protocol)\nMáš přístup k těmto MCP serverům. Pokud úkol vyžaduje práci s databází nebo externím nástrojem, použij odpovídající MCP tool:\n${lines.join("\n")}\nPoužívej MCP tools jen když to úkol vyžaduje — nevyužívej je zbytečně.`;
  } catch {
    return ""; // MCP není kritické — pokud selže, pokračuj bez něj
  }
}

module.exports = { buildMcpContextSection };
