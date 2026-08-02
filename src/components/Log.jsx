import { log } from "../data/sovereign-data";

const tagStyles = {
  victory: { bg: "rgba(62,207,142,0.12)", color: "#3ecf8e", border: "rgba(62,207,142,0.3)" },
  struggle: { bg: "rgba(232,93,93,0.12)", color: "#e85d5d", border: "rgba(232,93,93,0.3)" },
  progress: { bg: "rgba(229,179,75,0.12)", color: "#e5b34b", border: "rgba(229,179,75,0.3)" },
  milestone: { bg: "rgba(200,155,60,0.12)", color: "#C89B3C", border: "rgba(200,155,60,0.3)" },
};

export default function Log() {
  return (
    <ul className="space-y-0">
      {log.map((entry, i) => (
        <li
          key={i}
          className="flex gap-3 py-2.5 border-b border-[#232323] text-sm last:border-b-0"
        >
          <span className="text-[#C89B3C] text-xs min-w-[60px]">{entry.time}</span>
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold min-w-[60px] text-center"
            style={{
              background: tagStyles[entry.tag].bg,
              color: tagStyles[entry.tag].color,
              border: `1px solid ${tagStyles[entry.tag].border}`,
            }}
          >
            {entry.tag}
          </span>
          <span className="text-[#9d9d9d]">{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
