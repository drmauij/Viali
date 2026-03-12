import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AppointmentInfo = {
  appointmentDate: string;
  appointmentTime: string;
  clinicName: string;
  patientName: string;
  status: string;
  language: string;
  bookingToken: string | null;
  providerId: string | null;
  patientFirstName: string;
  patientSurname: string;
  patientEmail: string | null;
  patientPhone: string | null;
};

type CancelResult = {
  success: boolean;
  appointment: { date: string; time: string; clinicName: string };
};

export default function ManageAppointment() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<AppointmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);

  // Force light theme for this public page
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.removeAttribute("data-theme");
    return () => {
      if (previousTheme) root.setAttribute("data-theme", previousTheme);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/clinic/appointments/cancel-info/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.alreadyUsed) setError("already_used");
          else if (data.expired) setError("expired");
          else setError("not_found");
          return;
        }
        const data = await res.json();
        if (data.status === "cancelled") {
          setError("already_cancelled");
        } else {
          setInfo(data);
        }
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/clinic/appointments/cancel-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "cancel_failed");
        return;
      }
      const data: CancelResult = await res.json();
      setCancelResult(data);
      setCancelled(true);
    } catch {
      setError("network");
    } finally {
      setCancelling(false);
    }
  };

  const handleReschedule = () => {
    if (!info?.bookingToken) return;
    if (!token) return;
    setCancelling(true);
    fetch("/api/clinic/appointments/cancel-by-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, reason: "Rescheduled by patient" }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.message || "cancel_failed");
          return;
        }
        const params = new URLSearchParams();
        if (info.providerId) params.set("provider", info.providerId);
        if (info.patientFirstName) params.set("firstName", info.patientFirstName);
        if (info.patientSurname) params.set("surname", info.patientSurname);
        if (info.patientEmail) params.set("email", info.patientEmail);
        if (info.patientPhone) params.set("phone", info.patientPhone);
        params.set("reschedule", "true");
        window.location.href = `/book/${info.bookingToken}?${params.toString()}`;
      })
      .catch(() => setError("network"))
      .finally(() => setCancelling(false));
  };

  const isGerman = info?.language === "de";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    const messages: Record<string, { de: string; en: string }> = {
      already_used: {
        de: "Dieser Link wurde bereits verwendet.",
        en: "This link has already been used.",
      },
      expired: {
        de: "Dieser Link ist abgelaufen.",
        en: "This link has expired.",
      },
      already_cancelled: {
        de: "Dieser Termin wurde bereits abgesagt.",
        en: "This appointment has already been cancelled.",
      },
      not_found: {
        de: "Termin nicht gefunden.",
        en: "Appointment not found.",
      },
      network: {
        de: "Verbindungsfehler. Bitte versuchen Sie es erneut.",
        en: "Connection error. Please try again.",
      },
    };
    const msg = messages[error] || messages.not_found;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">
              {error === "already_cancelled" || error === "already_used" ? "\u2713" : "\u26A0"}
            </div>
            <p className="text-lg text-gray-700">{msg.de}</p>
            <p className="text-sm text-gray-500 mt-1">{msg.en}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (cancelled && cancelResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">{"\u2713"}</div>
            <h2 className="text-xl font-semibold mb-2">
              {isGerman ? "Termin abgesagt" : "Appointment Cancelled"}
            </h2>
            <p className="text-gray-500">
              {isGerman
                ? `Ihr Termin bei ${cancelResult.appointment.clinicName} am ${cancelResult.appointment.date} um ${cancelResult.appointment.time} wurde erfolgreich abgesagt.`
                : `Your appointment at ${cancelResult.appointment.clinicName} on ${cancelResult.appointment.date} at ${cancelResult.appointment.time} has been successfully cancelled.`}
            </p>
            {info?.bookingToken && (
              <a
                href={`/book/${info.bookingToken}${info.providerId ? `?provider=${info.providerId}` : ""}`}
                className="inline-block mt-4 text-blue-600 hover:text-blue-800 underline"
              >
                {isGerman ? "Neuen Termin buchen" : "Book a new appointment"}
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {isGerman ? "Ihren Termin verwalten" : "Manage Your Appointment"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-gray-100 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Klinik" : "Clinic"}</span>
              <span className="font-medium">{info.clinicName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Datum" : "Date"}</span>
              <span className="font-medium">{info.appointmentDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{isGerman ? "Uhrzeit" : "Time"}</span>
              <span className="font-medium">{info.appointmentTime}</span>
            </div>
          </div>

          <p className="text-center text-gray-500 text-sm">
            {isGerman
              ? "Was m\u00F6chten Sie mit diesem Termin tun?"
              : "What would you like to do with this appointment?"}
          </p>

          <div className="space-y-3">
            {info.bookingToken && (
              <Button
                className="w-full"
                onClick={handleReschedule}
                disabled={cancelling}
              >
                {cancelling
                  ? (isGerman ? "Wird bearbeitet..." : "Processing...")
                  : (isGerman ? "Termin verschieben" : "Reschedule Appointment")}
              </Button>
            )}

            <Button
              variant="destructive"
              className="w-full"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling
                ? (isGerman ? "Wird abgesagt..." : "Cancelling...")
                : (isGerman ? "Termin absagen" : "Cancel Appointment")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
