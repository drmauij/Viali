import { useTranslation } from "react-i18next";

export function TermsOfUseContent() {
  const { t, i18n } = useTranslation();
  const isGerman = i18n.language === "de";

  return (
    <div className="space-y-6 text-sm">
        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "1. Anbieter" : "1. Provider"}
          </h3>
          <p className="text-muted-foreground">
            Acutiq, {isGerman ? "Inhaber" : "owned by"} Maurizio Betti<br />
            Bruder-Klaus-Str 18, 78467 Konstanz, Germany<br />
            Service: https://use.viali.app
          </p>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "2. Leistungen" : "2. Services"}
          </h3>
          <ul className="list-disc list-inside text-muted-foreground">
            <li>{isGerman ? "Digitale Anästhesie-Protokolle (Pre-OP, OP, PACU)" : "Digital anesthesia protocols (Pre-OP, OP, PACU)"}</li>
            <li>{isGerman ? "Bestandsverwaltungssystem (Medikamente, Material, BTM)" : "Inventory management (medications, materials, controlled substances)"}</li>
            <li>{isGerman ? "Cloud-Hosting inklusive (Exoscale Shared Server, Schweiz)" : "Cloud hosting included (Exoscale Shared Server, Switzerland)"}</li>
            <li>{isGerman ? "Backups & Updates" : "Backups & updates"}</li>
            <li>{isGerman ? "Optionale Zusatzmodule (siehe Preisübersicht im Abrechnungsbereich)" : "Optional add-on modules (see pricing overview in billing section)"}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "3. Abrechnung & Zahlung" : "3. Billing & Payment"}
          </h3>
          <ul className="list-disc list-inside text-muted-foreground">
            <li>{isGerman ? "Aktuelle Preise werden im Abrechnungsbereich angezeigt" : "Current pricing is displayed in the billing section"}</li>
            <li>{isGerman ? "Monatliche Abrechnung nach tatsächlicher Nutzung" : "Monthly billing based on actual usage"}</li>
            <li>{isGerman ? "Zahlung per Kreditkarte (in-app)" : "Credit card payment (in-app)"}</li>
            <li>{isGerman ? "Alle Preise verstehen sich netto. MwSt. kann je nach Standort anfallen" : "All prices are net. VAT may apply depending on location"}</li>
            <li>{isGerman ? "Monatlich kündbar" : "Monthly cancellation possible"}</li>
            <li>{isGerman ? "Preisänderungen mit 3 Monaten Ankündigungsfrist" : "Price changes with 3 months notice"}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "4. Dateneigentum & Datenschutz" : "4. Data Ownership & Privacy"}
          </h3>
          <ul className="list-disc list-inside text-muted-foreground">
            <li>{isGerman ? "Patientendaten bleiben ausschließliches Eigentum der Klinik" : "Patient data remains exclusive property of the clinic"}</li>
            <li>{isGerman ? "Unterliegt der Schweizer DSGVO-Gesetzgebung" : "Subject to Swiss GDPR legislation"}</li>
            <li>{isGerman ? "Gehostet auf Exoscale-Servern (Schweiz)" : "Hosted on Exoscale servers (Switzerland)"}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "5. Sicherheit & Haftungsbeschränkung" : "5. Security & Limitation of Liability"}
          </h3>
          <ul className="list-disc list-inside text-muted-foreground">
            <li>{isGerman ? "Anbieter implementiert angemessene Sicherheitsmaßnahmen und regelmäßige Backups" : "Provider implements reasonable security measures and regular backups"}</li>
            <li>{isGerman ? "Keine Haftung für Datenverlust, Sicherheitsverletzungen oder Schäden durch Software-Fehler oder unsachgemäße Kontonutzung" : "No liability for data loss, breaches, or damages from software bugs or improper account use"}</li>
            <li>{isGerman ? "Maximale Haftung begrenzt auf die in den letzten 12 Monaten gezahlten Gebühren" : "Maximum liability limited to fees paid in prior 12 months"}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "6. Support" : "6. Support"}
          </h3>
          <ul className="list-disc list-inside text-muted-foreground">
            <li>{isGerman ? "Kritische Events: 2h erste Reaktion" : "Critical events: 2h initial response"}</li>
            <li>{isGerman ? "Mo-Fr 8-18 Uhr CET via In-App/E-Mail" : "Mon-Fri 8-18 CET via in-app/email"}</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-base mb-2">
            {isGerman ? "7. Gerichtsstand" : "7. Jurisdiction"}
          </h3>
          <p className="text-muted-foreground">
            {isGerman 
              ? "Für alle Streitigkeiten sind die Gerichte in Konstanz, Deutschland zuständig."
              : "All disputes are handled by the courts in Konstanz, Germany."}
          </p>
        </div>
      </div>
  );
}
