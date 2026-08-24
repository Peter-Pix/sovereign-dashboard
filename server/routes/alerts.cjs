// ===== Routes: Alerts =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerAlerts(app, deps) {
  const { requireAuth, alerts } = deps;

  // GET /api/alerts — active + history + summary
  app.get("/api/alerts", asyncHandler(async (req, res) => {
    res.json(alerts.getAlerts());
  }));

  // POST /api/alerts/:id/ack — acknowledge (přesun do historie)
  app.post("/api/alerts/:id/ack", requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = alerts.acknowledgeAlert(id);
    if (!result) throw new HttpError(404, "Alert not found");
    res.json({ success: true, alert: result });
  }));

  // POST /api/alerts/:id/dismiss — smazat bez historie
  app.post("/api/alerts/:id/dismiss", requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const ok = alerts.dismissAlert(id);
    if (!ok) throw new HttpError(404, "Alert not found");
    res.json({ success: true });
  }));

  // POST /api/alerts/run-check — manuální spuštění checku
  app.post("/api/alerts/run-check", requireAuth, asyncHandler(async (req, res) => {
    await alerts.runChecks();
    res.json(alerts.getAlerts());
  }));
};
