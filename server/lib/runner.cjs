const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileP = promisify(execFile);

// Async bounded shell — spustí příkaz v shellu, hard timeout, nikdy nevyhodí (neblokuje event loop)
async function run(cmd, timeoutMs = 4000) {
  try {
    const { stdout } = await execFileP("/bin/zsh", ["-c", cmd], {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return String(stdout).trim();
  } catch {
    return "";
  }
}

module.exports = { run };
