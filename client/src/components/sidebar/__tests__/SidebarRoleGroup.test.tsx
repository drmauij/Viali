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

const primary: ModuleRow = {
  id: "anesthesia",
  label: "Anesthesia Records",
  route: "/anesthesia/op",
};

const secondaryRows: ModuleRow[] = [
  { id: "inventory",  label: "Inventory & Services", route: "/inventory/items" },
  { id: "administration", label: "Administration", route: "/admin" },
  { id: "worklogs-anesthesia", label: "Worklogs", route: "/anesthesia/worklogs", badge: 3 },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("SidebarRoleGroup", () => {
  it("renders the unit name + role in the card header", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/^Anesthesia$/i)).toBeInTheDocument();
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
  });

  it("omits the primary row from the secondary list (card subsumes it)", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByRole("button", { name: /Anesthesia Records/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inventory & Services/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Administration$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Worklogs/i })).toBeInTheDocument();
  });

  it("marks the card itself as active when on the primary route", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("unit-card")).toHaveAttribute("data-active", "true");
  });

  it("clicking the card surface fires onSelect with the primary row", () => {
    const onSelect = vi.fn();
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/inventory/items"
        isActiveGroup={true}
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("unit-card"));
    expect(onSelect).toHaveBeenCalledWith(baseHospital, primary);
  });

  it("clicking a secondary row does not also fire the card's primary action", () => {
    const onSelect = vi.fn();
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByRole("button", { name: /Inventory & Services/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(baseHospital, secondaryRows[0]);
  });

  it("shows the badge count on rows that carry one", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not mark the card active when isActiveGroup is false (different clinic on same route)", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={false}
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("unit-card")).not.toHaveAttribute("data-active");
  });

  it("omits the header (no card) when single role mode is true", () => {
    render(
      <SidebarRoleGroup
        hospital={baseHospital}
        primary={primary}
        rows={secondaryRows}
        activeRoute="/anesthesia/op"
        isActiveGroup={true}
        onSelect={vi.fn()}
        singleRoleMode
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByTestId("unit-card")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Anesthesia$/i)).not.toBeInTheDocument();
  });
});
