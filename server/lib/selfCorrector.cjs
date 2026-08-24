// ===== Self-Correction Loop =====
// Po změně agenta spustí testy; pokud failují, agent dostane další pokus s chybovým výstupem.

const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");
const config = require("../config.cjs");

const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 120_000;

/**
 * Najde testovací příkaz pro projekt.
 */
function detectTestCommand(projectPath) {
  if (fs.existsSync(path.join(projectPath, "package.json"))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
      if (pkg.scripts?.test) return "npm test";
    } catch {}
  }
  if (fs.existsSync(path.join(projectPath, "vite.config.js")) ||
      fs.existsSync(path.join(projectPath, "vite.config.ts"))) {
    return "npx vitest run";
  }
  if (fs.existsSync(path.join(projectPath, "jest.config.js")) ||
      fs.existsSync(path.join(projectPath, "jest.config.ts"))) {
    return "npx jest";
  }
  // Node built-in test runner
  if (fs.existsSync(path.join(projectPath, "tests")) ||
      fs.existsSync(path.join(projectPath, "test"))) {
    return "node --test";
  }
  return null;
}

/**
 * Spustí testy v projektu.
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, command: string }>}
 */
function runTests(projectPath) {
  return new Promise((resolve) => {
    const command = detectTestCommand(projectPath);
    if (!command) {
      return resolve({ ok: true, stdout: "", stderr: "", command: "none", skipped: true });
    }

    const [cmd, ...args] = command.split(" ");
    execFile(cmd, args, {
      cwd: projectPath,
      timeout: DEFAULT_TIMEOUT,
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
      killSignal: "SIGKILL",
    }, (err, stdout, stderr) => {
      const ok = !err || (err.code === 0);
      resolve({ ok, stdout, stderr, command });
    });
  });
}

/**
 * Zjednodušený heuristic: jsou testy failing?
 */
function hasFailures(stdout, stderr) {
  const text = (stdout || "") + "\n" + (stderr || "");
  const failPatterns = [
    /failing tests:/i,
    /✖ failing tests/i,
    /tests? failed/i,
    /error:/i,
    /fail \d+/i,
    /assertionerror/i,
  ];
  return failPatterns.some((p) => p.test(text));
}

/**
 * Vytvoří correction prompt.
 */
function buildCorrectionPrompt(originalPrompt, attempt, testResult, maxOutputLength = 3000) {
  const output = ((testResult.stdout || "") + "\n" + (testResult.stderr || "")).trim();
  const truncated = output.length > maxOutputLength ? output.slice(0, maxOutputLength) + "\n\n[... truncated]" : output;

  return `${originalPrompt}

---

## Self-Correction: pokus ${attempt}/${MAX_RETRIES}

Testy dopadly NEGATIVNĚ. Oprav změny tak, aby testy prošly.

Příkaz: \`${testResult.command}\`

Výstup testů:
\`\`\`
${truncated}
\`\`\`

PRAVIDLA:
- Analyzuj chybu ve výstupu.
- Oprav POUZE to, co je potřeba pro průchod testů.
- Neztrať předchozí funkcionalitu.
- Po opravě znovu spusť stejný test příkaz a ověř, že prochází.`;
}

/**
 * Self-correction wrapper pro agentní exekuci.
 * @param {Function} runAgentFn — (prompt, callback) => void
 * @param {string} projectPath
 * @param {string} originalPrompt
 * @returns {Promise<{ success: boolean, attempts: number, finalResult: object, testResult: object }>}
 */
async function selfCorrect(runAgentFn, projectPath, originalPrompt) {
  let attempt = 1;
  let currentPrompt = originalPrompt;
  let lastAgentResult = null;
  let lastTestResult = { ok: true, stdout: "", stderr: "", command: "none", skipped: true };

  while (attempt <= MAX_RETRIES) {
    const agentResult = await new Promise((resolve, reject) => {
      runAgentFn(currentPrompt, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
    lastAgentResult = agentResult;

    // Spusť testy
    lastTestResult = await runTests(projectPath);

    if (lastTestResult.ok) {
      return {
        success: true,
        attempts: attempt,
        finalResult: agentResult,
        testResult: lastTestResult,
      };
    }

    if (attempt >= MAX_RETRIES) {
      break;
    }

    currentPrompt = buildCorrectionPrompt(originalPrompt, attempt + 1, lastTestResult);
    attempt++;
  }

  return {
    success: false,
    attempts: attempt,
    finalResult: lastAgentResult,
    testResult: lastTestResult,
  };
}

module.exports = {
  MAX_RETRIES,
  detectTestCommand,
  runTests,
  hasFailures,
  buildCorrectionPrompt,
  selfCorrect,
};
