// ===== Routes: Rate Limiter admin =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");
const rateLimiter = require("../lib/rateLimiter.cjs");

module.exports = function registerRateLimits(app, deps) {
  const { requireAuth } = deps;

  // GET /api/admin/rate-limits — aktuální limity + spotřeba
  app.get("/api/admin/rate-limits", requireAuth, asyncHandler(async (req, res) => {
    res.json(rateLimiter.getState());
  }));

  // PUT /api/admin/rate-limits — změnit limity
  app.put("/api/admin/rate-limits", requireAuth, asyncHandler(async (req, res) => {
    const { agentBudget, routeRate, globalIpRate } = req.body || {};

    // Validace
    if (agentBudget) {
      for (const [k, v] of Object.entries(agentBudget)) {
        if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number" || v[0] <= 0 || v[1] <= 0) {
          throw new HttpError(400, `Invalid agentBudget[${k}]: must be [limit, windowMs] positive numbers`);
        }
      }
    }

    if (routeRate) {
      for (const [k, v] of Object.entries(routeRate)) {
        if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== "number" || typeof v[1] !== "number" || v[0] <= 0 || v[1] <= 0) {
          throw new HttpError(400, `Invalid routeRate[${k}]: must be [limit, windowMs] positive numbers`);
        }
      }
    }

    if (globalIpRate !== undefined) {
      if (!Array.isArray(globalIpRate) || globalIpRate.length !== 2 || globalIpRate[0] <= 0 || globalIpRate[1] <= 0) {
        throw new HttpError(400, "Invalid globalIpRate: must be [limit, windowMs] positive numbers");
      }
    }

    const updated = rateLimiter.setLimits({ agentBudget, routeRate, globalIpRate });
    res.json({ success: true, ...updated });
  }));

  // POST /api/admin/rate-limits/reset-usage — vynulovat spotřebu
  app.post("/api/admin/rate-limits/reset-usage", requireAuth, asyncHandler(async (req, res) => {
    const updated = rateLimiter.resetUsage();
    res.json({ success: true, ...updated });
  }));
};
