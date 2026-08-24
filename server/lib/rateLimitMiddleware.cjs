// ===== Express middlewares pro rate limiting =====
const rateLimiter = require("./rateLimiter.cjs");

/**
 * Získá klient klíč pro rate limit.
 * Preferuje autentizovaný token, fallback na IP.
 */
function getClientKey(req) {
  return req.headers["x-auth-token"] || req.query?.token || req.ip || req.socket?.remoteAddress || "anonymous";
}

/**
 * Middleware pro request rate limiting na konkrétní route.
 * Použití: app.post("/api/agents/:name/run", rateLimitByRoute("/api/agents/:name/run"), handler)
 */
function rateLimitByRoute(routeKey) {
  return (req, res, next) => {
    const key = getClientKey(req);
    const result = rateLimiter.checkRouteRate(routeKey, key, 1);

    // Vždy přidej rate limit headers
    res.setHeader("X-RateLimit-Limit", result.limit);
    res.setHeader("X-RateLimit-Remaining", result.remaining);
    res.setHeader("X-RateLimit-Reset", result.resetAt);

    if (!result.allowed) {
      res.setHeader("Retry-After", Math.ceil((result.resetAt - Date.now()) / 1000));
      return res.status(429).json({
        error: "Too Many Requests",
        category: "rate_limit",
        retryable: true,
        message: `Limit pro tuto route překročen. Zkus to znovu po ${new Date(result.resetAt).toLocaleTimeString()}.`,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
      });
    }

    next();
  };
}

/**
 * Middleware pro globální IP rate limit (fallback).
 */
function rateLimitGlobal(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "anonymous";
  const result = rateLimiter.checkGlobalIp(ip, 1);

  res.setHeader("X-RateLimit-Global-Limit", result.limit);
  res.setHeader("X-RateLimit-Global-Remaining", result.remaining);

  if (!result.allowed) {
    res.setHeader("Retry-After", Math.ceil((result.resetAt - Date.now()) / 1000));
    return res.status(429).json({
      error: "Too Many Requests",
      category: "rate_limit",
      retryable: true,
      message: "Globální rate limit překročen. Chvíli počkej.",
    });
  }

  next();
}

/**
 * Zkontroluje token budget před spuštěním agenta.
 * Použití v route handleru (ne middleware) — potřebujeme znát agenta a odhad tokenů.
 */
function checkAgentBudgetMiddleware(agentName, estimatedTokens = 0) {
  const result = rateLimiter.checkAgentBudget(agentName, estimatedTokens);

  if (!result.allowed) {
    const err = new Error(`Agent budget vyčerpán: ${result.current}/${result.limit} tokenů`);
    err.status = 429;
    err.category = "rate_limit";
    err.retryable = true;
    err.rateLimitInfo = result;
    throw err;
  }

  return result;
}

module.exports = {
  rateLimitByRoute,
  rateLimitGlobal,
  checkAgentBudgetMiddleware,
  getClientKey,
};
