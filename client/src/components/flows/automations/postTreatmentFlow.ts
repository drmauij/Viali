export type DemoStepType =
  | "trigger"
  | "wait"
  | "send_sms"
  | "send_email"
  | "condition"
  | "end";

export type DemoStep = {
  id: string;
  type: DemoStepType;
  label: string;
  config: Record<string, unknown>;
  branch?: "yes" | "no";
};

export const POST_TREATMENT_FLOW: DemoStep[] = [
  {
    id: "trigger",
    type: "trigger",
    label: "Behandlung abgeschlossen",
    config: {
      event: "Behandlung abgeschlossen",
      treatmentTypes: ["Botox", "Filler"],
    },
  },
  {
    id: "wait-1",
    type: "wait",
    label: "7 Tage warten",
    config: { duration: "7 Tage" },
  },
  {
    id: "sms",
    type: "send_sms",
    label: "SMS: Wellness-Check",
    config: {
      message:
        "Hallo {{patient.name}}, wie fühlst du dich nach deiner Behandlung? Wir denken an dich. 💜",
      sender: "Praxis Birgit",
      recipientsPerMonth: 142,
    },
  },
  {
    id: "wait-2",
    type: "wait",
    label: "14 Tage warten",
    config: { duration: "14 Tage" },
  },
  {
    id: "condition",
    type: "condition",
    label: "Auffrischung gebucht?",
    config: {
      check: "Auffrischungstermin in den letzten 14 Tagen gebucht?",
      yesNext: "Flow beenden",
      noNext: "E-Mail mit Angebot senden",
    },
  },
  {
    id: "end-yes",
    type: "end",
    label: "Flow beendet",
    branch: "yes",
    config: { reason: "Patient hat den Flow erfolgreich abgeschlossen" },
  },
  {
    id: "email",
    type: "send_email",
    label: "E-Mail mit Angebot",
    branch: "no",
    config: {
      subject: "Zeit für deine Auffrischung — 15% Rabatt",
      preview:
        "Hallo {{patient.name}}, wir würden dich gerne wiedersehen. Hier ist ein kleines Dankeschön ...",
      promoCode: "REFRESH-15",
    },
  },
];

export const TEMPLATES = [
  {
    id: "post-treatment",
    title: "Nachsorge nach Behandlung",
    description:
      "Check-in 7 Tage nach Botox/Filler, dann Erinnerung an Auffrischungstermin.",
    available: true,
  },
  {
    id: "birthday",
    title: "Geburtstags-Aktion",
    description:
      "Geburtstagsgrüße mit automatischem Promo-Code und Erinnerung.",
    available: false,
  },
  {
    id: "winback",
    title: "Inaktive Patient:innen",
    description:
      "Patient:innen ohne Termin in den letzten 6 Monaten zurückgewinnen.",
    available: false,
  },
  {
    id: "abandoned",
    title: "Abgebrochene Buchung",
    description:
      "Patient:innen, die eine Buchung gestartet aber nicht abgeschlossen haben.",
    available: false,
  },
];
