// ===== Route: Health check =====
module.exports = function registerHealth(app) {
  app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
  });
};
