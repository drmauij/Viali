// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { TreatmentLinesTable } from "../client/src/components/treatments/TreatmentLinesTable";

const services = [
  { id: "svc-1", name: "Lifting", price: "250" },
  { id: "svc-2", name: "Filler" },
];
const items = [
  { id: "itm-1", name: "Botox 50u", patientPrice: "100" },
  { id: "itm-2", name: "Juvederm Volift" },
];
const lotsByItem = {
  "itm-1": [{ id: "lot-1", lotNumber: "B12345", expiryDate: null, qty: 3 }],
};

function noop() {}

describe("TreatmentLinesTable — read-only / locked", () => {
  it("renders saved values as plain text and hides editable controls when locked", () => {
    const { container } = render(
      <TreatmentLinesTable
        lines={[
          {
            serviceId: "svc-1",
            itemId: "itm-1",
            dose: "4",
            doseUnit: "units",
            total: "400.00",
            zones: ["forehead"],
            notes: "patient comfortable",
          },
        ]}
        services={services}
        items={items}
        lotsByItem={lotsByItem}
        isLocked={true}
        onChangeLine={noop}
        onRemoveLine={noop}
        onEditFull={noop}
        onAddBlankLine={noop}
      />,
    );
    // No editable controls
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(container.querySelectorAll('[role="combobox"]').length).toBe(0);
    expect(screen.queryByRole("button", { name: /edit line/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove line/i })).toBeNull();
    // Saved values present
    expect(screen.getByText("Lifting")).toBeTruthy();
    expect(screen.getByText("Botox 50u")).toBeTruthy();
    expect(screen.getByText("forehead")).toBeTruthy();
    expect(screen.getByText("patient comfortable")).toBeTruthy();
  });
});

describe("TreatmentLinesTable — empty state", () => {
  it("shows the empty hint when lines is []", () => {
    render(
      <TreatmentLinesTable
        lines={[]}
        services={services}
        items={items}
        lotsByItem={{}}
        isLocked={false}
        onChangeLine={noop}
        onRemoveLine={noop}
        onEditFull={noop}
        onAddBlankLine={noop}
      />,
    );
    expect(screen.getByText(/No lines yet/i)).toBeTruthy();
  });
});

describe("TreatmentLinesTable — editable interactions", () => {
  it("calls onChangeLine with a dose patch when typing in the Dose cell", () => {
    const onChangeLine = vi.fn();
    render(
      <TreatmentLinesTable
        lines={[{ serviceId: "svc-1", unitPrice: "100" }]}
        services={services}
        items={items}
        lotsByItem={{}}
        isLocked={false}
        onChangeLine={onChangeLine}
        onRemoveLine={noop}
        onEditFull={noop}
        onAddBlankLine={noop}
      />,
    );
    const doseInput = screen.getByPlaceholderText("Dose");
    fireEvent.change(doseInput, { target: { value: "4" } });
    expect(onChangeLine).toHaveBeenCalledWith(0, expect.objectContaining({ dose: "4" }));
    // recomputeTotalPatch should also fire, since unitPrice was set
    const lastCall = onChangeLine.mock.calls.at(-1)![1];
    expect(lastCall.total).toBe("400.00");
  });

  it("calls onChangeLine with the total when typing in the Price cell", () => {
    const onChangeLine = vi.fn();
    render(
      <TreatmentLinesTable
        lines={[{ serviceId: "svc-1" }]}
        services={services}
        items={items}
        lotsByItem={{}}
        isLocked={false}
        onChangeLine={onChangeLine}
        onRemoveLine={noop}
        onEditFull={noop}
        onAddBlankLine={noop}
      />,
    );
    const priceInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(priceInput, { target: { value: "300" } });
    expect(onChangeLine).toHaveBeenCalledWith(0, { total: "300" });
  });

  it("calls onRemoveLine when trash button is clicked", () => {
    const onRemoveLine = vi.fn();
    render(
      <TreatmentLinesTable
        lines={[{ serviceId: "svc-1" }, { serviceId: "svc-2" }]}
        services={services}
        items={items}
        lotsByItem={{}}
        isLocked={false}
        onChangeLine={noop}
        onRemoveLine={onRemoveLine}
        onEditFull={noop}
        onAddBlankLine={noop}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: /remove line/i });
    fireEvent.click(removeButtons[1]);
    expect(onRemoveLine).toHaveBeenCalledWith(1);
  });

  it("calls onEditFull when pencil button is clicked", () => {
    const onEditFull = vi.fn();
    render(
      <TreatmentLinesTable
        lines={[{ serviceId: "svc-1" }]}
        services={services}
        items={items}
        lotsByItem={{}}
        isLocked={false}
        onChangeLine={noop}
        onRemoveLine={noop}
        onEditFull={onEditFull}
        onAddBlankLine={noop}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /edit line/i }));
    expect(onEditFull).toHaveBeenCalledWith(0);
  });
});
