// ===== Routes: GitHub Webhooks =====
// Přijímá GitHub webhook events (push, ping, workflow_run, atd.)

const { asyncHandler, HttpError, logError } = require("../lib/logger.cjs");
const { verifySignature, getRepoName, getEventType, pingResponse } = require("../lib/githubWebhook.cjs");

module.exports = function registerGitHubWebhook(app, deps) {
  const { isSafeName, enqueueProjectTasks, startQueueWorker, alerts, summarizeProjects } = deps;

  // GitHub webhook endpoint — NENÍ chráněn requireAuth (GitHub neposílá náš token).
  // Místo toho ověřujeme X-Hub-Signature-256.
  app.post("/api/webhooks/github", asyncHandler(async (req, res) => {
    const signature = req.headers["x-hub-signature-256"];
    const eventType = getEventType(req.headers);
    const secret = process.env.GITHUB_WEBHOOK_SECRET || null;
    const payload = req.body ? JSON.stringify(req.body) : "";

    // Ověř podpis
    const verified = verifySignature(payload, signature, secret);
    if (!verified.valid) {
      logError({
        err: new Error(`GitHub webhook verification failed: ${verified.reason}`),
        req,
        status: 401,
        extra: { source: "github_webhook", eventType },
      });
      throw new HttpError(401, `Webhook verification failed: ${verified.reason}`);
    }

    // Ping event — GitHub test při vytváření webhooku
    if (eventType === "ping") {
      return res.status(200).json(pingResponse());
    }

    // Push event — zpracuj
    if (eventType === "push") {
      const repo = getRepoName(req.body);
      const ref = req.body?.ref;
      const branch = ref?.replace("refs/heads/", "");
      const commits = req.body?.commits || [];
      const pusher = req.body?.pusher?.name || "unknown";

      console.log(`[GitHub Webhook] Push do ${repo}/${branch} od ${pusher} (${commits.length} commits)`);

      // Spusť alert check
      alerts.runChecks();

      // Pokud repo odpovídá projektu v PROJECTS_DIR, zařaď do executor fronty
      if (repo && isSafeName(repo)) {
        // enqueueProjectTasks(repo) spustí pouze pokud existuje roadmap
        const added = enqueueProjectTasks(repo);
        if (added > 0) {
          startQueueWorker();
          console.log(`[GitHub Webhook] ${added} tasků zařazeno pro ${repo}`);
        }
      }

      // Vytvoř info alert
      alerts.addAlert({
        category: "github_push",
        severity: "info",
        title: `GitHub push: ${repo}`,
        message: `${pusher} pushnul ${commits.length} commitů do ${branch}`,
        source: repo || "github",
        metadata: { repo, branch, commits: commits.length, ref },
      });

      return res.status(200).json({
        ok: true,
        event: "push",
        repo,
        branch,
        commits: commits.length,
        queued: 0,
      });
    }

    // Workflow_run event (CI/CD)
    if (eventType === "workflow_run") {
      const run = req.body?.workflow_run || {};
      const conclusion = run.conclusion;
      const repo = getRepoName(req.body);

      if (conclusion === "failure") {
        alerts.addAlert({
          category: "github_workflow_failure",
          severity: "critical",
          title: `GitHub Actions selhal: ${repo}`,
          message: `Workflow "${run.name}" skončilo jako failure`,
          source: repo || "github",
          metadata: { repo, runId: run.id, workflow: run.name, url: run.html_url },
        });
      }

      return res.status(200).json({ ok: true, event: "workflow_run", repo, conclusion });
    }

    // Ostatní eventy — log, ale OK
    console.log(`[GitHub Webhook] Ignorovaný event: ${eventType}`);
    res.status(200).json({ ok: true, event: eventType, ignored: true });
  }));
};
