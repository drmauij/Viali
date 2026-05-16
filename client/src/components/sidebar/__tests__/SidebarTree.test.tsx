// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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
  it("renders one group per hospital entry", () => {
    render(
      <SidebarTree
        hospitals={hospitals}
        activeHospital={hospitals[0]}
        activeRoute="/anesthesia/op"
        onSelect={vi.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Anesthesia · admin/i)).toBeInTheDocument();
    expect(screen.getByText(/Clinic · admin/i)).toBeInTheDocument();
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
});
