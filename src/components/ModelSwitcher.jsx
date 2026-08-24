import { useState, useEffect, useRef } from "react";
import { API, AUTH_TOKEN, authHeaders } from "../config";

// Seznam dostupných modelů (pro dropdown)
const AVAILABLE_MODELS = [
  { id: "ollama/minimax-m3:cloud", label: "MiniMax M3", group: "exec" },
  { id: "ollama/kimi-k2.7-code:cloud", label: "Kimi K2.7 Code", group: "exec" },
  { id: "ollama/deepseek-v4-flash:cloud", label: "DeepSeek V4 Flash", group: "exec" },
  { id: "ollama/gemma4:31b-cloud", label: "Gemma 4 31B", group: "exec" },
  { id: "minimax-m3:cloud", label: "MiniMax M3 (ollama)", group: "ollama" },
  { id: "kimi-k2.7-code:cloud", label: "Kimi K2.7 (ollama)", group: "ollama" },
  { id: "deepseek-v4-flash:cloud", label: "DeepSeek V4 (ollama)", group: "ollama" },
];

// Zjednodušený seznam — jen ty, co dávají smysl
const EXEC_MODELS = [
  "ollama/minimax-m3:cloud",
  "ollama/kimi-k2.7-code:cloud",
  "ollama/deepseek-v4-flash:cloud",
  "ollama/gemma4:31b-cloud",
];

const OLLAMA_MODELS = [
  "minimax-m3:cloud",
  "kimi-k2.7-code:cloud",
  "deepseek-v4-flash:cloud",
];

function ModelSwitcher() {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Načti aktuální modely
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/config/model`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted) {
          setModels(data);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e.message);
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Zavři dropdown při kliknutí mimo
  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleChange = async (field, value) => {
    if (!value) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body = field === "execModel" ? { execModel: value } : { ollamaModel: value };
      const res = await fetch(`${API}/api/config/model`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setModels({ execModel: data.execModel, ollamaModel: data.ollamaModel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/config/model/reset`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels({ execModel: data.execModel, ollamaModel: data.ollamaModel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-[11px] text-[#5c5c5c] px-2 py-1">Model…</div>
    );
  }

  if (error && !models) {
    return (
      <div className="text-[11px] text-red-400 px-2 py-1" title={error}>Model error</div>
    );
  }

  const shortName = (full) => {
    if (!full) return "—";
    const parts = full.split("/");
    return parts[parts.length - 1].replace(":cloud", "").replace("-cloud", "");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#232323] hover:border-[#C89B3C]/50 transition-colors text-[12px]"
        title="Přepnout model"
      >
        <span className="text-[#5c5c5c]">⚙</span>
        <span className="text-[#C89B3C] font-medium">
          {models ? shortName(models.execModel) : "—"}
        </span>
        <span className={`text-[#5c5c5c] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-[#111] border border-[#232323] rounded-xl shadow-2xl z-50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-[#5c5c5c] mb-2">
            Model přepínač
          </div>

          {/* Exec model */}
          <div className="mb-3">
            <label className="text-[11px] text-[#9d9d9d] block mb-1">
              Exec model (agenti)
            </label>
            <select
              value={models?.execModel || ""}
              onChange={(e) => handleChange("execModel", e.target.value)}
              disabled={saving}
              className="w-full bg-[#0a0a0a] border border-[#232323] rounded-lg px-2 py-1.5 text-[12px] text-[#f4f4f4] focus:outline-none focus:border-[#C89B3C]"
            >
              {EXEC_MODELS.map((m) => (
                <option key={m} value={m}>{shortName(m)}</option>
              ))}
            </select>
          </div>

          {/* Ollama model */}
          <div className="mb-3">
            <label className="text-[11px] text-[#9d9d9d] block mb-1">
              Ollama model (Paparazzi)
            </label>
            <select
              value={models?.ollamaModel || ""}
              onChange={(e) => handleChange("ollamaModel", e.target.value)}
              disabled={saving}
              className="w-full bg-[#0a0a0a] border border-[#232323] rounded-lg px-2 py-1.5 text-[12px] text-[#f4f4f4] focus:outline-none focus:border-[#C89B3C]"
            >
              {OLLAMA_MODELS.map((m) => (
                <option key={m} value={m}>{shortName(m)}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          {saving && <div className="text-[11px] text-[#C89B3C] mb-2">Ukládám…</div>}
          {saved && <div className="text-[11px] text-green-400 mb-2">✓ Uloženo</div>}
          {error && <div className="text-[11px] text-red-400 mb-2">{error}</div>}

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={saving}
            className="w-full text-[11px] text-[#5c5c5c] hover:text-[#C89B3C] py-1 border-t border-[#232323] mt-1 transition-colors"
          >
            Reset na výchozí
          </button>
        </div>
      )}
    </div>
  );
}

export default ModelSwitcher;
