// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarIconRail, type RailGroup } from "../SidebarIconRail";

const activeHospital = {
  id: "h1",
  name: "Viali Demo",
  unitId: "u1",
  unitName: "Anesthesia",
  unitType: "anesthesia" as const,
  role: "admin",
};

const groups: RailGroup[] = [
  {
    hospital: activeHospital,
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
        activeHospital={activeHospital}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    // 1 hospital avatar + 3 module icons + 1 expand button = 5
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("applies the anesthesia tag class to anesthesia rows", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        activeHospital={activeHospital}
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
        activeHospital={activeHospital}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    // 1 avatar separator + 1 between-groups separator = 2
    expect(container.querySelectorAll("[data-rail-separator]")).toHaveLength(2);
  });

  it("marks the active icon", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        activeHospital={activeHospital}
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
        activeHospital={activeHospital}
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
        activeHospital={activeHospital}
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
        activeHospital={activeHospital}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /Questionnaire/i })).toBeInTheDocument();
  });

  it("renders the hospital avatar at the top with hospital name initials", () => {
    render(
      <SidebarIconRail
        groups={groups}
        quickLinkIcons={[]}
        activeRoute="/anesthesia/op"
        activeHospital={activeHospital}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    // Avatar button shows first two letters of hospital name
    expect(screen.getByRole("button", { name: "Viali Demo" })).toBeInTheDocument();
    expect(screen.getByText("VI")).toBeInTheDocument();
  });
});
