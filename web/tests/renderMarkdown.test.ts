import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/lib/renderMarkdown";

describe("renderMarkdown", () => {
  it("преобразует # в <h1>", () => {
    expect(renderMarkdown("# Заголовок")).toContain("<h1");
    expect(renderMarkdown("# Заголовок")).toContain("Заголовок");
  });

  it("преобразует ## в <h2>", () => {
    expect(renderMarkdown("## Раздел")).toContain("<h2");
  });

  it("преобразует ### в <h3>", () => {
    expect(renderMarkdown("### Подраздел")).toContain("<h3");
  });

  it("преобразует **text** в <strong>", () => {
    expect(renderMarkdown("**важно**")).toContain("<strong>важно</strong>");
  });

  it("оборачивает обычный абзац в <p>", () => {
    expect(renderMarkdown("Простой текст")).toContain("<p>Простой текст</p>");
  });

  it("преобразует строки списка - в <li>", () => {
    const html = renderMarkdown("- пункт один\n- пункт два");
    expect(html).toContain("<li>пункт один</li>");
    expect(html).toContain("<li>пункт два</li>");
    expect(html).toContain("<ul");
  });

  it("экранирует < и > в тексте", () => {
    const html = renderMarkdown("x < y и y > z");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });

  it("преобразует строку таблицы | col | в <tr>", () => {
    const md = "| Данные | Источник |\n|--------|----------|\n| tg_id | Telegram |";
    const html = renderMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("<td>");
  });
});
