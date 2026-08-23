// Lehký markdown renderer — bez dependency, bez dangerouslySetInnerHTML (XSS-safe).
// Pokrývá běžné případy, které LLM generuje: **bold**, *italic*, # headers, - / 1. listy, odřádkování.

function renderInline(text) {
  // **bold** a *italic* (bold má přednost)
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={m.index}>{token.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={m.index}>{token.slice(1, -1)}</em>);
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const out = [];
  let listBuf = null; // { ordered: bool, items: [] }
  let listKey = 0;

  const flushList = () => {
    if (!listBuf) return;
    const items = listBuf.items;
    const Tag = listBuf.ordered ? "ol" : "ul";
    out.push(
      <Tag key={`list-${listKey++}`} className={listBuf.ordered ? "list-decimal" : "list-disc"} style={{ paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
        {items.map((it, i) => (
          <li key={i} className="my-0.5">{renderInline(it)}</li>
        ))}
      </Tag>
    );
    listBuf = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // prázdný řádek → ukonči list, přidej mezeru
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // header
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1].length;
      const content = renderInline(h[2]);
      const cls = ["text-base font-semibold", "text-sm font-semibold", "text-[13px] font-semibold", "text-[12px] font-semibold"][level - 1] || "text-[13px] font-semibold";
      out.push(<div key={i} className={`${cls} text-[#f4f4f4] mt-3 mb-1`}>{content}</div>);
      continue;
    }

    // unordered list
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    if (ul) {
      if (!listBuf || listBuf.ordered) { flushList(); listBuf = { ordered: false, items: [] }; }
      listBuf.items.push(ul[1]);
      continue;
    }

    // ordered list
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (!listBuf || !listBuf.ordered) { flushList(); listBuf = { ordered: true, items: [] }; }
      listBuf.items.push(ol[1]);
      continue;
    }

    // běžný řádek
    flushList();
    out.push(<p key={i} className="my-0.5">{renderInline(line)}</p>);
  }
  flushList();

  return <div className="text-[13px] text-[#d4d4d4] leading-relaxed">{out}</div>;
}
