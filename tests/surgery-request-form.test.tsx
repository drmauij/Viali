// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SurgeryRequestForm } from "../client/src/components/surgery/SurgeryRequestForm";
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
    const surgery = container.querySelector('[data-section="surgery"]');
    expect(surgery).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="schedule"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="procedure"]')).not.toBeNull();
    expect(surgery!.querySelector('[data-subgroup="coverage"]')).not.toBeNull();
  });
});

describe("SurgeryRequestForm — inline validation", () => {
  it("shows 'Required' on a date field after blur when empty, clears once filled", () => {
    const { container } = render(
      <SurgeryRequestForm
        {...baseProps}
        currentSurgeon={{ firstName: "R", lastName: "S", email: null, phone: null }}
      />,
      { wrapper: makeQueryWrapper() },
    );

    // Find date input by data-testid (in the schedule subgroup)
    const dateInput = container.querySelector('[data-testid="input-wished-date"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();

    // No error before blur
    expect(dateInput!.getAttribute("aria-invalid")).not.toBe("true");

    // Blur with empty value → error appears
    fireEvent.blur(dateInput!);
    expect(dateInput!.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByText(/validation.required/).length).toBeGreaterThan(0);

    // Type a valid value → error clears
    fireEvent.change(dateInput!, { target: { value: "2026-06-01" } });
    expect(dateInput!.getAttribute("aria-invalid")).not.toBe("true");
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
