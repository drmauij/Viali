import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "stammblattBannerDismissed";

export function StammblattBanner() {
  const activeHospital = useActiveHospital();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const enabled =
    activeHospital?.addonPersonalstammblatt === true &&
    (user as any)?.canLogin === true &&
    !dismissed;

  const { data } = useQuery({
    queryKey: ["/api/me/stammblatt", activeHospital?.id],
    queryFn: () =>
      apiRequest("GET", "/api/me/stammblatt").then((r) => r.json()),
    enabled,
    // Don't retry on 403 — that just means the addon is off for this hospital.
    retry: (failureCount, error: any) => {
      if (error?.status === 403 || error?.status === 400) return false;
      return failureCount < 2;
    },
  });

  if (!enabled) return null;
  if (!data || data.submittedAt) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <span className="text-sm text-amber-900">
        Ihr Personalstammblatt ist noch nicht ausgefüllt.
      </span>
      <div className="flex items-center gap-2">
        <Link href="/profile/stammblatt">
          <Button size="sm" variant="default">
            Jetzt ausfüllen
          </Button>
        </Link>
        <button
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="text-amber-900 hover:text-amber-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
