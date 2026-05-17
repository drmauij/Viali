// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SimpleHospitalPicker } from "../SimpleHospitalPicker";
import type { SidebarHospital } from "../buildRows";

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

const hospitals: SidebarHospital[] = [
  // Hospital h1 with three unit/role entries — Clinics tab should still render ONE row.
  { ...baseFields, id: "h1", name: "Alpha Clinic", unitId: "h1-anes", unitName: "Anesthesia", unitType: "anesthesia", role: "admin" },
  { ...baseFields, id: "h1", name: "Alpha Clinic", unitId: "h1-clinic", unitName: "Clinic", unitType: "clinic", role: "doctor" },
  { ...baseFields, id: "h1", name: "Alpha Clinic", unitId: "h1-or", unitName: "OR", unitType: "or", role: "doctor" },
  { ...baseFields, id: "h2", name: "Beta Hospital", unitId: "h2-or", unitName: "OR", unitType: "or", role: "admin" },
];

const activeHospital = hospitals[0];

describe("SimpleHospitalPicker", () => {
  it("renders one row per distinct hospital, no unit-role detail", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("hospital-row-h1")).toBeInTheDocument();
    expect(screen.getByTestId("hospital-row-h2")).toBeInTheDocument();
    // No per-unit-role rows
    expect(screen.queryByText("Anesthesia · admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Clinic · doctor")).not.toBeInTheDocument();
    expect(screen.queryByText("OR · admin")).not.toBeInTheDocument();
  });

  it("rows display only the hospital name", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Alpha Clinic")).toBeInTheDocument();
    expect(screen.getByText("Beta Hospital")).toBeInTheDocument();
  });

  it("clicking a row calls onSelect with the highest-privilege entry for that hospital", () => {
    const onSelect = vi.fn();
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={activeHospital}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("hospital-row-h1"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const [calledHospital, calledRoute] = onSelect.mock.calls[0];
    expect(calledHospital.id).toBe("h1");
    // h1 has roles: admin (anes), doctor (clinic), doctor (or). Highest priv = admin.
    expect(calledHospital.role).toBe("admin");
    expect(typeof calledRoute).toBe("string");
    expect(calledRoute.length).toBeGreaterThan(0);
  });

  it("active hospital row is visually highlighted", () => {
    render(
      <SimpleHospitalPicker
        hospitals={hospitals}
        activeHospital={hospitals[3]} // h2
        onSelect={vi.fn()}
      />,
    );
    const activeRow = screen.getByTestId("hospital-row-h2");
    expect(activeRow.className).toMatch(/bg-accent/);
  });
});
