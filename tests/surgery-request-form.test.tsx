// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SurgeryRequestForm } from "../client/src/components/surgery/SurgeryRequestForm";

beforeAll(() => {
  // jsdom does not ship ResizeObserver; Radix UI needs it.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

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
      { wrapper: makeWrapper() },
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
      { wrapper: makeWrapper() },
    );
    expect(screen.queryByText(/surgeonCard.submittingAs/)).toBeNull();
  });
});
