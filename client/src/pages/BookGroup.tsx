import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { MapPin, Loader2 } from "lucide-react";

// Patient-facing chain-level location picker. Behavior:
//   1. Fetch `/api/public/group-booking/:token`.
//   2. Render group name + a card per member hospital.
//   3. Click → forward to `/book/<hospitalBookingToken>?group=<groupId>`
//      which re-enters the existing per-hospital booking flow. The
//      `group` query param is carried along so downstream attribution
//      can see which group funnel brought the patient in.
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
};

type GroupBookingData = {
  group: { id: string; name: string };
  hospitals: Hospital[];
};

export default function BookGroup() {
  const { token } = useParams<{ token: string }>();
  const [, setLoc] = useLocation();
  const [data, setData] = useState<GroupBookingData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not_found" | "error">(
    "loading",
  );

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

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "not_found") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Seite nicht gefunden</h1>
          <p className="text-muted-foreground text-sm">
            Dieser Buchungslink ist nicht (mehr) gültig. Bitte kontaktieren Sie
            die Praxis für einen aktuellen Link.
          </p>
        </div>
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen</h1>
          <p className="text-muted-foreground text-sm">
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
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="group-name">
            {group.name}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Wählen Sie Ihren Wunschstandort, um einen Termin zu buchen.
          </p>
        </div>

        {bookable.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
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
                  className="w-full text-left rounded-lg border bg-card p-4 hover:bg-accent hover:border-accent-foreground/20 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                  data-testid={`location-${h.id}`}
                >
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium leading-tight">{h.name}</div>
                      {h.address && (
                        <div className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
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
