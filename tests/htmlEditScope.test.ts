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

import { markElementByPath } from "@/lib/htmlEditScope";

describe("markElementByPath", () => {
  const html = `<!DOCTYPE html><html><head><title>t</title></head><body><div><p>one</p><p>two</p></div></body></html>`;

  it("injects a data-vai-marker attribute and returns the marked element", () => {
    const out = markElementByPath(html, [0, 1])!;
    expect(out.markerId).toMatch(/^[a-z0-9]+$/);
    expect(out.snippet).toMatch(/^<p [^>]*data-vai-marker="[^"]+"[^>]*>two<\/p>$/);
    expect(out.markedHtml).toContain(`data-vai-marker="${out.markerId}"`);
    // The other paragraph stays untouched.
    expect(out.markedHtml).toMatch(/<p>one<\/p>/);
  });

  it("returns null for an invalid path", () => {
    expect(markElementByPath(html, [99])).toBeNull();
    expect(markElementByPath(html, [0, 99])).toBeNull();
    expect(markElementByPath(html, [])).toBeNull();
  });

  it("walks tbody auto-inserted by the parser", () => {
    // Mirror what browsers do: <table><tr> auto-inserts a <tbody>.
    const tableHtml = `<!DOCTYPE html><html><body><table><tr><td>x</td></tr></table></body></html>`;
    // body > table > tbody > tr > td
    const out = markElementByPath(tableHtml, [0, 0, 0, 0])!;
    expect(out.snippet).toMatch(/^<td [^>]*data-vai-marker=/);
  });
});

import { replaceMarkedElement } from "@/lib/htmlEditScope";

describe("replaceMarkedElement", () => {
  it("replaces the marked element with the given replacement HTML", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p>one</p><p data-vai-marker="abc123">old</p><p>three</p></body></html>`;
    const out = replaceMarkedElement(markedHtml, "abc123", `<p>NEW</p>`);
    expect(out).toContain("<p>one</p>");
    expect(out).toContain("<p>NEW</p>");
    expect(out).toContain("<p>three</p>");
    expect(out).not.toContain("old");
    expect(out).not.toContain("abc123");
  });

  it("strips markdown fences from the replacement", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p data-vai-marker="m1">old</p></body></html>`;
    const fenced = "```html\n<p>NEW</p>\n```";
    const out = replaceMarkedElement(markedHtml, "m1", fenced);
    expect(out).toContain("<p>NEW</p>");
    expect(out).not.toContain("```");
  });

  it("returns the original markedHtml unchanged if the marker is not found", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p>one</p></body></html>`;
    expect(replaceMarkedElement(markedHtml, "missing", "<p>x</p>")).toBe(markedHtml);
  });

  it("throws on a multi-root replacement (caller should toast and revert)", () => {
    const markedHtml = `<!DOCTYPE html><html><body><p data-vai-marker="m1">old</p></body></html>`;
    expect(() =>
      replaceMarkedElement(markedHtml, "m1", "<p>a</p><p>b</p>"),
    ).toThrow(/single root/);
  });
});

import { stripMarkers, extractHeadContent } from "@/lib/htmlEditScope";

describe("stripMarkers", () => {
  it("removes data-vai-marker attributes from any tag", () => {
    const html = `<p data-vai-marker="a1">one</p><div data-vai-marker='b2'>two</div>`;
    const out = stripMarkers(html);
    expect(out).not.toContain("data-vai-marker");
    expect(out).toContain("<p>one</p>");
    expect(out).toContain("<div>two</div>");
  });

  it("leaves HTML without markers untouched", () => {
    const html = `<p class="x">y</p>`;
    expect(stripMarkers(html)).toBe(html);
  });
});

describe("extractHeadContent", () => {
  it("returns the inner of <head>", () => {
    const html = `<!DOCTYPE html><html><head><style>body{color:red}</style><title>x</title></head><body>z</body></html>`;
    const head = extractHeadContent(html);
    expect(head).toContain("<style>body{color:red}</style>");
    expect(head).toContain("<title>x</title>");
    expect(head).not.toContain("<body>");
  });

  it("returns an empty string when there is no <head>", () => {
    expect(extractHeadContent("<p>hi</p>")).toBe("");
  });

  it("trims to a max byte length", () => {
    const big = "x".repeat(10000);
    const html = `<html><head><style>${big}</style></head><body></body></html>`;
    expect(extractHeadContent(html).length).toBeLessThanOrEqual(3000);
  });
});
