import { useState } from "react";
import Pulse from "./components/Pulse";
import Pipeline from "./components/Pipeline";
import Log from "./components/Log";
import Agents from "./components/Agents";
import ProjectDetail from "./components/ProjectDetail";
import Paparazzi from "./components/Paparazzi";

const tabs = [
  { id: "pulse", label: "Pulse" },
  { id: "pipeline", label: "Pipeline" },
  { id: "agents", label: "Agenti" },
  { id: "paparazzi", label: "Paparazzi" },
  { id: "log", label: "Log" },
];

function App() {
  const [activeTab, setActiveTab] = useState("pulse");
  const [selectedProject, setSelectedProject] = useState(null);

  const handleSelectProject = (name) => {
    setSelectedProject(name);
    setActiveTab("pulse");
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
        <div className="text-right">
          <div className="text-[22px] font-medium text-[#C89B3C] tabular-nums" id="clock">
            {new Date().toLocaleTimeString("en-GB", { hour12: false })}
          </div>
          <div className="text-[11px] text-[#5c5c5c] uppercase tracking-wider">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "2-digit",
            })}
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
            {activeTab === "pulse" && <Pulse onSelectProject={handleSelectProject} />}
            {activeTab === "pipeline" && <Pipeline />}
            {activeTab === "agents" && <Agents />}
            {activeTab === "paparazzi" && <Paparazzi />}
            {activeTab === "log" && <Log />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-[#232323] flex justify-between text-[11px] text-[#5c5c5c]">
        <span>Sovereign OS &middot; Central Brain</span>
        <span className="text-[#C89B3C]">The Spine is live</span>
      </footer>
    </div>
  );
}

export default App;
