// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarIconRail, type RailGroup } from "../SidebarIconRail";

const groups: RailGroup[] = [
  {
    hospital: { id: "h1", unitId: "u1", unitName: "Anesthesia", unitType: "anesthesia", role: "admin", name: "Viali Demo" },
    icons: [
      { id: "anesthesia", label: "Records", route: "/anesthesia/op" },
      { id: "inventory", label: "Inventory", route: "/anesthesia/inventory" },
    ],
  },
  {
    hospital: { id: "h1", unitId: "u2", unitName: "OR", unitType: "or", role: "admin", name: "Viali Demo" },
    icons: [
      { id: "surgery", label: "Surgery", route: "/surgery/op" },
    ],
  },
];

describe("SidebarIconRail", () => {
  it("renders one button per icon", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(3 + 1); // 3 modules + expand
  });

  it("applies the anesthesia tag class to anesthesia rows", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: /Records/i });
    expect(button.className).toMatch(/rose/);
  });

  it("renders a separator between role groups", () => {
    const { container } = render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(container.querySelectorAll("[data-rail-separator]")).toHaveLength(1);
  });

  it("marks the active icon", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Records/i }).getAttribute("data-active"),
    ).toBe("true");
  });

  it("calls onSelect with hospital + icon when clicked", () => {
    const onSelect = vi.fn();
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={onSelect}
        onExpand={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Surgery/i }));
    expect(onSelect).toHaveBeenCalledWith(groups[1].hospital, groups[1].icons[0]);
  });

  it("calls onExpand when the bottom chevron is clicked", () => {
    const onExpand = vi.fn();
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /expand sidebar/i }));
    expect(onExpand).toHaveBeenCalled();
  });

  it("renders quick-link icons in a pinned bottom section", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[
          { id: "questionnaire", label: "Questionnaire", url: "https://example.test/q/x" },
        ]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Questionnaire/i })).toBeInTheDocument();
  });
});
