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
};

type CancelResult = {
  success: boolean;
  appointment: { date: string; time: string; clinicName: string };
};

export default function CancelAppointment() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<AppointmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelResult, setCancelResult] = useState<CancelResult | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/clinic/appointments/cancel-info/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.alreadyUsed) {
            setError("already_used");
          } else if (data.expired) {
            setError("expired");
          } else {
            setError("not_found");
          }
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
        de: "Dieser Absage-Link wurde bereits verwendet.",
        en: "This cancellation link has already been used.",
      },
      expired: {
        de: "Dieser Absage-Link ist abgelaufen.",
        en: "This cancellation link has expired.",
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
              {error === "already_cancelled" || error === "already_used" ? "✓" : "⚠"}
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
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-xl font-semibold mb-2">
              {isGerman ? "Termin abgesagt" : "Appointment Cancelled"}
            </h2>
            <p className="text-gray-600">
              {isGerman
                ? `Ihr Termin bei ${cancelResult.appointment.clinicName} am ${cancelResult.appointment.date} um ${cancelResult.appointment.time} wurde erfolgreich abgesagt.`
                : `Your appointment at ${cancelResult.appointment.clinicName} on ${cancelResult.appointment.date} at ${cancelResult.appointment.time} has been successfully cancelled.`}
            </p>
            <p className="text-sm text-gray-500 mt-4">
              {isGerman
                ? "Möchten Sie einen neuen Termin? Bitte kontaktieren Sie uns direkt."
                : "Would you like to reschedule? Please contact us directly."}
            </p>
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
            {isGerman ? "Termin absagen" : "Cancel Appointment"}
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

          <p className="text-center text-gray-600">
            {isGerman
              ? "Möchten Sie diesen Termin wirklich absagen?"
              : "Are you sure you want to cancel this appointment?"}
          </p>

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
        </CardContent>
      </Card>
    </div>
  );
}
