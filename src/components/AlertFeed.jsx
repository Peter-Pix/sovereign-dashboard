import { useState, useEffect, useCallback } from "react";
import { API, authHeaders } from "../config";

const SEVERITY_ICON = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

const SEVERITY_CLASS = {
  critical: "border-red-500/30 bg-red-500/5",
  warning: "border-[#C89B3C]/30 bg-[#C89B3C]/5",
  info: "border-blue-500/30 bg-blue-500/5",
};

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("cs-CZ", { hour12: false });
}

function AlertFeed({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/alerts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const ack = async (id) => {
    try {
      const res = await fetch(`${API}/api/alerts/${id}/ack`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      alert(`Chyba: ${e.message}`);
    }
  };

  const dismiss = async (id) => {
    try {
      const res = await fetch(`${API}/api/alerts/${id}/dismiss`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      alert(`Chyba: ${e.message}`);
    }
  };

  const runCheck = async () => {
    try {
      const res = await fetch(`${API}/api/alerts/run-check`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      alert(`Chyba: ${e.message}`);
    }
  };

  const list = tab === "active" ? data?.active || [] : data?.history || [];

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[720px] max-w-[92vw] max-h-[76vh] bg-[#111] border border-[#232323] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#232323]">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold">Alerts</h2>
            <span className="text-[11px] text-[#5c5c5c]">
              {data?.summary?.critical || 0} 🔴 · {data?.summary?.warning || 0} 🟡 · {data?.summary?.info || 0} 🔵
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runCheck}
              className="px-3 py-1 text-[11px] text-[#C89B3C] border border-[#C89B3C]/30 rounded-lg hover:bg-[#C89B3C]/10 transition-colors"
            >
              Run check
            </button>
            <button onClick={onClose} className="text-[#5c5c5c] hover:text-[#f4f4f4]">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#232323]">
          {["active", "history"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[12px] font-medium capitalize transition-colors ${
                tab === t ? "text-[#C89B3C] border-b-2 border-[#C89B3C]" : "text-[#5c5c5c] hover:text-[#9d9d9d]"
              }`}
            >
              {t} ({t === "active" ? data?.summary?.total || 0 : data?.history?.length || 0})
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading && !data ? (
            <div className="text-center text-[#5c5c5c] py-8">Načítám…</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">Chyba: {error}</div>
          ) : list.length === 0 ? (
            <div className="text-center text-[#5c5c5c] py-8">
              {tab === "active" ? "Žádné aktivní alerty 🎉" : "Žádná historie"}
            </div>
          ) : (
            list.map((alert) => (
              <div
                key={alert.id}
                className={`mb-2 p-3 rounded-xl border ${SEVERITY_CLASS[alert.severity]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{SEVERITY_ICON[alert.severity]}</span>
                      <span className="text-[13px] font-medium text-[#f4f4f4]">{alert.title}</span>
                      {alert.count > 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#232323] text-[#9d9d9d]">
                          ×{alert.count}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#9d9d9d] mb-1">{alert.message}</p>
                    <p className="text-[10px] text-[#5c5c5c]">
                      {alert.category} · {alert.source} · {formatTime(alert.createdAt)}
                    </p>
                  </div>
                  {tab === "active" && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => ack(alert.id)}
                        className="text-[10px] px-2 py-1 rounded border border-[#C89B3C]/30 text-[#C89B3C] hover:bg-[#C89B3C]/10"
                        title="Acknowledge"
                      >
                        Ack
                      </button>
                      <button
                        onClick={() => dismiss(alert.id)}
                        className="text-[10px] px-2 py-1 rounded border border-[#5c5c5c]/30 text-[#5c5c5c] hover:bg-[#5c5c5c]/10"
                        title="Dismiss"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AlertFeed;
