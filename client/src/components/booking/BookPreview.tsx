import type { BookingTheme } from "@shared/schema";
import { BookingThemeStyle } from "./BookingThemeStyle";

interface Props {
  theme: BookingTheme | null;
}

export function BookPreview({ theme }: Props) {
  return (
    <div
      data-booking-root
      className="rounded-lg border overflow-hidden shadow-sm"
      style={{
        background: "var(--book-bg, #ffffff)",
        // Force dark text inside the preview regardless of the admin
        // page's color scheme — the preview always mocks the light /book.
        // Otherwise the parent's dark-mode text-color cascades in and
        // labels become unreadable on the light preview surface.
        color: "#18181b",
        fontFamily: "var(--book-body-font, system-ui)",
      }}
    >
      <BookingThemeStyle theme={theme} />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded bg-zinc-200" />
          <div className="text-sm font-medium">Clinic name</div>
        </div>
        <h2
          className="text-2xl"
          style={{ fontFamily: "var(--book-heading-font, system-ui)" }}
        >
          Termin buchen
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {["Mo 14", "Di 15"].map((d) => (
            <div key={d} className="rounded border p-3 text-center text-sm">{d}</div>
          ))}
        </div>
        <div className="flex gap-2">
          {["10:00", "10:30", "11:00"].map((t) => (
            <span
              key={t}
              className="rounded border px-3 py-1 text-xs"
              style={{
                borderColor: "var(--book-secondary, #71717a)",
                color: "var(--book-secondary, #71717a)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <button
          type="button"
          data-book-cta
          className="w-full rounded py-2 text-sm font-medium text-white"
          style={{ background: "var(--book-primary, #18181b)" }}
        >
          Termin buchen
        </button>
      </div>
    </div>
  );
}
