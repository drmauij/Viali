import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingThemeStyle } from "@/components/booking/BookingThemeStyle";
import type { BookingTheme } from "@shared/schema";

// Patient-facing chain-level location picker. Behavior:
//   1. Fetch `/api/public/group-booking/:token`.
//   2. Render group name + a card per member hospital.
//   3. Click → forward to `/book/<hospitalBookingToken>?group=<groupId>`
//      which re-enters the existing per-hospital booking flow. The
//      `group` query param is carried along so downstream attribution
//      can see which group funnel brought the patient in.
//
// Theme: defaults to LIGHT mode regardless of the patient's system
// preference (booking is a high-stakes flow; we don't want a stark dark
// surface to surprise patients on prefers-color-scheme: dark machines).
// A small floating toggle in the top-right lets them flip to dark.
//
// Copy is German-first (Viali's primary patient-facing language). We
// don't know the hospital's preferred language yet at the group level —
// that only gets resolved after the patient picks a location — so
// falling back to German here matches the booking landing page.

type Hospital = {
  id: string;
  name: string;
  address: string | null;
  bookingToken: string | null;
  logoUrl: string | null;
};

type GroupBookingData = {
  group: { id: string; name: string; logoUrl: string | null };
  hospitals: Hospital[];
  /**
   * Resolved booking theme for the group. May be null when no theme has been
   * configured. See BookingThemeStyle.
   */
  bookingTheme?: BookingTheme | null;
};

export default function BookGroup() {
  const { token } = useParams<{ token: string }>();
  const [, setLoc] = useLocation();
  const [data, setData] = useState<GroupBookingData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">(
    "loading",
  );
  const [isDark, setIsDark] = useState(false);

  // Override the global app theme so this page picks light/dark
  // independent of any user preference set elsewhere.
  useEffect(() => {
    const prev = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    document.body.style.background = isDark ? "#0c0c14" : "#f0f1f3";
    return () => {
      if (prev) document.documentElement.setAttribute("data-theme", prev);
      else document.documentElement.removeAttribute("data-theme");
      document.body.style.background = "";
    };
  }, [isDark]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/public/group-booking/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState("not_found");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const body = (await res.json()) as GroupBookingData;
        setData(body);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const wrapClass = cn(
    "min-h-screen transition-colors duration-500",
    isDark ? "bg-[#0c0c14] text-white" : "bg-[#f0f1f3] text-gray-900",
  );

  const theme = data?.bookingTheme ?? null;
  // Apply var(--book-bg) only when not in dark mode and a bg is configured —
  // dark mode keeps its fixed near-black surface. var() with no fallback
  // resolves to invalid when undefined, so the className background wins.
  const themedRootStyle: React.CSSProperties | undefined =
    !isDark && theme?.bgColor
      ? { background: "var(--book-bg)", fontFamily: theme.bodyFont ? "var(--book-body-font)" : undefined }
      : theme?.bodyFont
        ? { fontFamily: "var(--book-body-font)" }
        : undefined;

  if (state === "loading") {
    return (
      <div data-booking-root className={cn(wrapClass, "flex items-center justify-center")} style={themedRootStyle}>
        <BookingThemeStyle theme={theme} />
        <ThemeToggleFab isDark={isDark} onToggle={() => setIsDark((d) => !d)} />
        <Loader2 className={cn("h-6 w-6 animate-spin", isDark ? "text-white/60" : "text-gray-500")} />
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div data-booking-root className={cn(wrapClass, "flex items-center justify-center p-6")} style={themedRootStyle}>
        <BookingThemeStyle theme={theme} />
        <ThemeToggleFab isDark={isDark} onToggle={() => setIsDark((d) => !d)} />
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
          <p className={cn("text-sm", isDark ? "text-white/60" : "text-gray-500")}>
            Dieser Buchungslink ist nicht (mehr) gültig. Bitte kontaktieren Sie
            die Praxis für einen aktuellen Link.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div data-booking-root className={cn(wrapClass, "flex items-center justify-center p-6")} style={themedRootStyle}>
        <BookingThemeStyle theme={theme} />
        <ThemeToggleFab isDark={isDark} onToggle={() => setIsDark((d) => !d)} />
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
          <p className={cn("text-sm", isDark ? "text-white/60" : "text-gray-500")}>
            Die Buchungsseite konnte nicht geladen werden. Bitte versuchen Sie
            es später erneut.
          </p>
        </div>
      </div>
    );
  }

  const { group, hospitals } = data;
  const bookable = hospitals.filter((h) => h.bookingToken);

  return (
    <div data-booking-root className={wrapClass} style={themedRootStyle}>
      <BookingThemeStyle theme={theme} />
      <ThemeToggleFab isDark={isDark} onToggle={() => setIsDark((d) => !d)} />
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="mb-8 text-center">
          {group.logoUrl && (
            <div className="mx-auto mb-4 h-16 w-16 rounded-lg overflow-hidden flex items-center justify-center">
              <img
                src={group.logoUrl}
                alt=""
                className="w-full h-full object-contain"
                data-testid="group-logo"
              />
            </div>
          )}
          <h1
            className="text-2xl font-semibold tracking-tight"
            data-testid="group-name"
            style={theme?.headingFont ? { fontFamily: "var(--book-heading-font)" } : undefined}
          >
            {group.name}
          </h1>
          <p className={cn("mt-2 text-sm", isDark ? "text-white/60" : "text-gray-500")}>
            Wählen Sie Ihren Wunschstandort, um einen Termin zu buchen.
          </p>
        </div>

        {bookable.length === 0 ? (
          <p className={cn("text-center text-sm", isDark ? "text-white/60" : "text-gray-500")}>
            Aktuell sind keine Standorte für die Online-Buchung verfügbar.
          </p>
        ) : (
          <ul className="space-y-3" data-testid="location-list">
            {bookable.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() =>
                    setLoc(
                      `/book/${h.bookingToken}?group=${encodeURIComponent(group.id)}`,
                    )
                  }
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-colors focus:outline-none focus:ring-2",
                    isDark
                      ? "bg-white/5 border-white/10 hover:bg-white/10 focus:ring-white/30"
                      : "bg-white border-gray-200 hover:bg-gray-50 focus:ring-gray-300",
                  )}
                  // When themed, swap the per-clinic CTA's hairline border to
                  // the brand primary so the picker reflects the chain palette.
                  style={
                    !isDark && theme?.primaryColor
                      ? { borderColor: "var(--book-primary)" }
                      : undefined
                  }
                  data-testid={`location-${h.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "h-12 w-12 shrink-0 rounded border overflow-hidden flex items-center justify-center",
                        isDark ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200",
                      )}
                    >
                      {h.logoUrl ? (
                        <img
                          src={h.logoUrl}
                          alt=""
                          className="w-full h-full object-contain"
                          data-testid={`location-logo-${h.id}`}
                        />
                      ) : (
                        <MapPin className={cn("h-5 w-5", isDark ? "text-white/40" : "text-gray-400")} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium leading-tight">{h.name}</div>
                      {h.address && (
                        <div
                          className={cn(
                            "text-sm mt-1 whitespace-pre-line",
                            isDark ? "text-white/60" : "text-gray-500",
                          )}
                        >
                          {h.address}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThemeToggleFab({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? "Zu Hell-Modus wechseln" : "Zu Dunkel-Modus wechseln"}
      className={cn(
        "fixed top-4 right-4 z-50 inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors duration-300",
        isDark
          ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          : "bg-white/90 text-gray-600 hover:bg-white hover:text-gray-900 shadow-sm border border-gray-200",
      )}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
