// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { computeDomPath } from "@/lib/htmlEditScope";

describe("computeDomPath", () => {
  it("returns the index path of an element relative to a root", () => {
    const root = document.createElement("body");
    root.innerHTML = `
      <div>
        <p>first</p>
        <p>second</p>
        <ul>
          <li>a</li>
          <li id="target">b</li>
        </ul>
      </div>
    `;
    const target = root.querySelector("#target")!;
    expect(computeDomPath(target, root)).toEqual([0, 2, 1]);
  });

  it("returns [] for the root itself", () => {
    const root = document.createElement("body");
    root.innerHTML = "<p>x</p>";
    expect(computeDomPath(root, root)).toEqual([]);
  });

  it("ignores text nodes (only counts element children)", () => {
    const root = document.createElement("body");
    root.innerHTML = "<p>a</p>   <p>b</p>   <p id=\"t\">c</p>";
    const target = root.querySelector("#t")!;
    expect(computeDomPath(target, root)).toEqual([2]);
  });
});
