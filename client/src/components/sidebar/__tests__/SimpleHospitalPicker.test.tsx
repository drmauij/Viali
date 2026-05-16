// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimpleHospitalPicker } from "../SimpleHospitalPicker";
import type { SidebarHospital } from "../RoleModuleSidebar";

// SimpleHospitalPicker doesn't use SidebarProvider, but we stub matchMedia for
// any transitive hook that might call it.
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

const baseFields = {
  addonSurgery: true,
  addonClinic: true,
  addonQuestionnaire: false,
  addonWorktime: false,
  addonLogistics: false,
  questionnaireToken: null,
  questionnaireAlias: null,
  externalSurgeryToken: null,
  bookingToken: null,
  isDefaultLogin: false,
  isPlatformOperator: false,
};

// Two distinct hospitals, each with multiple unit-role entries
const hospitals: SidebarHospital[] = [
  {
    ...baseFields,
    id: "h1",
    name: "Alpha Clinic",
    unitId: "h1-anes",
    unitName: "Anesthesia",
    unitType: "anesthesia",
    role: "admin",
  },
  {
    ...baseFields,
    id: "h1",
    name: "Alpha Clinic",
    unitId: "h1-clinic",
    unitName: "Clinic",
    unitType: "clinic",
    role: "doctor",
  },
  {
    ...baseFields,
    id: "h2",
    name: "Beta Hospital",
    unitId: "h2-or",
    unitName: "OR",
    unitType: "or",
    role: "admin",
  },
];

const activeHospital = hospitals[0];

describe("SimpleHospitalPicker", () => {
  it("renders one section per distinct hospital", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("hospital-section-h1")).toBeInTheDocument();
    expect(screen.getByTestId("hospital-section-h2")).toBeInTheDocument();
  });

  it("each section contains one row per unit-role, no module rows", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={vi.fn()}
      />,
    );
    // h1 should have two unit-role rows
    expect(screen.getByTestId("unit-role-row-h1-anes-admin")).toBeInTheDocument();
    expect(screen.getByTestId("unit-role-row-h1-clinic-doctor")).toBeInTheDocument();
    // h2 should have one unit-role row
    expect(screen.getByTestId("unit-role-row-h2-or-admin")).toBeInTheDocument();
    // No module-level rows like "Anesthesia Records" or "Inventory"
    expect(screen.queryByText("Anesthesia Records")).not.toBeInTheDocument();
    expect(screen.queryByText("Inventory & Services")).not.toBeInTheDocument();
  });

  it("clicking a row calls onSelect with the hospital and a route string", () => {
    const onSelect = vi.fn();
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("unit-role-row-h2-or-admin"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [calledHospital, calledRoute] = onSelect.mock.calls[0];
    expect(calledHospital.id).toBe("h2");
    expect(calledHospital.unitId).toBe("h2-or");
    expect(typeof calledRoute).toBe("string");
    expect(calledRoute.length).toBeGreaterThan(0);
  });

  it("rows display unitName · role text", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Anesthesia · admin")).toBeInTheDocument();
    expect(screen.getByText("Clinic · doctor")).toBeInTheDocument();
    expect(screen.getByText("OR · admin")).toBeInTheDocument();
  });
});
