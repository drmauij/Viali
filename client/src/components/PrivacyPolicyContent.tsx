import { useTranslation } from "react-i18next";

export function PrivacyPolicyContent() {
  const { i18n } = useTranslation();
  const isGerman = i18n.language === "de";

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "1. Verantwortlicher" : "1. Data Controller"}
        </h3>
        <p className="text-muted-foreground">
          Acutiq, {isGerman ? "Inhaber" : "owned by"} Maurizio Betti<br />
          Bruder-Klaus-Str 18, 78467 Konstanz, Germany<br />
          E-Mail: info@acutiq.com
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "2. Erhobene Daten" : "2. Data Collected"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Benutzerdaten: Name, E-Mail-Adresse, Rolle, Krankenhauszugehörigkeit" : "User data: Name, email address, role, hospital affiliation"}</li>
          <li>{isGerman ? "Patientendaten: Gemäß den Anforderungen des medizinischen Dokumentationsbedarfs" : "Patient data: According to medical documentation requirements"}</li>
          <li>{isGerman ? "Protokolldaten: Zugriffsprotokolle, Aktivitätsprotokolle zur Systemsicherheit" : "Log data: Access logs, activity logs for system security"}</li>
          <li>{isGerman ? "Medizinische Dokumentation: Anästhesieprotokolle, Vitalzeichen, Medikation" : "Medical documentation: Anesthesia records, vital signs, medication"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "3. Zweck der Datenverarbeitung" : "3. Purpose of Data Processing"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Bereitstellung der Anästhesie-Dokumentationsdienste" : "Provision of anesthesia documentation services"}</li>
          <li>{isGerman ? "Benutzerauthentifizierung und Zugangskontrolle" : "User authentication and access control"}</li>
          <li>{isGerman ? "Abrechnung und Vertragsabwicklung" : "Billing and contract processing"}</li>
          <li>{isGerman ? "Verbesserung der Servicequalität" : "Service quality improvement"}</li>
          <li>{isGerman ? "Einhaltung gesetzlicher Aufbewahrungspflichten" : "Compliance with legal retention requirements"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "4. Datenspeicherung" : "4. Data Storage"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Alle Daten werden auf Servern von Exoscale in der Schweiz gespeichert" : "All data is stored on Exoscale servers in Switzerland"}</li>
          <li>{isGerman ? "Datenbank: Neon PostgreSQL (EU-Region)" : "Database: Neon PostgreSQL (EU region)"}</li>
          <li>{isGerman ? "Verschlüsselung: Daten werden im Ruhezustand und bei der Übertragung verschlüsselt" : "Encryption: Data is encrypted at rest and in transit"}</li>
          <li>{isGerman ? "Regelmäßige automatische Backups" : "Regular automatic backups"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "5. Betroffenenrechte" : "5. Data Subject Rights"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Auskunftsrecht: Sie haben das Recht zu erfahren, welche Daten über Sie gespeichert sind" : "Right of access: You have the right to know what data is stored about you"}</li>
          <li>{isGerman ? "Berichtigungsrecht: Sie können die Korrektur unrichtiger Daten verlangen" : "Right to rectification: You can request correction of inaccurate data"}</li>
          <li>{isGerman ? "Löschungsrecht: Sie können die Löschung Ihrer Daten verlangen (unter Berücksichtigung gesetzlicher Aufbewahrungspflichten)" : "Right to erasure: You can request deletion of your data (subject to legal retention requirements)"}</li>
          <li>{isGerman ? "Datenübertragbarkeit: Sie können Ihre Daten in einem maschinenlesbaren Format anfordern" : "Data portability: You can request your data in a machine-readable format"}</li>
          <li>{isGerman ? "Widerspruchsrecht: Sie können der Datenverarbeitung widersprechen" : "Right to object: You can object to data processing"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "6. Datenweitergabe" : "6. Data Sharing"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Patientendaten werden nicht an Dritte weitergegeben" : "Patient data is not shared with third parties"}</li>
          <li>{isGerman ? "Auftragsverarbeiter: Stripe (Zahlungsabwicklung), Exoscale (Hosting), Neon (Datenbank)" : "Processors: Stripe (payment processing), Exoscale (hosting), Neon (database)"}</li>
          <li>{isGerman ? "Alle Auftragsverarbeiter erfüllen die DSGVO-Anforderungen" : "All processors comply with GDPR requirements"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "7. DSG/DSGVO-Konformität" : "7. DSG/GDPR Compliance"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Viali.app entspricht dem Schweizer Datenschutzgesetz (DSG) und der EU-DSGVO" : "Viali.app complies with Swiss Data Protection Act (DSG) and EU GDPR"}</li>
          <li>{isGerman ? "Auftragsverarbeitungsverträge (AVV) mit allen Unterauftragsverarbeitern" : "Data Processing Agreements (DPA) with all subprocessors"}</li>
          <li>{isGerman ? "Privacy by Design und Privacy by Default" : "Privacy by Design and Privacy by Default"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "8. Kontakt" : "8. Contact"}
        </h3>
        <p className="text-muted-foreground">
          {isGerman
            ? "Bei Fragen zum Datenschutz kontaktieren Sie uns unter: info@acutiq.com"
            : "For privacy questions, contact us at: info@acutiq.com"}
        </p>
      </div>
    </div>
  );
}
