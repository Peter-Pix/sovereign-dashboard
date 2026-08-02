import { pipeline } from "../data/sovereign-data";

const priorityStyles = {
  high: { bg: "rgba(232,93,93,0.15)", color: "#e85d5d", border: "rgba(232,93,93,0.3)" },
  medium: { bg: "rgba(229,179,75,0.15)", color: "#e5b34b", border: "rgba(229,179,75,0.3)" },
  low: { bg: "rgba(92,92,92,0.2)", color: "#5c5c5c", border: "#232323" },
};

export default function Pipeline() {
  return (
    <div className="flex flex-col gap-2">
      {pipeline.map((item, i) => (
        <div
          key={i}
          className="bg-[#111] border border-[#232323] rounded-xl p-4 flex items-center justify-between"
        >
          <div>
            <div className="text-sm font-medium">{item.task}</div>
            <div className="text-xs text-[#9d9d9d] mt-1">{item.desc}</div>
          </div>
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
        </div>
      ))}
    </div>
  );
}
