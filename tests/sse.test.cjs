// ===== Unit + integrační testy pro SSE Stream (agents + routes) =====

const { test } = require("node:test");
const assert = require("node:assert");
const http = require("http");

// Unit testy pro runAgentStream
const { runAgentStream, AGENT_TASKS } = require("../server/lib/agents.cjs");

test("runAgentStream: neznámý agent okamžitě zavolá onError", () => {
  let err = null;
  const handle = runAgentStream("nonexistent", {
    onError: (e) => { err = e; },
  });
  assert.ok(err, "mel by byt error");
  assert.ok(err.message.includes("Neznámý agent"));
  assert.strictEqual(typeof handle.kill, "function");
});

test("runAgentStream: handler vrací kill funkci", () => {
  // Známý agent — zkusíme spawn, ale hned zabijeme
  const agentName = Object.keys(AGENT_TASKS)[0];
  if (!agentName) {
    console.log("SKIP: žádný agent není definován");
    return;
  }

  let stdoutSeen = false;
  const handle = runAgentStream(agentName, {
    onStdout: () => { stdoutSeen = true; },
    onError: () => {},
    onDone: () => {},
  });

  assert.strictEqual(typeof handle.kill, "function");
  assert.ok(handle.pid, "mel mit pid");

  // Ukliď — nechceme spouštět openclaw naplno v testech
  handle.kill();
});

// Integrační test pro SSE endpoint (pokud běží server)
test("SSE /api/agents/:name/stream: bez auth vrací 401", { timeout: 5000 }, async () => {
  return new Promise((resolve, reject) => {
    const req = http.get("http://localhost:8891/api/agents/spine/stream", (res) => {
      let body = "";
      res.on("data", (c) => body += c);
      res.on("end", () => {
        try {
          assert.strictEqual(res.statusCode, 401);
          const data = JSON.parse(body);
          assert.strictEqual(data.error, "Unauthorized");
          assert.ok(data.correlationId);
          resolve();
        } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error("Timeout — je server běžící?"));
    });
  });
});

test("SSE /api/agents/:name/stream: s auth posílá SSE headers", { timeout: 5000 }, async () => {
  const token = "f9b91a8b88e071b8c5991610ad14b8097e7c3bb24c893869ab0f191c5b1bebe1";
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:8891/api/agents/spine/stream?token=${token}`, (res) => {
      try {
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.headers["content-type"], "text/event-stream");
        assert.strictEqual(res.headers["cache-control"], "no-cache");
        assert.strictEqual(res.headers["connection"], "keep-alive");
        assert.strictEqual(res.headers["x-accel-buffering"], "no");

        let chunks = "";
        const timeout = setTimeout(() => {
          res.destroy();
          // Měli bychom dostat alespoň start event
          assert.ok(chunks.includes('"type":"start"'), `mel obsahovat start event, got: ${chunks.slice(0,200)}`);
          resolve();
        }, 1500);

        res.on("data", (c) => {
          chunks += c.toString();
          if (chunks.includes('"type":"start"')) {
            clearTimeout(timeout);
            res.destroy();
            resolve();
          }
        });
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error("Timeout — je server běžící?"));
    });
  });
});
