// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarRoleGroup, type ModuleRow } from "../SidebarRoleGroup";

// SidebarProvider uses use-mobile which calls window.matchMedia — stub it for jsdom.
beforeAll(() => {
  if (typeof window.matchMedia === "undefined") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

const baseHospital = {
  id: "h1",
  name: "Viali Demo",
  unitId: "u1",
  unitName: "Anesthesia",
  unitType: "anesthesia" as const,
  role: "admin",
};

const rows: ModuleRow[] = [
  { id: "anesthesia", label: "Anesthesia Records", route: "/anesthesia/op" },
  { id: "inventory",  label: "Inventory & Services", route: "/inventory/items" },
  { id: "administration", label: "Administration", route: "/admin" },
  { id: "worklogs-anesthesia", label: "Worklogs", route: "/anesthesia/worklogs", badge: 3 },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("SidebarRoleGroup", () => {
  it("renders the group header with unit + role", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Anesthesia · admin/i)).toBeInTheDocument();
  });

  it("renders one row per module", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("button", { name: /Anesthesia Records/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inventory & Services/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Administration$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Worklogs/i })).toBeInTheDocument();
  });

  it("marks the row matching activeRoute as active", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    const active = screen.getByRole("button", { name: /Anesthesia Records/i });
    expect(active).toHaveAttribute("data-active", "true");
  });

  it("shows the badge count on rows that carry one", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onSelect with the hospital + row when a row is clicked", () => {
    const onSelect = vi.fn();
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: /Inventory & Services/i }));
    expect(onSelect).toHaveBeenCalledWith(baseHospital, rows[1]);
  });

  it("does not mark the row active when isActiveGroup is false", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={false}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    const row = screen.getByRole("button", { name: /Anesthesia Records/i });
    expect(row).not.toHaveAttribute("data-active", "true");
  });

  it("omits the header when single role mode is true", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        rows={rows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
        singleRoleMode
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText(/Anesthesia · admin/i)).not.toBeInTheDocument();
  });
});
