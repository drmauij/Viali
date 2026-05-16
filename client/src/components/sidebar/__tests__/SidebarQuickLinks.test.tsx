// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SidebarQuickLinks } from "../SidebarQuickLinks";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const hospital = {
  id: "h1",
  questionnaireToken: "qtok",
  questionnaireAlias: null,
  externalSurgeryToken: "estok",
  bookingToken: "btok",
};

const baseAddons = { questionnaire: true };

describe("SidebarQuickLinks", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { origin: "https://example.test" },
      writable: true,
    });
  });

  it("renders one row per configured token", () => {
    render(
      <SidebarQuickLinks
        hospital={hospital}
        addons={baseAddons}
        hasMedicalAccess={true}
      />,
    );
    expect(screen.getByText(/clinic questionnaire/i)).toBeInTheDocument();
    expect(screen.getByText(/External Surgery Reservation/i)).toBeInTheDocument();
    expect(screen.getByText(/Online-Terminbuchung/i)).toBeInTheDocument();
  });

  it("hides Questionnaire row when questionnaire addon disabled", () => {
    render(
      <SidebarQuickLinks
        hospital={hospital}
        addons={{ questionnaire: false }}
        hasMedicalAccess={true}
      />,
    );
    expect(screen.queryByText(/clinic questionnaire/i)).not.toBeInTheDocument();
  });

  it("hides External Surgery row when user has no medical access", () => {
    render(
      <SidebarQuickLinks
        hospital={hospital}
        addons={baseAddons}
        hasMedicalAccess={false}
      />,
    );
    expect(screen.queryByText(/External Surgery Reservation/i)).not.toBeInTheDocument();
  });

  it("hides the whole section when no tokens are configured", () => {
    const { container } = render(
      <SidebarQuickLinks
        hospital={{ id: "h2", questionnaireToken: null, externalSurgeryToken: null, bookingToken: null }}
        addons={baseAddons}
        hasMedicalAccess={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders QR-poster button only for the booking row", () => {
    render(
      <SidebarQuickLinks
        hospital={hospital}
        addons={baseAddons}
        hasMedicalAccess={true}
      />,
    );
    const posterButtons = screen.getAllByLabelText(/download qr poster/i);
    expect(posterButtons).toHaveLength(1);
  });

  it("copies the link to clipboard when the copy button is clicked", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <SidebarQuickLinks
        hospital={hospital}
        addons={baseAddons}
        hasMedicalAccess={true}
      />,
    );
    const copyButtons = screen.getAllByLabelText(/copy link/i);
    fireEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith(
      "https://example.test/questionnaire/hospital/qtok",
    );
  });

  it("uses the questionnaireAlias when present", () => {
    render(
      <SidebarQuickLinks
        hospital={{ ...hospital, questionnaireAlias: "viali-demo" }}
        addons={baseAddons}
        hasMedicalAccess={true}
      />,
    );
    const link = screen.getByRole("link", { name: /clinic questionnaire/i });
    expect(link).toHaveAttribute("href", "https://example.test/q/viali-demo");
  });
});
