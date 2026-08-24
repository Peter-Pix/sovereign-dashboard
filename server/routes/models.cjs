// ===== Routes: Model přepínání =====
const { asyncHandler, HttpError } = require("../lib/logger.cjs");

module.exports = function registerModels(app, deps) {
  const { requireAuth, modelStore } = deps;

  // GET /api/config/model — aktuální modely
  app.get("/api/config/model", asyncHandler(async (req, res) => {
    res.json(modelStore.getModels());
  }));

  // PUT /api/config/model — přepnutí modelu (exec, ollama, nebo oba)
  app.put("/api/config/model", requireAuth, asyncHandler(async (req, res) => {
    const { execModel, ollamaModel } = req.body || {};

    // Musí být aspoň jeden
    if (execModel === undefined && ollamaModel === undefined) {
      throw new HttpError(400, "Zadej execModel, ollamaModel, nebo oba");
    }

    try {
      const result = modelStore.setModels({ execModel, ollamaModel });
      res.json({ success: true, ...result });
    } catch (e) {
      throw new HttpError(400, e.message);
    }
  }));

  // POST /api/config/model/reset — reset na výchozí
  app.post("/api/config/model/reset", requireAuth, asyncHandler(async (req, res) => {
    const result = modelStore.resetModels();
    res.json({ success: true, ...result });
  }));
};
