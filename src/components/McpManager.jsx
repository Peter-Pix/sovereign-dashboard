import { useState, useEffect, useCallback } from "react";
import { API, authHeaders } from "../config";

/**
 * McpManager — správa MCP serverů (Model Context Protocol).
 *
 * Přemostění do OpenClaw-managed MCP registru. Dashboard umí:
 * - List serverů + status
 * - Přidat/upravit (stdio: command/args/env | HTTP: url/headers)
 * - Smazat
 * - Probe (live ověření + list tools)
 */
function McpManager() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [probing, setProbing] = useState(null); // name sedang probe
  const [probeResult, setProbeResult] = useState(null);
  const [form, setForm] = useState({
    name: "",
    type: "stdio", // stdio | http
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem $HOME",
    url: "",
    transport: "streamable-http",
    headers: "",
    env: "",
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/mcp`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setServers(data.servers || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const probe = async (name) => {
    setProbing(name);
    setProbeResult(null);
    setError(null);
    try {
      const res = await fetch(`${API}/api/mcp/${encodeURIComponent(name)}/probe`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProbeResult({ name, ...data });
    } catch (e) {
      setError(`Probe ${name}: ${e.message}`);
    } finally {
      setProbing(null);
    }
  };

  const remove = async (name) => {
    if (!confirm(`Smazat MCP server "${name}"?`)) return;
    setError(null);
    try {
      const res = await fetch(`${API}/api/mcp/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setError(null);
    try {
      let definition;
      if (form.type === "stdio") {
        const args = form.args.split(/\s+/).filter(Boolean);
        definition = { command: form.command, args };
      } else {
        definition = { url: form.url, transport: form.transport };
        if (form.headers.trim()) {
          try { definition.headers = JSON.parse(form.headers); }
          catch { throw new Error("Headers musí být validní JSON (např. {\"Authorization\":\"Bearer x\"}") ; }
        }
      }
      const res = await fetch(`${API}/api/mcp`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name: form.name.trim(), definition }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setShowForm(false);
      setForm({ ...form, name: "", headers: "", env: "" });
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const preset = (kind) => {
    const presets = {
      filesystem: {
        type: "stdio",
        command: "npx",
        args: "-y @modelcontextprotocol/server-filesystem $HOME",
      },
      memory: {
        type: "stdio",
        command: "npx",
        args: "-y @modelcontextprotocol/server-memory",
      },
      postgres: {
        type: "stdio",
        command: "npx",
        args: "-y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost:5432/db",
      },
      mysql: {
        type: "stdio",
        command: "npx",
        args: "-y @modelcontextprotocol/server-mysql --conn localhost --user root --pass pass --db db",
      },
    };
    const p = presets[kind];
    if (p) setForm((f) => ({ ...f, ...p }));
  };

  const typeLabel = (t) => {
    const s = String(t || "").toLowerCase();
    if (s.includes("http") || s === "sse") return "bg-blue-500/15 text-blue-400 border-blue-400/30";
    return "bg-[#C89B3C]/15 text-[#C89B3C] border-[#C89B3C]/30";
  };


    t === "http" || t === "streamable-http" || t === "sse"
      ? "bg-blue-500/15 text-blue-400 border-blue-400/30"
      : "bg-[#C89B3C]/15 text-[#C89B3C] border-[#C89B3C]/30";

  return (
    <div className="bg-[#111] border border-[#232323] rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">MCP Servers</h3>
          <p className="text-[11px] text-[#5c5c5c]">
            Model Context Protocol — připojení externích databází a nástrojů pro agenty.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-[11px] px-3 py-1.5 rounded-md font-semibold bg-[#C89B3C] text-[#0a0a0a] hover:bg-[#8f6f26] transition-colors"
        >
          {showForm ? "Zrušit" : "+ Přidat server"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={save} className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-[11px] text-[#5c5c5c] self-center">Presets:</span>
            {["filesystem", "memory", "postgres", "mysql"].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => preset(k)}
                className="text-[10px] px-2 py-1 rounded border border-[#232323] text-[#9d9d9d] hover:border-[#C89B3C]/40 hover:text-[#C89B3C] transition-colors"
              >
                {k}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Název</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="např. prod-postgres"
                className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
                required
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                title="Až 64 znaků, jen písmena/čísla/._-"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Typ</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
              >
                <option value="stdio">stdio (local)</option>
                <option value="http">HTTP (remote)</option>
              </select>
            </div>
          </div>

          {form.type === "stdio" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Command</label>
                  <input
                    value={form.command}
                    onChange={(e) => setForm({ ...form, command: e.target.value })}
                    className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Args</label>
                  <input
                    value={form.args}
                    onChange={(e) => setForm({ ...form, args: e.target.value })}
                    placeholder="-y @modelcontextprotocol/server-filesystem $HOME"
                    className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://mcp.example.com/mcp"
                  className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">Headers (JSON)</label>
                <input
                  value={form.headers}
                  onChange={(e) => setForm({ ...form, headers: e.target.value })}
                  placeholder='{"Authorization":"Bearer token"}'
                  className="mt-1 w-full bg-[#111] border border-[#232323] rounded-lg px-3 py-2 text-[12px] text-[#f4f4f4]"
                />
              </div>
            </>
          )}

          {formError && (
            <div className="text-[12px] text-red-400">{formError}</div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full text-[11px] px-3 py-2 rounded-lg font-semibold bg-[#C89B3C] text-[#0a0a0a] hover:bg-[#8f6f26] disabled:opacity-40 transition-colors"
          >
            {saving ? "Ukládám..." : "Uložit server"}
          </button>
        </form>
      )}

      {/* Server list */}
      {loading ? (
        <p className="text-[#5c5c5c] text-[12px]">Načítám MCP servery...</p>
      ) : servers.length === 0 ? (
        <div className="text-[#5c5c5c] text-[12px] italic py-2">
          Žádné MCP servery nenakonfigurovány. Přidej databázi nebo nástroj.
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((s) => (
            <div key={s.name} className="bg-[#0a0a0a] border border-[#232323] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.ok ? "bg-green-400" : s.configured ? "bg-yellow-400" : "bg-red-400"}`} />
                  <span className="text-[13px] font-medium text-[#f4f4f4]">{s.name}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded border ${typeLabel(s.transport)}`}>
                    {s.transport || "stdio"}
                  </span>
                  {!s.enabled && (
                    <span className="text-[9px] px-2 py-0.5 rounded border border-gray-500/30 text-gray-400">disabled</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => probe(s.name)}
                    disabled={probing === s.name}
                    className="text-[10px] px-2 py-1 rounded border border-[#232323] text-[#9d9d9d] hover:border-[#C89B3C]/40 hover:text-[#C89B3C] disabled:opacity-40 transition-colors"
                  >
                    {probing === s.name ? "Probe..." : "Probe"}
                  </button>
                  <button
                    onClick={() => remove(s.name)}
                    className="text-[10px] px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    Smazat
                  </button>
                </div>
              </div>

              {/* launch command */}
              {s.launch && (
                <div className="mt-2 text-[10px] font-mono text-[#5c5c5c] bg-[#111] rounded px-2 py-1 break-all">
                  {s.launch}
                </div>
              )}

              {/* probe result */}
              {probeResult && probeResult.name === s.name && (
                <div className="mt-2 bg-[#161616] border border-[#232323] rounded-lg p-2 space-y-1">
                  <div className="text-[11px] text-[#9d9d9d]">
                    <span className="text-[#C89B3C]">Tools:</span> {probeResult.tools}
                    {probeResult.resources && <span className="ml-2 text-[#9d9d9d]">· resources ✓</span>}
                    {probeResult.prompts && <span className="ml-2 text-[#9d9d9d]">· prompts ✓</span>}
                  </div>
                  {probeResult.toolList && probeResult.toolList.length > 0 && (
                    <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1">
                      {probeResult.toolList.map((t) => (
                        <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#111] border border-[#232323] rounded text-[#5c5c5c]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default McpManager;
