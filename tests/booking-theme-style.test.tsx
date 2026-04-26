// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BookingThemeStyle } from "../client/src/components/booking/BookingThemeStyle";

describe("BookingThemeStyle", () => {
  it("renders nothing when theme is null", () => {
    const { container } = render(<BookingThemeStyle theme={null} />);
    expect(container.querySelector("style")).toBeNull();
    expect(container.querySelector("link")).toBeNull();
  });

  it("injects style block with all 5 CSS vars", () => {
    const { container } = render(
      <BookingThemeStyle
        theme={{
          bgColor: "#fafafa",
          primaryColor: "#c89b6b",
          secondaryColor: "#4a3727",
          headingFont: "Playfair Display",
          bodyFont: "Inter",
        }}
      />,
    );
    const style = container.querySelector("style")?.textContent ?? "";
    expect(style).toContain("--book-bg: #fafafa");
    expect(style).toContain("--book-primary: #c89b6b");
    expect(style).toContain("--book-secondary: #4a3727");
    expect(style).toContain("--book-heading-font: 'Playfair Display'");
    expect(style).toContain("--book-body-font: 'Inter'");
    expect(style).toContain("[data-booking-root]");
  });

  it("injects Google Fonts link with both families", () => {
    const { container } = render(
      <BookingThemeStyle
        theme={{ bgColor: null, primaryColor: null, secondaryColor: null, headingFont: "Lora", bodyFont: "Inter" }}
      />,
    );
    const link = container.querySelector("link[rel='stylesheet']");
    expect(link).not.toBeNull();
    const href = link?.getAttribute("href") ?? "";
    expect(href).toContain("family=Lora");
    expect(href).toContain("family=Inter");
  });
});
