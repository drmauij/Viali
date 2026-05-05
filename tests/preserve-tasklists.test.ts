import { describe, it, expect } from "vitest";
import { preserveTaskListsFromTemplate } from "../server/utils/preserveTaskLists";

const taskList = (items: string[]) =>
  `<ul data-type="taskList">${items
    .map(
      (txt) =>
        `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${txt}</p></div></li>`,
    )
    .join("")}</ul>`;

describe("preserveTaskListsFromTemplate", () => {
  it("returns output unchanged when template has no task-lists", () => {
    const tpl = "<p>Plain template</p>";
    const out = "<p>Plain template with patient data</p>";
    expect(preserveTaskListsFromTemplate(tpl, out)).toBe(out);
  });

  it("returns output unchanged when AI preserved both blocks and items", () => {
    const tpl = `<h3>Phase 1</h3>${taskList(["A", "B"])}`;
    const out = `<h3>Phase 1</h3>${taskList(["A", "B"])}`;
    expect(preserveTaskListsFromTemplate(tpl, out)).toBe(out);
  });

  it("restores task-list when AI dropped items", () => {
    const tpl = `<h3>Phase 1</h3>${taskList(["A", "B", "C"])}`;
    const out = `<h3>Phase 1</h3>${taskList(["A"])}`; // AI lost B, C
    const restored = preserveTaskListsFromTemplate(tpl, out);
    expect(restored).toContain(">A</p>");
    expect(restored).toContain(">B</p>");
    expect(restored).toContain(">C</p>");
  });

  it("restores when AI dropped a whole task-list block", () => {
    const tpl = `${taskList(["A", "B"])}<h3>Phase 2</h3>${taskList(["C", "D"])}`;
    const out = `${taskList(["A", "B"])}<h3>Phase 2</h3>`; // AI dropped second list
    const restored = preserveTaskListsFromTemplate(tpl, out);
    const blocks = restored.match(/<ul data-type="taskList">/g);
    expect(blocks?.length).toBe(2);
    expect(restored).toContain(">C</p>");
    expect(restored).toContain(">D</p>");
  });

  it("preserves the AI's filled-in patient data outside task-lists", () => {
    const tpl = `<table><tr><td><strong>Name</strong></td><td></td></tr></table>${taskList(["Step 1"])}`;
    const out = `<table><tr><td><strong>Name</strong></td><td>John Doe</td></tr></table>${taskList(["Step 1"])}`;
    expect(preserveTaskListsFromTemplate(tpl, out)).toContain("John Doe");
  });

  it("uses positional substitution (Nth output list = Nth template list)", () => {
    const tpl = `${taskList(["a1", "a2"])}<h3>X</h3>${taskList(["b1", "b2"])}`;
    // AI rewrote both lists with garbage; restore from template positions
    const garbledTaskList = taskList(["GARBLED_1", "GARBLED_2"]);
    const out = `${garbledTaskList}<h3>X</h3>${garbledTaskList}`;
    const restored = preserveTaskListsFromTemplate(tpl, out);
    expect(restored).not.toContain("GARBLED_1");
    expect(restored).toContain(">a1</p>");
    expect(restored).toContain(">a2</p>");
    expect(restored).toContain(">b1</p>");
    expect(restored).toContain(">b2</p>");
  });
});
