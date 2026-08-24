import { useState } from "react";
import { API, authHeaders } from "../config";

function ContextPreview({ projectName }) {
  const [task, setTask] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const preview = async (e) => {
    e.preventDefault();
    if (!task.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/context/preview`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ project: projectName, task, maxFiles: 6 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl p-4 mt-4">
      <h3 className="text-sm font-semibold mb-2">Context Preview</h3>
      <p className="text-[11px] text-[#5c5c5c] mb-3">
        Zadej task a uvidíš, které soubory agent dostane do promptu.
      </p>
      <form onSubmit={preview} className="flex gap-2 mb-3">
        <input
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="např. opravit bug v executoru"
          className="flex-1 bg-[#0a0a0a] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4] placeholder-[#5c5c5c] outline-none focus:border-[#C89B3C]"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-2 text-[11px] font-medium bg-[#C89B3C] text-[#0a0a0a] rounded-lg hover:bg-[#8f6f26] disabled:opacity-40 transition-colors"
        >
          {loading ? "…" : "Preview"}
        </button>
      </form>

      {error && <div className="text-[11px] text-red-400 mb-2">{error}</div>}

      {result && (
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] text-[#5c5c5c]">
            <span>Soubory: {result.files.length}</span>
            <span>~{result.usedTokens} tokens</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {result.files.map((f) => (
              <span key={f} className="text-[10px] px-2 py-0.5 rounded bg-[#232323] text-[#C89B3C]">
                {f}
              </span>
            ))}
          </div>
          <details className="text-[11px] text-[#9d9d9d]">
            <summary className="cursor-pointer hover:text-[#f4f4f4]">Zobrazit celý kontext</summary>
            <pre className="mt-2 p-2 bg-[#0a0a0a] border border-[#232323] rounded-lg overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {result.context}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

export default ContextPreview;
