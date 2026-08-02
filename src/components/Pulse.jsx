import { projects } from "../data/sovereign-data";

const statusColors = {
  ok: "#3ecf8e",
  warn: "#e5b34b",
  alert: "#e85d5d",
  idle: "#5c5c5c",
};

export default function Pulse() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {projects.map((p) => (
        <div
          key={p.name}
          className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-colors"
        >
          <h3 className="text-[15px] font-medium mb-1">{p.name}</h3>
          <p className="text-xs text-[#5c5c5c] mb-2">{p.meta}</p>
          <div className="flex items-center gap-2 text-xs">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: statusColors[p.status] }}
            />
            <span className="text-[#9d9d9d]">{p.lastCommit}</span>
            {p.dirty && <span className="text-[#e5b34b] ml-auto">dirty</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
