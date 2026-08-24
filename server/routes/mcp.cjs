// server/routes/mcp.cjs — REST API pro správu MCP serverů.
// Přemostění: dashboard spravuje OpenClaw-managed MCP registry.

const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function mcpRoutes(app, deps) {
  const { requireAuth, mcpManager } = deps;

  // GET /api/mcp — přehled serverů (list + status)
  app.get("/api/mcp", asyncHandler(async (req, res) => {
    const [servers, status] = await Promise.all([
      mcpManager.listServers(),
      mcpManager.statusServers(),
    ]);
    // merge: list (def) + status (ok/transport/enabled)
    const merged = servers.map((s) => {
      const st = status.find((x) => x.name === s.name) || {};
      return { ...s, ...st, name: s.name };
    });
    res.json({ servers: merged, total: merged.length });
  }));

  // GET /api/mcp/:name — detail jednoho serveru
  app.get("/api/mcp/:name", asyncHandler(async (req, res) => {
    const { name } = req.params;
    const server = await mcpManager.getServer(name);
    if (!server) throw new HttpError(404, `MCP server '${name}' nenalezen`);
    res.json(server);
  }));

  // POST /api/mcp — přidat/upravit server
  app.post("/api/mcp", requireAuth, asyncHandler(async (req, res) => {
    const { name, definition } = req.body;
    if (!name || !definition) {
      throw new HttpError(400, "Chybí 'name' nebo 'definition'");
    }
    const result = await mcpManager.upsertServer(name, definition);
    res.json(result);
  }));

  // PUT /api/mcp/:name — upravit existující server
  app.put("/api/mcp/:name", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    const { definition } = req.body;
    if (!definition) throw new HttpError(400, "Chybí 'definition'");
    const result = await mcpManager.upsertServer(name, definition);
    res.json(result);
  }));

  // DELETE /api/mcp/:name — smazat server
  app.delete("/api/mcp/:name", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    const result = await mcpManager.removeServer(name);
    res.json(result);
  }));

  // POST /api/mcp/:name/probe — live ověření připojení + tools
  app.post("/api/mcp/:name/probe", requireAuth, asyncHandler(async (req, res) => {
    const { name } = req.params;
    const result = await mcpManager.probeServer(name);
    res.json(result);
  }));

  // POST /api/mcp/probe-all — probe všech serverů
  app.post("/api/mcp/probe-all", requireAuth, asyncHandler(async (req, res) => {
    const result = await mcpManager.probeAll();
    res.json(result);
  }));

  // GET /api/mcp/:name/status — status bez připojení
  app.get("/api/mcp/:name/status", asyncHandler(async (req, res) => {
    const { name } = req.params;
    const status = await mcpManager.statusServers();
    res.json(status.find((x) => x.name === name) || { name, configured: false });
  }));
};
