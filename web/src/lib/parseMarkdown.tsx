import type { ReactNode } from "react";

function parseInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((p) => {
        const m = p.match(/^\*\*(.+)\*\*$/);
        return m ? <strong key={p}>{m[1]}</strong> : p;
      })}
    </>
  );
}

export function parseMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.split("\n");
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let tableRows: ReactNode[] = [];
  let inTable = false;

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(<ul key={`ul-${nodes.length}`}>{listItems}</ul>);
      listItems = [];
    }
  };
  const flushTable = () => {
    if (tableRows.length > 0) {
      nodes.push(
        <table key={`tbl-${nodes.length}`}>
          <tbody>{tableRows}</tbody>
        </table>,
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);

    if (h3?.[1]) {
      flushList();
      flushTable();
      nodes.push(<h3 key={i}>{parseInline(h3[1])}</h3>);
      continue;
    }
    if (h2?.[1]) {
      flushList();
      flushTable();
      nodes.push(<h2 key={i}>{parseInline(h2[1])}</h2>);
      continue;
    }
    if (h1?.[1]) {
      flushList();
      flushTable();
      nodes.push(<h1 key={i}>{parseInline(h1[1])}</h1>);
      continue;
    }

    if (line.startsWith("|")) {
      if (/^\|[\s\-:|]+\|/.test(line)) continue;
      flushList();
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      tableRows.push(
        <tr key={i}>
          {cells.map((c) => (
            <td key={c}>{parseInline(c ?? "")}</td>
          ))}
        </tr>,
      );
      inTable = true;
      continue;
    }
    if (inTable) flushTable();

    const li = line.match(/^- (.+)/);
    if (li?.[1]) {
      listItems.push(<li key={i}>{parseInline(li[1])}</li>);
      continue;
    }
    flushList();

    if (!line.trim()) continue;
    nodes.push(<p key={i}>{parseInline(line)}</p>);
  }

  flushList();
  flushTable();
  return nodes;
}
