// ===== Systémový monitoring (CPU, RAM, disk, procesy) =====
const os = require("os");
const { run } = require("./runner.cjs");

function fmtBytes(bytes) {
  if (!bytes) return "?";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return gb.toFixed(1) + " GB";
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(0) + " MB";
}

async function collectSystemData() {
  const [loadAvg, memStats, diskStats, topProcs, uptime] = await Promise.allSettled([
    run("sysctl -n vm.loadavg 2>/dev/null | awk '{print $1, $2, $3}'"),
    run("vm_stat 2>/dev/null | head -6"),
    run("df -h / 2>/dev/null | tail -1"),
    run("ps aux -r 2>/dev/null | head -6 | tail -5"),
    run("uptime 2>/dev/null"),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : "");

  const cores = os.cpus().length;
  const loadParts = val(loadAvg).split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const load1 = loadParts[0] || 0;
  const load5 = loadParts[1] || 0;
  const load15 = loadParts[2] || 0;
  const cpuPct = Math.min(100, Math.round((load1 / cores) * 100));

  const memLines = val(memStats).split("\n");
  const pageSize = 16384;
  const parseMem = (label) => {
    const line = memLines.find((l) => l.includes(label));
    if (!line) return 0;
    const m = line.match(/(\d+)/);
    return m ? parseInt(m[1], 10) * pageSize : 0;
  };
  const freePages = parseMem("Pages free");
  const inactivePages = parseMem("Pages inactive");
  const speculativePages = parseMem("Pages speculative");
  const totalMem = os.totalmem();
  const usedMem = totalMem - freePages - inactivePages - speculativePages;
  const memPct = Math.min(100, Math.round((usedMem / totalMem) * 100));

  const diskParts = val(diskStats).split(/\s+/);
  const diskTotal = diskParts[1] || "?";
  const diskUsed = diskParts[2] || "?";
  const diskAvail = diskParts[3] || "?";
  const diskPct = parseInt((diskParts[4] || "0").replace("%", ""), 10) || 0;

  const procs = val(topProcs)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        cpu: parseFloat(parts[2]) || 0,
        mem: parseFloat(parts[3]) || 0,
        cmd: parts.slice(10).join(" ").slice(0, 40) || "?",
      };
    })
    .slice(0, 5);

  const upParts = val(uptime).match(/up\s+([^,]+)/);
  const uptimeStr = upParts ? upParts[1].trim() : "?";

  return {
    cpu: { cores, load1: +load1.toFixed(2), load5: +load5.toFixed(2), load15: +load15.toFixed(2), pct: cpuPct },
    memory: { total: totalMem, used: usedMem, free: totalMem - usedMem, pct: memPct },
    disk: { total: diskTotal, used: diskUsed, avail: diskAvail, pct: diskPct },
    processes: procs,
    uptime: uptimeStr,
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
  };
}

module.exports = { collectSystemData, fmtBytes };
