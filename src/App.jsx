import { useState, useEffect } from "react";
import Agents from "./components/Agents";
import ProjectDetail from "./components/ProjectDetail";
import Paparazzi from "./components/Paparazzi";
import Leads from "./components/Leads";
import Roadmaps from "./components/Roadmaps";
import ModelSwitcher from "./components/ModelSwitcher";
import CommandPalette from "./components/CommandPalette";
import AlertBell from "./components/AlertBell";
import AlertFeed from "./components/AlertFeed";

const tabs = [
  { id: "paparazzi", label: "Projekty" },
  { id: "roadmaps", label: "Roadmapy" },
  { id: "leads", label: "Leady" },
  { id: "agents", label: "Agenti" },
];

function App() {
  const [activeTab, setActiveTab] = useState("paparazzi");
  const [selectedProject, setSelectedProject] = useState(null);
  const [alertFeedOpen, setAlertFeedOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleSelectProject = (name) => {
    setSelectedProject(name);
    setActiveTab("paparazzi");
  };

  const handleBack = () => {
    setSelectedProject(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f4f4f4] font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-[#232323]">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sovereign Command</h1>
          <span className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">
            Central Brain &middot; The Spine
          </span>
        </div>
        <div className="flex items-center gap-4">
          <ModelSwitcher />
          <AlertBell onOpenFeed={() => setAlertFeedOpen(true)} />
          <div className="text-right">
            <div className="text-[22px] font-medium text-[#C89B3C] tabular-nums" id="clock">
              {now.toLocaleTimeString("en-GB", { hour12: false })}
            </div>
            <div className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">
              {now.toLocaleDateString("en-GB", {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "2-digit",
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Tabs (skryjeme když je otevřenej detail projektu) */}
      {!selectedProject && (
        <div className="flex gap-0 px-8 border-b border-[#232323]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id
                  ? "text-[#C89B3C] border-[#C89B3C]"
                  : "text-[#5c5c5c] border-transparent hover:text-[#9d9d9d]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 p-8">
        {selectedProject ? (
          <ProjectDetail
            projectName={selectedProject}
            onBack={handleBack}
          />
        ) : (
          <>
            {activeTab === "paparazzi" && <Paparazzi onSelectProject={handleSelectProject} />}
            {activeTab === "roadmaps" && <Roadmaps />}
            {activeTab === "leads" && <Leads />}
            {activeTab === "agents" && <Agents />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#232323] flex justify-between text-[11px] text-[#5c5c5c]">
        <span>Sovereign OS &middot; Central Brain</span>
        <span className="text-[#C89B3C]">The Spine is live</span>
      </footer>

      {/* Globální modály — Command Palette (Cmd+K) + Alert Feed */}
      <CommandPalette
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSelectProject={handleSelectProject}
        onClose={() => {}}
      />
      {alertFeedOpen && <AlertFeed onClose={() => setAlertFeedOpen(false)} />}
    </div>
  );
}

export default App;
