// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  SurgeryRequestForm,
  ProgressHeader,
  type ProgressState,
} from "../client/src/components/surgery/SurgeryRequestForm";
import { makeQueryWrapper } from "./test-utils";

const t = (key: string) => key;

const baseProps = {
  availableSurgeons: [{ id: "u1", firstName: "Roman", lastName: "Skoblo" }],
  selectedSurgeonId: "u1",
  onSelectedSurgeonIdChange: () => {},
  showSurgeonPicker: false,
  showSurgeonDetailsBlock: false,
  t,
  locale: "de" as const,
  onSubmit: () => {},
  isSubmitting: false,
};

function openSurgerySection(container: HTMLElement) {
  const surgeonContinue = container.querySelector(
    '[data-testid="button-continue-surgeon"]',
  ) as HTMLButtonElement;
  if (!surgeonContinue) {
    throw new Error("expected button-continue-surgeon to exist");
  }
  fireEvent.click(surgeonContinue);
}

describe("SurgeryRequestForm — surgeon summary card", () => {
  it("renders the surgeon summary card when picker is hidden and currentSurgeon is provided", () => {
    render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "Roman",
          lastName: "Skoblo",
          email: "roman@example.com",
          phone: "+41 79 123 45 67",
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    expect(screen.getByText(/Roman Skoblo/)).toBeTruthy();
    expect(screen.getByText(/roman@example.com/)).toBeTruthy();
    expect(screen.getByText(/\+41 79 123 45 67/)).toBeTruthy();
    expect(screen.getByText(/surgeonCard.submittingAs/)).toBeTruthy();
  });

  it("does not render the summary card when the picker is visible", () => {
    render(
      <SurgeryRequestForm
        {...baseProps}
        showSurgeonPicker={true}
        currentSurgeon={{
          firstName: "Roman",
          lastName: "Skoblo",
          email: "roman@example.com",
          phone: "+41 79 123 45 67",
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    expect(screen.queryByText(/surgeonCard.submittingAs/)).toBeNull();
  });
});

describe("SurgeryRequestForm — reservation toggle placement", () => {
  it("renders the reservation switch inside the surgery (step 2) section, not the surgeon section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "R",
          lastName: "S",
          email: "r@example.com",
          phone: "+41 79 000 00 00",
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const toggle = container.querySelector('[data-testid="switch-reservation-only"]');
    expect(toggle).not.toBeNull();
    const ancestorSection = toggle?.closest('[data-section]')?.getAttribute("data-section");
    expect(ancestorSection).toBe("surgery");
  });
});

describe("SurgeryRequestForm — section 2 sub-groups", () => {
  it("renders three labeled groups inside the surgery section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{
          firstName: "R",
          lastName: "S",
          email: "r@example.com",
          phone: null,
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const surgery = container.querySelector('[data-section="surgery"]');
    expect(surgery).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="schedule"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="procedure"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="coverage"]')).not.toBeNull();
  });
});

describe("SurgeryRequestForm — inline validation", () => {
  it("shows 'Required' on the duration field after blur when invalid, clears once filled", async () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);

    const durationInput = container.querySelector('[data-testid="input-surgery-duration"]') as HTMLInputElement;
    expect(durationInput).not.toBeNull();

    // Set invalid value (below min of 5), blur, expect error
    await act(async () => {
      fireEvent.change(durationInput, { target: { value: "4" } });
      fireEvent.blur(durationInput);
    });
    expect(durationInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText(/validation.required/).length).toBeGreaterThan(0);

    // Type a valid value → error clears
    await act(async () => {
      fireEvent.change(durationInput, { target: { value: "60" } });
    });
    expect(durationInput.getAttribute("aria-invalid")).not.toBe("true");
  });

  it("marks wishedDate touched on blur and renders the error helper when empty", async () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const dateButton = container.querySelector('[data-testid="input-wished-date"]') as HTMLElement;
    expect(dateButton).not.toBeNull();
    await act(async () => {
      fireEvent.blur(dateButton);
    });
    expect(dateButton.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("SurgeryRequestForm — CHOP picker cleanup", () => {
  it("defaults to combobox mode and toggles to custom-text input on click", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    // Default: combobox visible, plain custom input not visible
    expect(container.querySelector('[data-testid="button-chop-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).toBeNull();

    // Click "Use custom name"
    const link = screen.getByText(/chopSearch.useFreeText/);
    fireEvent.click(link);

    expect(container.querySelector('[data-testid="button-chop-search"]')).toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).not.toBeNull();

    // Click "Back to search" — combobox restored
    const back = screen.getByText(/chopSearch.backToSearch/);
    fireEvent.click(back);
    expect(container.querySelector('[data-testid="button-chop-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="input-surgery-name-custom"]')).toBeNull();
  });
});

describe("SurgeryRequestForm — missing-fields callout", () => {
  it("shows the amber callout listing missing fields when Continue is clicked on an invalid section", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );

    // Click Continue on the surgeon section first to advance to step 2
    const cont1 = container.querySelector('[data-testid="button-continue-surgeon"]') as HTMLButtonElement;
    expect(cont1).not.toBeNull();
    fireEvent.click(cont1);

    // Now click Continue on the surgery section with all required fields empty
    const cont2 = container.querySelector('[data-testid="button-continue-surgery"]') as HTMLButtonElement;
    expect(cont2).not.toBeNull();
    fireEvent.click(cont2);

    // Callout appears, listing missing field labels
    const callout = container.querySelector('[data-testid="missing-fields-callout-surgery"]');
    expect(callout).not.toBeNull();
    expect(callout!.textContent).toContain("missingFields");
  });
});

