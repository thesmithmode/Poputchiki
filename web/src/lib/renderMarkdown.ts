function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineFormat(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inTable = false;
  let inList = false;

  for (const line of lines) {
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);

    if (h3?.[1]) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      if (inTable) {
        output.push("</tbody></table>");
        inTable = false;
      }
      output.push(`<h3>${inlineFormat(h3[1])}</h3>`);
      continue;
    }
    if (h2?.[1]) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      if (inTable) {
        output.push("</tbody></table>");
        inTable = false;
      }
      output.push(`<h2>${inlineFormat(h2[1])}</h2>`);
      continue;
    }
    if (h1?.[1]) {
      if (inList) {
        output.push("</ul>");
        inList = false;
      }
      if (inTable) {
        output.push("</tbody></table>");
        inTable = false;
      }
      output.push(`<h1>${inlineFormat(h1[1])}</h1>`);
      continue;
    }

    if (line.startsWith("|")) {
      if (/^\|[\s\-:|]+\|/.test(line)) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (!inTable) {
        output.push("<table><tbody>");
        inTable = true;
      }
      output.push(`<tr>${cells.map((c) => `<td>${inlineFormat(c)}</td>`).join("")}</tr>`);
      continue;
    }

    if (inTable) {
      output.push("</tbody></table>");
      inTable = false;
    }

    const li = line.match(/^- (.+)/);
    if (li?.[1]) {
      if (!inList) {
        output.push("<ul>");
        inList = true;
      }
      output.push(`<li>${inlineFormat(li[1])}</li>`);
      continue;
    }

    if (inList) {
      output.push("</ul>");
      inList = false;
    }
    if (!line.trim()) continue;
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inList) output.push("</ul>");
  if (inTable) output.push("</tbody></table>");

  return output.join("\n");
}
