import { useTranslation } from "react-i18next";

export function AGBContent() {
  const { i18n } = useTranslation();
  const isGerman = i18n.language === "de";

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "1. Geltungsbereich" : "1. Scope"}
        </h3>
        <p className="text-muted-foreground">
          {isGerman
            ? "Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge zwischen Acutiq (Inhaber: Maurizio Betti, Bruder-Klaus-Str 18, 78467 Konstanz, Deutschland) und dem Kunden über die Nutzung der Viali.app Plattform und damit verbundener Dienstleistungen."
            : "These Terms of Service apply to all contracts between Acutiq (Owner: Maurizio Betti, Bruder-Klaus-Str 18, 78467 Konstanz, Germany) and the customer for the use of the Viali.app platform and related services."}
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "2. Leistungsbeschreibung" : "2. Service Description"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Bereitstellung der webbasierten Anästhesie-Dokumentationssoftware" : "Provision of web-based anesthesia documentation software"}</li>
          <li>{isGerman ? "Cloud-Hosting auf Schweizer Servern (Exoscale)" : "Cloud hosting on Swiss servers (Exoscale)"}</li>
          <li>{isGerman ? "Regelmäßige Backups und Wartung" : "Regular backups and maintenance"}</li>
          <li>{isGerman ? "Technischer Support gemäß vereinbartem Serviceumfang" : "Technical support according to agreed service scope"}</li>
          <li>{isGerman ? "Regelmäßige Software-Updates und Verbesserungen" : "Regular software updates and improvements"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "3. Preise und Zahlungsbedingungen" : "3. Pricing and Payment Terms"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Die aktuellen Preise werden im Abrechnungsbereich der Anwendung angezeigt" : "Current prices are displayed in the billing section of the application"}</li>
          <li>{isGerman ? "Abrechnung erfolgt monatlich basierend auf der tatsächlichen Nutzung" : "Billing is monthly based on actual usage"}</li>
          <li>{isGerman ? "Zahlung erfolgt per Kreditkarte über den integrierten Zahlungsanbieter Stripe" : "Payment is made by credit card via the integrated payment provider Stripe"}</li>
          <li>{isGerman ? "Alle Preise verstehen sich netto; Mehrwertsteuer wird je nach Standort berechnet" : "All prices are net; VAT is calculated depending on location"}</li>
          <li>{isGerman ? "Bei Zahlungsverzug behält sich der Anbieter das Recht vor, den Zugang zu sperren" : "In case of payment delay, the provider reserves the right to suspend access"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "4. Vertragslaufzeit und Kündigung" : "4. Contract Term and Termination"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Der Vertrag läuft auf unbestimmte Zeit" : "The contract runs for an indefinite period"}</li>
          <li>{isGerman ? "Kündigung ist jederzeit zum Monatsende möglich" : "Termination is possible at any time at the end of the month"}</li>
          <li>{isGerman ? "Bei Kündigung werden alle Daten nach 30 Tagen gelöscht, sofern nicht anders vereinbart" : "Upon termination, all data will be deleted after 30 days unless otherwise agreed"}</li>
          <li>{isGerman ? "Datenexport ist vor Kündigung auf Anfrage möglich" : "Data export is possible upon request before termination"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "5. Haftungsbeschränkung" : "5. Limitation of Liability"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Der Anbieter haftet nicht für Datenverlust durch höhere Gewalt oder Verschulden Dritter" : "The provider is not liable for data loss due to force majeure or third-party fault"}</li>
          <li>{isGerman ? "Die maximale Haftung ist auf die in den letzten 12 Monaten gezahlten Gebühren begrenzt" : "Maximum liability is limited to fees paid in the last 12 months"}</li>
          <li>{isGerman ? "Der Anbieter übernimmt keine Haftung für fehlerhafte medizinische Entscheidungen basierend auf der Software" : "The provider assumes no liability for incorrect medical decisions based on the software"}</li>
          <li>{isGerman ? "Indirekte Schäden und entgangener Gewinn sind von der Haftung ausgeschlossen" : "Indirect damages and lost profits are excluded from liability"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "6. Verfügbarkeit und Wartung" : "6. Availability and Maintenance"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Angestrebte Verfügbarkeit: 99,5% pro Monat" : "Targeted availability: 99.5% per month"}</li>
          <li>{isGerman ? "Geplante Wartungsarbeiten werden mindestens 48 Stunden im Voraus angekündigt" : "Planned maintenance is announced at least 48 hours in advance"}</li>
          <li>{isGerman ? "Wartungsarbeiten finden bevorzugt außerhalb der Hauptgeschäftszeiten statt" : "Maintenance preferably takes place outside main business hours"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "7. Schlussbestimmungen" : "7. Final Provisions"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Änderungen dieser AGB werden dem Kunden mit einer Frist von 4 Wochen mitgeteilt" : "Changes to these Terms of Service will be notified to the customer with 4 weeks notice"}</li>
          <li>{isGerman ? "Gerichtsstand ist Konstanz, Deutschland" : "Place of jurisdiction is Konstanz, Germany"}</li>
          <li>{isGerman ? "Es gilt deutsches Recht" : "German law applies"}</li>
        </ul>
      </div>
    </div>
  );
}