describe("ProgressHeader (standalone)", () => {
  it("renders 4 dots and a 'Step 1 of 4' label in default mode", () => {
    const { container } = render(
      <ProgressHeader
        visibleSections={["surgeon", "surgery", "patient", "documents"]}
        openSection="surgeon"
        completed={{ surgeon: false, surgery: false, patient: false, documents: false }}
        t={t}
      />,
    );
    const header = container.querySelector('[data-testid="form-progress-header"]');
    expect(header).not.toBeNull();
    expect(header!.querySelectorAll("[data-progress-dot]").length).toBe(4);
    expect(header!.textContent).toContain("progress.stepOfTotal");
    expect(header!.textContent).toContain("accordion.surgeon");
  });

  it("renders 2 dots in reservation-only mode", () => {
    const { container } = render(
      <ProgressHeader
        visibleSections={["surgeon", "surgery"]}
        openSection="surgeon"
        completed={{ surgeon: false, surgery: false, patient: false, documents: false }}
        t={t}
      />,
    );
    expect(container.querySelectorAll("[data-progress-dot]").length).toBe(2);
  });

  it("shows the active section name when openSection changes", () => {
    const { container } = render(
      <ProgressHeader
        visibleSections={["surgeon", "surgery", "patient", "documents"]}
        openSection="surgery"
        completed={{ surgeon: true, surgery: false, patient: false, documents: false }}
        t={t}
      />,
    );
    const header = container.querySelector('[data-testid="form-progress-header"]')!;
    expect(header.textContent).toContain("accordion.surgery");
  });
});

describe("SurgeryRequestForm — onProgressChange callback", () => {
  it("fires with the initial section state on mount", () => {
    const calls: ProgressState[] = [];
    render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        onProgressChange={(s) => calls.push(s)}
      />,
      { wrapper: makeQueryWrapper() },
    );
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last.openSection).toBe("surgeon");
    expect(last.visibleSections).toEqual(["surgeon", "surgery", "patient", "documents"]);
    expect(last.completed.surgeon).toBe(true);
    expect(last.completed.surgery).toBe(false);
  });

  it("fires with reservation-only visibleSections after the toggle is set via initialValues", () => {
    const calls: ProgressState[] = [];
    render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        initialValues={{ isReservationOnly: true }}
        onProgressChange={(s) => calls.push(s)}
      />,
      { wrapper: makeQueryWrapper() },
    );
    const last = calls[calls.length - 1];
    expect(last.visibleSections).toEqual(["surgeon", "surgery"]);
  });

  it("advances openSection in the callback when surgeon Continue is clicked", () => {
    const calls: ProgressState[] = [];
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        onProgressChange={(s) => calls.push(s)}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const last = calls[calls.length - 1];
    expect(last.openSection).toBe("surgery");
  });
});

describe("SurgeryRequestForm — mobile attributes", () => {
  it("sets inputMode='numeric' on the surgery duration field", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const duration = container.querySelector('[data-testid="input-surgery-duration"]') as HTMLInputElement;
    expect(duration).not.toBeNull();
    expect(duration.getAttribute("inputmode")).toBe("numeric");
  });

  it("sets autoComplete + inputMode on patient identity fields after advancing past surgery", () => {
    // Provide valid surgery values so surgeon Continue jumps straight to patient
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        initialValues={{
          wishedDate: "2026-06-01",
          surgeryName: "Test surgery",
          coverageType: "Selbstzahler",
          stayType: "ambulant",
          surgeryDurationMinutes: 60,
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    // advanceFrom("surgeon") skips to patient because surgery is already valid
    openSurgerySection(container);

    const firstName = container.querySelector('[data-testid="input-patient-first-name"]') as HTMLInputElement;
    expect(firstName).not.toBeNull();
    expect(firstName.getAttribute("autocomplete")).toBe("given-name");

    const postalCode = container.querySelector('#patientPostalCode') as HTMLInputElement;
    expect(postalCode).not.toBeNull();
    expect(postalCode.getAttribute("autocomplete")).toBe("postal-code");
    expect(postalCode.getAttribute("inputmode")).toBe("numeric");
  });
});

describe("SurgeryRequestForm — initialValues rehydrate", () => {
  it("rehydrates form values from initialValues prop", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
        initialValues={{
          surgeryName: "Restored procedure",
          surgeryDurationMinutes: 90,
        }}
      />,
      { wrapper: makeQueryWrapper() },
    );
    openSurgerySection(container);
    const chopButton = container.querySelector('[data-testid="button-chop-search"]');
    expect(chopButton?.textContent).toContain("Restored procedure");
    const duration = container.querySelector('[data-testid="input-surgery-duration"]') as HTMLInputElement;
    expect(duration.value).toBe("90");
  });
});
