// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarTree } from "../SidebarTree";

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

const hospitals = [
  {
    id: "h1",
    name: "Viali Demo",
    unitId: "u-a",
    unitName: "Anesthesia",
    unitType: "anesthesia" as const,
    role: "admin",
    addonSurgery: true,
    addonClinic: true,
    addonQuestionnaire: true,
    addonWorktime: false,
    addonLogistics: false,
    questionnaireToken: "qtok",
    externalSurgeryToken: null,
    bookingToken: null,
    isDefaultLogin: true,
  },
  {
    id: "h1",
    name: "Viali Demo",
    unitId: "u-c",
    unitName: "Clinic",
    unitType: "clinic" as const,
    role: "admin",
    addonSurgery: true,
    addonClinic: true,
    addonQuestionnaire: true,
    addonWorktime: false,
    addonLogistics: false,
    questionnaireToken: "qtok",
    externalSurgeryToken: null,
    bookingToken: null,
    isDefaultLogin: false,
  },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  return <SidebarProvider>{children}</SidebarProvider>;
}

describe("SidebarTree", () => {
  it("renders one card per (hospital, unit) entry", () => {
    render(
      <SidebarTree
        hospitals={hospitals}
        activeHospital={hospitals[0]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getAllByTestId("unit-card")).toHaveLength(2);
    expect(screen.getByText(/^Anesthesia$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Clinic$/i)).toBeInTheDocument();
  });

  it("omits Quick Links when showQuickLinks is false", () => {
    render(
      <SidebarTree
        hospitals={hospitals}
        activeHospital={hospitals[0]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
        showQuickLinks={false}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText(/quick links/i)).not.toBeInTheDocument();
  });

  it("merges two roles on the same unit into one section with a clickable role chip strip", () => {
    const dualRole = [
      { ...hospitals[0], role: "doctor", isDefaultLogin: false },
      { ...hospitals[0], role: "admin", isDefaultLogin: true },
    ];
    render(
      <SidebarTree
        hospitals={dualRole}
        activeHospital={dualRole[1]} /* admin is active */
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    // Header drops the inline "· role" suffix when merged.
    expect(screen.getByText(/^Anesthesia$/i)).toBeInTheDocument();
    expect(screen.queryByText(/Anesthesia · admin/i)).not.toBeInTheDocument();
    // Chip strip is rendered with both roles as buttons, admin selected.
    expect(screen.getByTestId("role-chip-admin")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("role-chip-doctor")).not.toHaveAttribute("data-selected");
    // While admin is the selected slice, Administration row is visible.
    expect(screen.getByRole("button", { name: /^Administration$/i })).toBeInTheDocument();
    // Primary module ("Anesthesia Records") is subsumed by the card surface,
    // not rendered as a row button anymore.
    expect(screen.queryByRole("button", { name: /Anesthesia Records/i })).not.toBeInTheDocument();
  });

  it("clicking a chip switches into that role on the same route when possible", async () => {
    const dualRole = [
      { ...hospitals[0], role: "doctor", isDefaultLogin: false },
      { ...hospitals[0], role: "admin", isDefaultLogin: true },
    ];
    const onSelect = vi.fn();
    render(
      <SidebarTree
        hospitals={dualRole}
        activeHospital={dualRole[1]} /* admin active */
        activeRoute="/anesthesia/op"
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("role-chip-doctor"));
    // Hands back the doctor hospital row with the same /anesthesia/op route
    // (doctor still has access to anesthesia records).
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [host, route] = onSelect.mock.calls[0];
    expect(host.role).toBe("doctor");
    expect(route).toBe("/anesthesia/op");
  });

  it("clicking the already-selected chip is a no-op", async () => {
    const dualRole = [
      { ...hospitals[0], role: "doctor", isDefaultLogin: false },
      { ...hospitals[0], role: "admin", isDefaultLogin: true },
    ];
    const onSelect = vi.fn();
    render(
      <SidebarTree
        hospitals={dualRole}
        activeHospital={dualRole[1]}
        activeRoute="/anesthesia/op"
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("role-chip-admin"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("switching to a role that can't reach the current route falls back to that role's first row", async () => {
    const dualRole = [
      { ...hospitals[0], role: "doctor", isDefaultLogin: false },
      { ...hospitals[0], role: "admin", isDefaultLogin: true },
    ];
    const onSelect = vi.fn();
    render(
      <SidebarTree
        hospitals={dualRole}
        activeHospital={dualRole[1]} /* admin */
        activeRoute="/admin" /* admin-only page */
        onSelect={onSelect}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.click(screen.getByTestId("role-chip-doctor"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [host, route] = onSelect.mock.calls[0];
    expect(host.role).toBe("doctor");
    // Doctor can't reach /admin, so the click falls back to /anesthesia/op
    // (doctor's first row).
    expect(route).toBe("/anesthesia/op");
  });

  it("single-role unit renders the role inline under the unit name (no chip strip)", () => {
    render(
      <SidebarTree
        hospitals={[hospitals[0]]}
        activeHospital={hospitals[0]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/^Anesthesia$/i)).toBeInTheDocument();
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
    expect(screen.queryByTestId("role-subtitle")).not.toBeInTheDocument();
  });
});
