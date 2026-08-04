import { useState, useEffect } from "react";

const API = "http://localhost:8891";

export default function ProjectDetail({ projectName, onBack }) {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBugForm, setShowBugForm] = useState(false);
  const [bugTitle, setBugTitle] = useState("");
  const [bugDesc, setBugDesc] = useState("");
  const [bugSeverity, setBugSeverity] = useState("medium");
  const [bugSaving, setBugSaving] = useState(false);
  const [bugError, setBugError] = useState(null);

  useEffect(() => {
    if (!projectName) return;
    fetch(`${API}/api/projects/${encodeURIComponent(projectName)}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectName]);

  const submitBug = (e) => {
    e.preventDefault();
    if (!bugTitle.trim()) return;
    setBugSaving(true);
    setBugError(null);
    fetch(`${API}/api/bugs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: projectName,
        title: bugTitle.trim(),
        description: bugDesc.trim(),
        severity: bugSeverity,
      }),
    })
      .then((r) => r.json())
      .then(() => {
        setBugTitle("");
        setBugDesc("");
        setBugSeverity("medium");
        setShowBugForm(false);
        // reload
        return fetch(`${API}/api/projects/${encodeURIComponent(projectName)}`)
          .then((r) => r.json())
          .then(setProject);
      })
      .catch((err) => setBugError(err.message))
      .finally(() => setBugSaving(false));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) return <p className="text-[#5c5c5c]">Načítám detail...</p>;
  if (!project) return <p className="text-[#e85d5d]">Projekt nenalezen</p>;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="text-xs text-[#C89B3C] hover:text-[#8f6f26] mb-4"
      >
        ← Zpět na Pulse
      </button>

      {/* Header */}
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6 mb-4">
        <h2 className="text-xl font-semibold mb-1">{project.name}</h2>
        <div className="flex items-center gap-3 text-xs text-[#5c5c5c] mb-3">
          <span>{project.branch}</span>
          <span>•</span>
          <span>{project.lastCommit}</span>
          <span>•</span>
          <span className={project.dirty ? "text-[#e5b34b]" : "text-[#3ecf8e]"}>
            {project.dirty ? "dirty" : "clean"}
          </span>
        </div>
        <p className="text-sm text-[#9d9d9d]">{project.lastMsg}</p>
        <p className="text-xs text-[#5c5c5c] mt-1">Hash: {project.lastHash}</p>
      </div>

      {/* Bug tickets */}
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#C89B3C] uppercase tracking-wider">
            Bug tickets ({project.bugs?.length || 0})
          </h3>
          <button
            onClick={() => setShowBugForm(!showBugForm)}
            className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors"
          >
            {showBugForm ? "Zavřít" : "+ Nový bug"}
          </button>
        </div>

        {showBugForm && (
          <form onSubmit={submitBug} className="bg-[#161616] border border-[#232323] rounded-lg p-4 mb-3 space-y-3">
            <div>
              <label className="block text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
                Titulek *
              </label>
              <input
                value={bugTitle}
                onChange={(e) => setBugTitle(e.target.value)}
                placeholder="Co je rozbitý?"
                className="w-full bg-[#0a0a0a] border border-[#232323] rounded-md px-3 py-2 text-sm text-[#f4f4f4] placeholder-[#5c5c5c] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
                Popis
              </label>
              <textarea
                value={bugDesc}
                onChange={(e) => setBugDesc(e.target.value)}
                placeholder="Detaily, jak to reprodukovat..."
                rows={3}
                className="w-full bg-[#0a0a0a] border border-[#232323] rounded-md px-3 py-2 text-sm text-[#f4f4f4] placeholder-[#5c5c5c] focus:outline-none focus:border-[#C89B3C]"
              />
            </div>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] text-[#5c5c5c] uppercase tracking-wider mb-1">
                  Severita
                </label>
                <select
                  value={bugSeverity}
                  onChange={(e) => setBugSeverity(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#232323] rounded-md px-3 py-2 text-sm text-[#f4f4f4] focus:outline-none focus:border-[#C89B3C]"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={bugSaving || !bugTitle.trim()}
                className="ml-auto px-4 py-2 rounded-md bg-[#C89B3C] text-[#0a0a0a] text-sm font-semibold hover:bg-[#8f6f26] disabled:opacity-40 transition-colors"
              >
                {bugSaving ? "Ukládám..." : "Vytvořit bug"}
              </button>
            </div>
            {bugError && <p className="text-[#e85d5d] text-xs">{bugError}</p>}
          </form>
        )}

        {project.bugs && project.bugs.length > 0 ? (
          <div className="space-y-2">
            {project.bugs.map((bug) => (
              <div
                key={bug.id}
                className="bg-[#161616] border border-[#232323] rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{bug.title}</span>
                  <span
                    className={`text-[10px] uppercase px-2 py-0.5 rounded font-semibold ${
                      bug.status === "open"
                        ? "text-[#e85d5d] bg-[rgba(232,93,93,0.12)] border border-[rgba(232,93,93,0.3)]"
                        : "text-[#3ecf8e] bg-[rgba(62,207,142,0.12)] border border-[rgba(62,207,142,0.3)]"
                    }`}
                  >
                    {bug.status}
                  </span>
                </div>
                <p className="text-xs text-[#5c5c5c] mb-2">{bug.description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(bug.description)}
                    className="text-[10px] px-2 py-1 rounded bg-[#232323] text-[#9d9d9d] hover:text-[#f4f4f4] transition-colors"
                  >
                    Copy prompt
                  </button>
                  <button
                    onClick={() => copyToClipboard(`Oprav chybu v projektu ${project.name}: ${bug.title}\n\n${bug.description}`)}
                    className="text-[10px] px-2 py-1 rounded bg-[#232323] text-[#9d9d9d] hover:text-[#f4f4f4] transition-colors"
                  >
                    Copy pro kodéra
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#5c5c5c]">Žádné bug tickets</p>
        )}
      </div>

      {/* Git log */}
      <div className="bg-[#111] border border-[#232323] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-[#C89B3C] uppercase tracking-wider mb-3">
          Poslední commity
        </h3>
        <div className="space-y-1">
          {project.log && project.log.length > 0 ? (
            project.log.map((line, i) => (
              <p key={i} className="text-xs text-[#5c5c5c] font-mono">
                {line}
              </p>
            ))
          ) : (
            <p className="text-xs text-[#5c5c5c]">Žádné commity</p>
          )}
        </div>
      </div>
    </div>
  );
}
