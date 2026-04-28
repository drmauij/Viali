// server/seed/contractTemplateStarters.ts
import type { TemplateBody } from "@shared/contractTemplates/types";

export const ON_CALL_V1_KEY = "on_call_v1";

export const ON_CALL_V1_DE: TemplateBody = {
  variables: {
    simple: [
      { key: "company.name",         type: "text", label: "Firmenname",     source: "auto:hospital.companyName" },
      { key: "company.address",      type: "text", label: "Firmenadresse",  source: "auto:hospital.address" },
      { key: "company.jurisdiction", type: "text", label: "Gerichtsstand",  default: "Zürich" },
      { key: "worker.firstName",     type: "text", label: "Vorname",        required: true },
      { key: "worker.lastName",      type: "text", label: "Nachname",       required: true },
      { key: "worker.street",        type: "text", label: "Strasse",        required: true },
      { key: "worker.postalCode",    type: "text", label: "PLZ",            required: true },
      { key: "worker.city",          type: "text", label: "Ort",            required: true },
      { key: "worker.phone",         type: "phone", label: "Telefon" },
      { key: "worker.email",         type: "email", label: "E-Mail",         required: true },
      { key: "worker.dateOfBirth",   type: "date", label: "Geburtsdatum",   required: true },
      { key: "worker.iban",          type: "iban", label: "IBAN",           required: true },
      { key: "contract.signedAt",    type: "date", label: "Unterzeichnet am", source: "auto:now" },
    ],
    selectableLists: [
      {
        key: "role",
        label: "Rolle / Tarif",
        fields: [
          { key: "title",       type: "text" },
          { key: "rate",        type: "money" },
          { key: "description", type: "text" },
          { key: "roleTitle",   type: "text" },
        ],
        options: [
          {
            id: "awr_nurse",
            title: "Tagesklinik Pflege (AWR-Nurse)",
            rate: "CHF 50.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Intensivpflege",
            roleTitle: "IMC-Pfleger im Aufwachraum",
          },
          {
            id: "anesthesia_nurse",
            title: "Pflege-Anästhesist",
            rate: "CHF 60.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Anästhesiepflege",
            roleTitle: "Anästhesiepfleger",
          },
          {
            id: "op_nurse",
            title: "OP Pflege/OTA",
            rate: "CHF 50.00",
            description: "diplomierter Pflegefachmann mit Zusatzausbildung OP-Pflege oder Operationstechnischer Assistent (OTA)",
            roleTitle: "OP-Pfleger/OTA",
          },
        ],
      },
    ],
  },
  blocks: [
    { id: "h1", type: "heading", level: 1, text: "Vertrag für Kurzzeiteinsätze auf Abruf" },
    { id: "p_intro", type: "paragraph",
      text: "Zwischen {{company.name}}, {{company.address}} (nachfolgend «Auftraggeber») und {{worker.firstName}} {{worker.lastName}}, {{worker.street}}, {{worker.postalCode}} {{worker.city}} (nachfolgend «Auftragnehmer») wird folgender Vertrag geschlossen." },
    { id: "s_1", type: "section", title: "1. Präambel", children: [
      { id: "p_1", type: "paragraph",
        text: "Die {{company.name}} bietet kurzzeitige Einsätze für {{role.title}} an. Der Auftragnehmer ist {{role.description}} und übernimmt die Funktion {{role.roleTitle}}." },
    ]},
    { id: "s_2", type: "section", title: "2. Vertragsgegenstand", children: [
      { id: "p_2", type: "paragraph",
        text: "Der Auftragnehmer verpflichtet sich, auf Abruf des Auftraggebers kurzzeitige Einsätze als {{role.roleTitle}} zu übernehmen." },
    ]},
    { id: "s_3", type: "section", title: "3. Vergütung", children: [
      { id: "p_3", type: "paragraph",
        text: "Der Auftragnehmer erhält für seine Tätigkeit einen Bruttolohn pro Stunde in Höhe von {{role.rate}}. Die Auszahlung erfolgt monatlich auf das vom Auftragnehmer angegebene Konto (IBAN: {{worker.iban}})." },
    ]},
    { id: "s_4", type: "section", title: "4. Arbeitszeit", children: [
      { id: "p_4", type: "paragraph",
        text: "Die Einsatzzeiten werden im gegenseitigen Einvernehmen festgelegt. Es besteht keine Verpflichtung zur Annahme einzelner Einsätze." },
    ]},
    { id: "s_5", type: "section", title: "5. Verschwiegenheit", children: [
      { id: "p_5", type: "paragraph",
        text: "Der Auftragnehmer verpflichtet sich zur Verschwiegenheit über alle ihm im Rahmen seiner Tätigkeit bekannt gewordenen Geschäfts- und Patientendaten — auch nach Beendigung des Vertragsverhältnisses." },
    ]},
    { id: "s_6", type: "section", title: "6. Versicherung", children: [
      { id: "p_6", type: "paragraph",
        text: "Der Auftragnehmer ist für seine eigene Sozial- und Krankenversicherung selbst verantwortlich, sofern keine anderslautenden gesetzlichen Bestimmungen gelten." },
    ]},
    { id: "s_7", type: "section", title: "7. Beendigung", children: [
      { id: "p_7", type: "paragraph",
        text: "Der Vertrag kann jederzeit von beiden Seiten ohne Angabe von Gründen schriftlich gekündigt werden." },
    ]},
    { id: "s_8", type: "section", title: "8. Schlussbestimmungen", children: [
      { id: "p_8", type: "paragraph",
        text: "Änderungen oder Ergänzungen dieses Vertrages bedürfen der Schriftform. Sollte eine Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt." },
    ]},
    { id: "s_9", type: "section", title: "9. Gerichtsstand", children: [
      { id: "p_9", type: "paragraph",
        text: "Gerichtsstand für sämtliche Streitigkeiten aus diesem Vertrag ist {{company.jurisdiction}}." },
    ]},
    { id: "p_signed", type: "paragraph",
      text: "Unterzeichnet am {{contract.signedAt}}." },
    { id: "sig_w", type: "signature", party: "worker",  label: "Auftragnehmer" },
    { id: "sig_m", type: "signature", party: "manager", label: "Auftraggeber" },
  ],
};

export const STARTERS = [
  { key: ON_CALL_V1_KEY, name: "On-Call Worker Contract", language: "de" as const, body: ON_CALL_V1_DE },
];
