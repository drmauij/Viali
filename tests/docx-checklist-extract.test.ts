import { describe, it, expect } from "vitest";
import { htmlChecklistsToTaskLists } from "../server/utils/docxToTaskList";

describe("htmlChecklistsToTaskLists", () => {
  it("leaves non-checklist content unchanged", () => {
    const input = "<h2>Heading</h2><p>Plain paragraph</p>";
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toBe(input);
  });

  it("converts a checklist table into a taskList block", () => {
    const input = `
      <table>
        <tr><td>☐</td><td>Informed Consent unterschrieben</td><td>Anhang B</td><td>Klinik</td></tr>
        <tr><td>☐</td><td>Serologie-Resultate vorhanden</td><td>Viollier</td><td>Klinik</td></tr>
      </table>
    `;
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain('<ul data-type="taskList">');
    expect(output).toContain('data-checked="false"');
    expect(output).toContain("Informed Consent unterschrieben");
    expect(output).toContain("<em>— Anhang B — Klinik</em>");
    expect(output).not.toContain("<table>");
  });

  it("treats checked glyphs as data-checked='true'", () => {
    const input = `<table><tr><td>☑</td><td>Already done</td></tr></table>`;
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain('data-checked="true"');
    expect(output).toContain("Already done");
  });

  it("breaks the taskList into segments when a non-checkbox row is a section heading", () => {
    const input = `
      <table>
        <tr><td>☐</td><td>Item A</td></tr>
        <tr><td>OP-TAG — Im Operationssaal</td><td></td></tr>
        <tr><td>☐</td><td>Item B</td></tr>
      </table>
    `;
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain("<h3>OP-TAG — Im Operationssaal</h3>");
    const taskListMatches = output.match(/<ul data-type="taskList">/g) || [];
    expect(taskListMatches.length).toBe(2);
  });

  it("skips table header rows marked with <th>", () => {
    const input = `
      <table>
        <tr><th>✓</th><th>Aufgabe</th></tr>
        <tr><td>☐</td><td>Real item</td></tr>
      </table>
    `;
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain("Real item");
    expect(output).not.toContain("Aufgabe");
  });

  it("converts consecutive ☐-prefixed paragraphs into one taskList", () => {
    const input = `
      <p>☐ First task</p>
      <p>☐ Second task</p>
      <p>Not a task</p>
      <p>☐ Third task</p>
    `;
    const output = htmlChecklistsToTaskLists(input);
    const taskListCount = (output.match(/<ul data-type="taskList">/g) || []).length;
    expect(taskListCount).toBe(2);
    expect(output).toContain("First task");
    expect(output).toContain("Second task");
    expect(output).toContain("Third task");
    expect(output).toContain("<p>Not a task</p>");
  });

  it("recognises markdown-style [ ] and - [ ] prefixes", () => {
    const input = `<p>[ ] Bracket task</p><p>- [x] Dash bracket task</p>`;
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain('data-checked="false"');
    expect(output).toContain('data-checked="true"');
    expect(output).toContain("Bracket task");
    expect(output).toContain("Dash bracket task");
  });

  it("returns the input untouched when no checkbox patterns are present", () => {
    const input = "<table><tr><td>A</td><td>B</td></tr></table>";
    const output = htmlChecklistsToTaskLists(input);
    expect(output).toContain("<table>");
    expect(output).not.toContain("taskList");
  });
});
