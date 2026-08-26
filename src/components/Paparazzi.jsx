// Paparazzi — orchestrátor. Subkomponenty jsou v ./paparazzi/.
import { useState, useEffect, useMemo } from "react";
import { API, cachedFetch } from "../config";
import Overview from "./paparazzi/Overview";
import Captures from "./paparazzi/Captures";
import History from "./paparazzi/History";

export default function Paparazzi({ onSelectProject }) {
  const [captures, setCaptures] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [view, setView] = useState("overview"); // overview | captures | history
  const [refreshing, setRefreshing] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    setError(null);
    const url = (p) => `${API}${p}${force ? "?refresh=1" : ""}`;
    Promise.all([
      cachedFetch(url("/api/paparazzi"), { force }),
      cachedFetch(url("/api/paparazzi/data"), { force }),
    ])
      .then(([caps, d]) => {
        setCaptures(caps);
        setData(d);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(load, []);

  const refresh = () => {
    setRefreshing(true);
    load(true);
  };

  const projects = useMemo(() => data?.projects || [], [data]);
  const summary = data?.summary;

  const sortedProjects = useMemo(() => {
    const order = { hot: 0, active: 1, slow: 2, idle: 3 };
    return [...projects].sort((a, b) => (order[a.activity] ?? 9) - (order[b.activity] ?? 9) || b.health - a.health);
  }, [projects]);

  const tags = ["ALL", ...new Set(captures.map((c) => c.tag))];
  const filtered = filter === "ALL" ? captures : captures.filter((c) => c.tag === filter);

  const addBugOptimistically = async (projectName, bugData) => {
    setData(prev => {
      if (!prev || !prev.projects) return prev;
      return {
        ...prev,
        projects: prev.projects.map(p =>
          p.name === projectName
            ? { ...p, bugs: [...(p.bugs || []), { ...bugData, id: "temp-id", status: "open" }] }
            : p
        )
      };
    });

    try {
      const res = await fetch(`${API}/api/bugs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": import.meta.env.VITE_AUTH_TOKEN,
        },
        body: JSON.stringify({ project: projectName, ...bugData })
      });
      if (!res.ok) throw new Error("Failed to save bug");
      load(true);
    } catch {
      setError("Failed to add bug. Reverting...");
      load(false);
    }
  };

  const viewLabels = { overview: "Přehled", captures: "Captures", history: "Historie" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["overview", "captures", "history"]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold border transition-colors ${
                view === v
                  ? "text-[#C89B3C] border-[#C89B3C] bg-[rgba(200,155,60,0.1)]"
                  : "text-[#5c5c5c] border-[#232323] hover:text-[#9d9d9d]"
              }`}
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>
        <button onClick={refresh} className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors">
          {refreshing ? "⟳ Obnovuji..." : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <p className="text-[#e85d5d] text-sm bg-[rgba(232,93,93,0.1)] border border-[rgba(232,93,93,0.3)] rounded-lg p-3">
          Chyba: {error}
        </p>
      )}

      {loading && !refreshing ? (
        <p className="text-[#5c5c5c]">Paparazzi sbírá data...</p>
      ) : view === "overview" ? (
        <Overview
          summary={summary}
          projects={sortedProjects}
          system={data?.system}
          cached={data?.cached}
          refreshTrigger={refreshing}
          onAddBug={addBugOptimistically}
          onSelectProject={onSelectProject}
        />
      ) : view === "captures" ? (
        <Captures captures={filtered} tags={tags} filter={filter} setFilter={setFilter} />
      ) : (
        <History />
      )}
    </div>
  );
}
