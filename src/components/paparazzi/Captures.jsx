// Captures zobrazení (fotky) pro Paparazzi.
import { API } from "../../config";
import { tagColors } from "./constants";

export default function Captures({ captures, tags, filter, setFilter }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md font-semibold border transition-colors ${
              filter === t
                ? "text-[#C89B3C] border-[#C89B3C] bg-[rgba(200,155,60,0.1)]"
                : "text-[#5c5c5c] border-[#232323] hover:text-[#9d9d9d]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {captures.length === 0 ? (
        <p className="text-[#5c5c5c]">Žádné Paparazzi captures.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {captures.slice(0, 30).map((c) => (
            <div key={c.filename} className="bg-[#111] border border-[#232323] rounded-xl p-4 hover:border-[#8f6f26] transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tagColors[c.tag] || "#5c5c5c" }} />
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tagColors[c.tag] || "#5c5c5c" }}>
                  {c.tag}
                </span>
              </div>
              <p className="text-xs text-[#9d9d9d] mb-1 truncate">{c.title}</p>
              <p className="text-[10px] text-[#5c5c5c] font-mono mb-3">{c.timestamp}</p>
              <a
                href={`${API}/api/files?p=${encodeURIComponent(
                  "/Users/petrpiskacek/Library/Mobile Documents/com~apple~CloudDocs/Paparazzi/" + c.filename
                )}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#C89B3C] hover:text-[#8f6f26] transition-colors"
              >
                Otevřít ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
