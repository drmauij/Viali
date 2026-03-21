import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, MapPin, User, FileText, Video, Download, ExternalLink, Phone } from "lucide-react";

type AppointmentInfo = {
  appointmentDate: string;
  appointmentRawDate: string;
  appointmentTime: string;
  appointmentEndTime: string;
  clinicName: string;
  clinicAddress: string | null;
  clinicPhone: string | null;
  patientName: string;
  status: string;
  language: string;
  notes: string | null;
  providerName: string | null;
  providerRole: string | null;
  providerImageUrl: string | null;
  serviceName: string | null;
  serviceDescription: string | null;
  isVideoAppointment: boolean;
  videoMeetingLink: string | null;
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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Force light theme for this public page
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    root.removeAttribute("data-theme");
    document.body.style.background = "#f0f1f3";
    return () => {
      if (previousTheme) root.setAttribute("data-theme", previousTheme);
      document.body.style.background = "";
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

  const isGerman = info?.language === "de";
  const t = (de: string, en: string) => isGerman ? de : en;

  const providerDisplayName = info?.providerName
    ? (info.providerRole === 'doctor' ? `Dr. ${info.providerName}` : info.providerName)
    : null;

  const googleMapsUrl = info?.clinicAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(info.clinicAddress)}`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f1f3]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (error) {
    const messages: Record<string, { de: string; en: string }> = {
      already_used: { de: "Dieser Link wurde bereits verwendet.", en: "This link has already been used." },
      expired: { de: "Dieser Link ist abgelaufen.", en: "This link has expired." },
      already_cancelled: { de: "Dieser Termin wurde bereits abgesagt.", en: "This appointment has already been cancelled." },
      not_found: { de: "Termin nicht gefunden.", en: "Appointment not found." },
      network: { de: "Verbindungsfehler. Bitte versuchen Sie es erneut.", en: "Connection error. Please try again." },
    };
    const msg = messages[error] || messages.not_found;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f1f3] p-4">
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
      <div className="min-h-screen flex items-center justify-center bg-[#f0f1f3] p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="text-4xl mb-4">{"\u2713"}</div>
            <h2 className="text-xl font-semibold mb-2">
              {t("Termin abgesagt", "Appointment Cancelled")}
            </h2>
            <p className="text-gray-500">
              {t(
                `Ihr Termin bei ${cancelResult.appointment.clinicName} am ${cancelResult.appointment.date} um ${cancelResult.appointment.time} wurde erfolgreich abgesagt.`,
                `Your appointment at ${cancelResult.appointment.clinicName} on ${cancelResult.appointment.date} at ${cancelResult.appointment.time} has been successfully cancelled.`
              )}
            </p>
            {info?.bookingToken && (
              <a
                href={`/book/${info.bookingToken}${info.providerId ? `?provider=${info.providerId}` : ""}`}
                className="inline-block mt-4 text-blue-600 hover:text-blue-800 underline"
              >
                {t("Neuen Termin buchen", "Book a new appointment")}
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="min-h-screen bg-[#f0f1f3] p-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("Ihre Termininformationen", "Your Appointment Information")}
          </h1>
          <p className="text-gray-500 mt-1">
            {info.clinicName}
          </p>
        </div>

        {/* Date & Time Card */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500">
                  {t("Datum & Uhrzeit", "Date & Time")}
                </p>
                <p className="text-lg font-semibold text-gray-900 mt-0.5">
                  {info.appointmentDate}
                </p>
                <p className="text-gray-700 flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3.5 w-3.5" />
                  {info.appointmentTime} – {info.appointmentEndTime} Uhr
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Doctor Card */}
        {providerDisplayName && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                {info.providerImageUrl ? (
                  <img
                    src={info.providerImageUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-emerald-600" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {t("Arzt", "Doctor")}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">
                    {providerDisplayName}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Treatment Card */}
        {info.serviceName && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    {t("Behandlung", "Treatment")}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">
                    {info.serviceName}
                  </p>
                  {info.serviceDescription && (
                    <p className="text-sm text-gray-500 mt-0.5">{info.serviceDescription}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Video Meeting Card */}
        {info.isVideoAppointment && info.videoMeetingLink && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Video className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-500">
                    {t("Video-Termin", "Video Appointment")}
                  </p>
                  <a
                    href={info.videoMeetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <Video className="h-4 w-4" />
                    {t("Video-Termin beitreten", "Join Video Appointment")}
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Location Card */}
        {info.clinicAddress && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <MapPin className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-500">
                    {t("Adresse", "Location")}
                  </p>
                  <p className="text-gray-900 font-medium mt-0.5">
                    {info.clinicAddress}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {googleMapsUrl && (
                      <a
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Google Maps
                      </a>
                    )}
                    {info.clinicPhone && (
                      <a
                        href={`tel:${info.clinicPhone}`}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {info.clinicPhone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notes Card */}
        {info.notes && (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-gray-500 mb-1">
                {t("Anmerkungen", "Notes")}
              </p>
              <p className="text-gray-700">{info.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3 pt-2">
          {/* Download ICS */}
          <a
            href={`/api/clinic/appointments/ics/${token}`}
            download="appointment.ics"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download className="h-4 w-4" />
            {t("Zum Kalender hinzufügen", "Add to Calendar")}
          </a>

          {/* Cancel */}
          {!showCancelConfirm ? (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-full text-center text-sm text-gray-400 hover:text-red-500 transition-colors py-2"
            >
              {t("Termin absagen", "Cancel Appointment")}
            </button>
          ) : (
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="p-4 text-center space-y-3">
                <p className="text-sm text-gray-700">
                  {t(
                    "Möchten Sie diesen Termin wirklich absagen?",
                    "Are you sure you want to cancel this appointment?"
                  )}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    {t("Nein", "No")}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling
                      ? t("Wird abgesagt...", "Cancelling...")
                      : t("Ja, absagen", "Yes, cancel")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pt-4 pb-2">
          <p className="text-xs text-gray-400">Powered by Viali</p>
        </div>
      </div>
    </div>
  );
}
