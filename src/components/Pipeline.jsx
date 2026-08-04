import { useState } from "react";
import { pipeline as seedPipeline, log as seedLog } from "../data/sovereign-data";

const API = "http://localhost:8891";

const priorityStyles = {
  high: { bg: "rgba(232,93,93,0.15)", color: "#e85d5d", border: "rgba(232,93,93,0.3)" },
  medium: { bg: "rgba(229,179,75,0.15)", color: "#e5b34b", border: "rgba(229,179,75,0.3)" },
  low: { bg: "rgba(92,92,92,0.2)", color: "#5c5c5c", border: "#232323" },
};

export default function Pipeline() {
  const [items, setItems] = useState(seedPipeline.map((p) => ({ ...p, status: "todo" })));
  const [runningId, setRunningId] = useState(null);
  const [log, setLog] = useState([]);

  const runTask = (id) => {
    if (runningId) return;
    // Mapování pipeline úkolu → agenta (pouze exekuovatelné agenty)
    const agentMap = { archivist: "archivist", scout: "scout", strategist: "strategist" };
    const agent = agentMap[id];
    if (!agent) {
      const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLog((l) => [{ time: ts, tag: "progress", text: `⚠ Úkol "${items.find(i => i.id === id)?.task}" nemá exekučního agenta` }, ...l]);
      return;
    }
    setRunningId(id);
    const item = items.find((i) => i.id === id);
    const ts = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLog((l) => [{ time: ts, tag: "progress", text: `▶ Spouštím: ${item?.task} (reálná exekuce)` }, ...l]);
    fetch(`${API}/api/agents/${agent}/run`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        const ts2 = new Date().toLocaleTimeString("en-GB", { hour12: false });
        if (data.success) {
          setLog((l) => [{ time: ts2, tag: "victory", text: `✔ Dokončeno: ${item?.task} (${data.tokens || 0} tok)` }, ...l]);
          setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: "done" } : p)));
        } else {
          setLog((l) => [{ time: ts2, tag: "struggle", text: `✘ ${item?.task}: ${data.error || "selhání"}` }, ...l]);
        }
        setRunningId(null);
      })
      .catch((err) => {
        const ts2 = new Date().toLocaleTimeString("en-GB", { hour12: false });
        setLog((l) => [{ time: ts2, tag: "struggle", text: `✘ ${item?.task}: ${err.message}` }, ...l]);
        setRunningId(null);
      });
  };

  const logEntries = [...log, ...seedLog].slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`bg-[#111] border rounded-xl p-4 flex items-center justify-between transition-all ${
            item.status === "done" ? "border-[#3ecf8e] opacity-60" : "border-[#232323]"
          }`}
        >
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              {item.status === "done" && <span className="text-[#3ecf8e]">✓</span>}
              <span className={item.status === "done" ? "line-through" : ""}>{item.task}</span>
            </div>
            <div className="text-xs text-[#9d9d9d] mt-1">{item.desc}</div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold"
              style={{
                background: priorityStyles[item.priority].bg,
                color: priorityStyles[item.priority].color,
                border: `1px solid ${priorityStyles[item.priority].border}`,
              }}
            >
              {item.priority}
            </span>
            <button
              onClick={() => runTask(item.id)}
              disabled={runningId !== null || item.status === "done"}
              className="text-[10px] px-3 py-1.5 rounded-md font-semibold bg-[#232323] text-[#9d9d9d] hover:text-[#f4f4f4] disabled:opacity-40 transition-colors"
            >
              {runningId === item.id ? "Běží..." : item.status === "done" ? "Hotovo" : "Spustit"}
            </button>
          </div>
        </div>
      ))}

      {/* Live log */}
      <div className="mt-4">
        <p className="text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">Pipeline log</p>
        <div className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
          {logEntries.map((entry, i) => (
            <p key={i} className="text-[10px] font-mono text-[#5c5c5c]">
              <span className="text-[#C89B3C]">{entry.time}</span>{" "}
              <span className={entry.tag === "victory" ? "text-[#3ecf8e]" : entry.tag === "progress" ? "text-[#e5b34b]" : ""}>
                {entry.text}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
