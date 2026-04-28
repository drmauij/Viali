// server/seed/contractTemplateStarters.ts
import type { TemplateBody } from "@shared/contractTemplates/types";

export const ON_CALL_V1_KEY = "on_call_v1";

export const ON_CALL_V1_DE: TemplateBody = {
  variables: {
    simple: [
      { key: "company.name",         type: "text", label: "Firmenname",     source: "auto:hospital.companyName" },
      { key: "company.address",      type: "text", label: "Firmenadresse",  source: "auto:hospital.address" },
      { key: "company.jurisdiction", type: "text", label: "Gerichtsstand",  source: "auto:hospital.companyJurisdiction" },
      { key: "worker.firstName",     type: "text", label: "Vorname",        required: true },
      { key: "worker.lastName",      type: "text", label: "Nachname",       required: true },
      { key: "worker.street",        type: "text", label: "Strasse",        required: true },
      { key: "worker.postalCode",    type: "text", label: "PLZ",            required: true },
      { key: "worker.city",          type: "text", label: "Ort",            required: true },
      { key: "worker.phone",         type: "phone", label: "Telefon" },
      { key: "worker.email",         type: "email", label: "E-Mail",        required: true },
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

    // ─── Auftraggeber ───
    { id: "p_company_name",     type: "paragraph", text: "{{company.name}}" },
    { id: "p_company_address",  type: "paragraph", text: "{{company.address}}" },
    { id: "p_label_auftraggeber", type: "paragraph", text: "— Auftraggeber —" },

    { id: "p_und", type: "paragraph", text: "und" },

    // ─── Auftragnehmer ───
    { id: "p_worker_name",    type: "paragraph", text: "{{worker.lastName}}, {{worker.firstName}}" },
    { id: "p_worker_dob",     type: "paragraph", text: "Geb.: {{worker.dateOfBirth}}" },
    { id: "p_worker_address", type: "paragraph", text: "{{worker.street}}, {{worker.postalCode}} {{worker.city}}" },
    { id: "p_worker_contact", type: "paragraph", text: "Tel: {{worker.phone}}, E-Mail: {{worker.email}}" },
    { id: "p_label_auftragnehmer", type: "paragraph", text: "— Auftragnehmer —" },
    { id: "p_worker_iban", type: "paragraph", text: "IBAN: {{worker.iban}}" },

    // ─── Präambel ───
    { id: "s_praeambel", type: "section", title: "Präambel", children: [
      { id: "p_praeambel", type: "paragraph",
        text: "Die {{company.name}} bietet die Möglichkeit für einzelne Tage stundenweise Tätigkeiten im Bereich der IMC-Pflege, Anästhesiepflege und ärztlichen Anästhesie anzubieten. Der Auftragnehmer ist bereit, künftig nach Absprache für die Leistungserbringung in seinem Fachbereich auf Abruf stundenweise zur Verfügung zu stehen." },
    ]},

    { id: "s_1", type: "section", title: "1. Vertragsgegenstand", children: [
      { id: "p_1", type: "paragraph",
        text: "Der Auftragnehmer ist {{role.description}}, in der Schweiz anerkannt. Er verpflichtet sich, Leistungen als {{role.roleTitle}} für den Auftraggeber zu erbringen. Der Auftragnehmer erbringt seine Leistungen in eigener fachlicher Verantwortung. Der Auftragnehmer beachtet die Weisungen der Geschäftsleitung. Er hat Pausen (ohne Vergütung) auf Anweisung wahrzunehmen." },
    ]},

    { id: "s_2", type: "section", title: "2. Arbeitsort", children: [
      { id: "p_2", type: "paragraph",
        text: "Der Arbeitsort befindet sich an der {{company.name}}, {{company.address}}." },
    ]},

    { id: "s_3", type: "section", title: "3. Arbeitszeit und Abruf", children: [
      { id: "p_3", type: "paragraph",
        text: "Der Einsatz erfolgt nach Bedarf der Auftraggeberin. Termine, die der Auftragnehmer schriftlich oder per E-Mail bestätigt, sind verbindlich. Die Termine dürfen nur im Krankheitsfall abgesagt werden, wobei der Auftragnehmer möglichst frühzeitig (48h vorher) einen voraussichtlichen Ausfall mitzuteilen hat. Er hat die Auftraggeberin auch über die voraussichtliche Eventualität eines krankheitsbedingten Ausfalls frühzeitig zu informieren, damit rechtzeitig Ersatzpersonal geplant werden kann." },
    ]},

    { id: "s_4", type: "section", title: "4. Vergütung", children: [
      { id: "p_4", type: "paragraph",
        text: "Der Auftragnehmer erhält für die erbrachte Arbeitsleistung einen Bruttolohn pro Stunde in Höhe von {{role.rate}} ({{role.title}}). Die Auszahlung erfolgt im Folgemonat des Einsatzes auf das von dem Auftragnehmer angegebene Bankkonto. Der Auftragnehmer hat den Stundeneinsatz pro Tag von der ärztlichen Leitung bestätigen zu lassen. Am Ende des Monats reicht der Auftragnehmer seine bestätigte Stundenaufstellung zur Abrechnung bei der Auftraggeberin ein." },
    ]},

    { id: "s_5", type: "section", title: "5. Sozialversicherungen", children: [
      { id: "p_5", type: "paragraph",
        text: "Dieser Vertrag unterliegt den gesetzlichen Vorschriften der Sozialversicherungen in der Schweiz. Der Auftraggeber verpflichtet sich, alle erforderlichen Abgaben für AHV, ALV abzuführen. Vom Bruttolohn werden die Auftragnehmerbeiträge in Abzug gebracht." },
    ]},

    { id: "s_6", type: "section", title: "6. Einschluss und Abgeltung von Ferienansprüchen und Lohnfortzahlung", children: [
      { id: "p_6", type: "paragraph",
        text: "Angesichts der kurzen Dauer der Arbeitseinsätze werden der Ferienanspruch sowie der Anspruch auf Lohnfortzahlung bei unverschuldeter Verhinderung an der Arbeitsleistung (Krankheit, Unfall, usw.) durch den vereinbarten Bruttolohn abgegolten. Für Feiertage und bezahlte Absenzen besteht kein besonderer Lohnanspruch, da die entsprechende Entschädigung mit Rücksicht auf die kurze Dauer der Arbeitseinsätze im Lohn eingeschlossen ist." },
    ]},

    { id: "s_7", type: "section", title: "7. Vertraulichkeit", children: [
      { id: "p_7", type: "paragraph",
        text: "Der Auftragnehmer verpflichtet sich, alle im Zusammenhang mit seiner Tätigkeit bekannt gewordenen Informationen über den Auftraggeber und dessen Geschäftsabläufe vertraulich zu behandeln und nicht an Dritte weiterzugeben." },
    ]},

    { id: "s_8", type: "section", title: "8. Beendigung des Arbeitsverhältnisses", children: [
      { id: "p_8", type: "paragraph",
        text: "Die Vereinbarung kann mit einer Frist von einem Monat gekündigt werden." },
    ]},

    { id: "s_9", type: "section", title: "9. Weitere Bestimmungen", children: [
      { id: "p_9", type: "paragraph",
        text: "Änderungen oder Ergänzungen dieses Vertrags bedürfen der Schriftform. Mündliche Abreden sind ungültig." },
    ]},

    { id: "s_10", type: "section", title: "10. Recht und Gerichtsstand", children: [
      { id: "p_10", type: "paragraph",
        text: "Soweit nicht die Bestimmungen dieses Vertrags vorgehen, gelten die allgemeinen Bestimmungen des Obligationenrechts. Abänderungen, Ergänzungen oder die Aufhebung des vorliegenden Vertrages sind nur in Schriftform und von beiden Vertragsparteien unterzeichnet rechtsgültig. Sollten Teile dieses Vertrages unwirksam sein, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt. An die Stelle unwirksamer Bestimmungen treten sinngemäss die einschlägigen gesetzlichen Bestimmungen. Auf diesen Arbeitsvertrag ist schweizerisches Recht anwendbar. Der Gerichtsstand ist {{company.jurisdiction}}. Jede Vertragspartei erhält ein Exemplar dieses Vertrages." },
    ]},

    { id: "sig_w", type: "signature", party: "worker",  label: "Auftragnehmer/in" },
    { id: "sig_m", type: "signature", party: "manager", label: "Auftraggeber" },
  ],
};

export const STARTERS = [
  { key: ON_CALL_V1_KEY, name: "On-Call Worker Contract", language: "de" as const, body: ON_CALL_V1_DE },
];
