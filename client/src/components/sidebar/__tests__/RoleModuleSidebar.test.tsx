// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { RoleModuleSidebar, orderGroups } from "../RoleModuleSidebar";

// SidebarProvider uses use-mobile which calls window.matchMedia — stub it for jsdom.
beforeEach(() => {
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
});

const sampleHospitals = [
  { id: "h1", name: "Viali Demo", unitId: "u-anes", unitName: "Anesthesia", unitType: "anesthesia", role: "admin",
    addonSurgery: true, addonClinic: true, addonQuestionnaire: true, addonWorktime: true, addonLogistics: false,
    questionnaireToken: "qtok", questionnaireAlias: null, externalSurgeryToken: "estok", bookingToken: "btok",
    isDefaultLogin: false, isPlatformOperator: false },
  { id: "h1", name: "Viali Demo", unitId: "u-clinic", unitName: "Clinic", unitType: "clinic", role: "admin",
    addonSurgery: true, addonClinic: true, addonQuestionnaire: true, addonWorktime: true, addonLogistics: false,
    questionnaireToken: "qtok", questionnaireAlias: null, externalSurgeryToken: "estok", bookingToken: "btok",
    isDefaultLogin: true, isPlatformOperator: false },
  { id: "h1", name: "Viali Demo", unitId: "u-or", unitName: "Operating Room", unitType: "or", role: "admin",
    addonSurgery: true, addonClinic: true, addonQuestionnaire: true, addonWorktime: true, addonLogistics: false,
    questionnaireToken: "qtok", questionnaireAlias: null, externalSurgeryToken: "estok", bookingToken: "btok",
    isDefaultLogin: false, isPlatformOperator: false },
] as const;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("orderGroups", () => {
  it("puts the active hospital first", () => {
    const ordered = orderGroups([...sampleHospitals], sampleHospitals[2]);
    expect(ordered[0].unitId).toBe("u-or");
  });

  it("then default-login, then alphabetical by unit name", () => {
    const ordered = orderGroups([...sampleHospitals], sampleHospitals[2]);
    expect(ordered.map(o => o.unitId)).toEqual(["u-or", "u-clinic", "u-anes"]);
  });
});

describe("RoleModuleSidebar persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1400, writable: true });
  });

  it("starts in full state on wide viewports when no preference saved", () => {
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={vi.fn()}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("sidebar-state").textContent).toBe("full");
  });

  it("starts in icon-rail state on medium viewports", () => {
    Object.defineProperty(window, "innerWidth", { value: 1000, writable: true });
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={vi.fn()}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("sidebar-state").textContent).toBe("rail");
  });

  it("starts hidden on narrow viewports", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={vi.fn()}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("sidebar-state").textContent).toBe("hidden");
  });

  it("restores the persisted state regardless of viewport", () => {
    localStorage.setItem("sidebarState", "rail");
    Object.defineProperty(window, "innerWidth", { value: 1400, writable: true });
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={vi.fn()}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId("sidebar-state").textContent).toBe("rail");
  });

  it("persists state changes to localStorage", () => {
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={vi.fn()}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByLabelText(/collapse sidebar/i));
    expect(localStorage.getItem("sidebarState")).toBe("rail");
  });
});

describe("RoleModuleSidebar navigation", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { value: 1400, writable: true });
  });

  it("invokes onNavigate(hospital, route) when a module row is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <RoleModuleSidebar
        hospitals={[...sampleHospitals]}
        activeHospital={sampleHospitals[0]}
        activeRoute="/anesthesia/op"
        onNavigate={onNavigate}
        onSwitchHospital={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    const group = screen.getByText(/Operating Room · admin/i).closest("[data-role-group]")!;
    const btn = within(group as HTMLElement).getByRole("button", { name: /^Surgery$/i });
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith(sampleHospitals[2], expect.stringContaining("/surgery"));
  });
});
