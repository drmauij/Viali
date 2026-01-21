import { useTranslation } from "react-i18next";

export function AVVContent() {
  const { i18n } = useTranslation();
  const isGerman = i18n.language === "de";

  return (
    <div className="space-y-6 text-sm">
      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "1. Gegenstand und Dauer der Verarbeitung" : "1. Subject Matter and Duration of Processing"}
        </h3>
        <p className="text-muted-foreground">
          {isGerman
            ? "Dieser Auftragsverarbeitungsvertrag (AVV) regelt die Verarbeitung personenbezogener Daten durch Acutiq (Auftragsverarbeiter) im Auftrag der Klinik (Verantwortlicher) im Rahmen der Nutzung der Viali.app Plattform. Die Verarbeitung dauert für die gesamte Vertragslaufzeit."
            : "This Data Processing Agreement (DPA) governs the processing of personal data by Acutiq (Processor) on behalf of the clinic (Controller) in connection with the use of the Viali.app platform. Processing continues for the entire contract term."}
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "2. Art und Zweck der Verarbeitung" : "2. Nature and Purpose of Processing"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Speicherung und Verarbeitung von Anästhesie-Dokumentation" : "Storage and processing of anesthesia documentation"}</li>
          <li>{isGerman ? "Bereitstellung der webbasierten Anwendung" : "Provision of the web-based application"}</li>
          <li>{isGerman ? "Durchführung von Backups und Systemwartung" : "Performing backups and system maintenance"}</li>
          <li>{isGerman ? "Technischer Support und Fehlerbehebung" : "Technical support and troubleshooting"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "3. Art der personenbezogenen Daten" : "3. Type of Personal Data"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Patientenstammdaten (Name, Geburtsdatum, Gewicht)" : "Patient master data (name, date of birth, weight)"}</li>
          <li>{isGerman ? "Gesundheitsdaten (Vitalzeichen, Diagnosen, Medikation)" : "Health data (vital signs, diagnoses, medication)"}</li>
          <li>{isGerman ? "Benutzerdaten (Name, E-Mail, Benutzerrolle)" : "User data (name, email, user role)"}</li>
          <li>{isGerman ? "Audit-Daten (Zugriffsprotokolle, Änderungshistorie)" : "Audit data (access logs, change history)"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "4. Kategorien betroffener Personen" : "4. Categories of Data Subjects"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Patienten der Klinik" : "Patients of the clinic"}</li>
          <li>{isGerman ? "Mitarbeiter der Klinik (Benutzer der Anwendung)" : "Clinic employees (application users)"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "5. Pflichten des Auftragsverarbeiters" : "5. Obligations of the Processor"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Verarbeitung nur nach dokumentierter Weisung des Verantwortlichen" : "Processing only according to documented instructions from the Controller"}</li>
          <li>{isGerman ? "Gewährleistung der Vertraulichkeit durch alle Mitarbeiter" : "Ensuring confidentiality by all employees"}</li>
          <li>{isGerman ? "Ergreifung angemessener technischer und organisatorischer Maßnahmen" : "Implementing appropriate technical and organizational measures"}</li>
          <li>{isGerman ? "Unterstützung bei der Erfüllung von Betroffenenrechten" : "Support in fulfilling data subject rights"}</li>
          <li>{isGerman ? "Meldung von Datenschutzverletzungen innerhalb von 24 Stunden" : "Notification of data breaches within 24 hours"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "6. Technische und organisatorische Maßnahmen" : "6. Technical and Organizational Measures"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Verschlüsselung aller Daten bei Übertragung (TLS 1.3) und Speicherung" : "Encryption of all data in transit (TLS 1.3) and at rest"}</li>
          <li>{isGerman ? "Zugriffskontrolle durch rollenbasierte Berechtigungen" : "Access control through role-based permissions"}</li>
          <li>{isGerman ? "Regelmäßige Sicherheitsaudits und Penetrationstests" : "Regular security audits and penetration tests"}</li>
          <li>{isGerman ? "Automatische Backups mit Geo-Redundanz" : "Automatic backups with geo-redundancy"}</li>
          <li>{isGerman ? "Audit-Trail für alle sicherheitsrelevanten Aktionen" : "Audit trail for all security-relevant actions"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "7. Unterauftragsverarbeiter" : "7. Subprocessors"}
        </h3>
        <p className="text-muted-foreground mb-2">
          {isGerman
            ? "Folgende Unterauftragsverarbeiter werden eingesetzt:"
            : "The following subprocessors are used:"}
        </p>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>Exoscale AG, Schweiz - {isGerman ? "Server-Hosting und Objektspeicher" : "Server hosting and object storage"}</li>
          <li>Exoscale ({isGerman ? "Schweiz" : "Switzerland"}) - {isGerman ? "Datenbank-Hosting" : "Database hosting"}</li>
          <li>Stripe Inc. - {isGerman ? "Zahlungsabwicklung (keine Patientendaten)" : "Payment processing (no patient data)"}</li>
          <li>Resend Inc. - {isGerman ? "E-Mail-Versand (nur Systembenachrichtigungen)" : "Email delivery (system notifications only)"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "8. Löschung und Rückgabe von Daten" : "8. Deletion and Return of Data"}
        </h3>
        <ul className="list-disc list-inside text-muted-foreground">
          <li>{isGerman ? "Nach Vertragsende: Löschung aller Daten innerhalb von 30 Tagen" : "After contract termination: Deletion of all data within 30 days"}</li>
          <li>{isGerman ? "Auf Wunsch: Export aller Daten vor Löschung" : "Upon request: Export of all data before deletion"}</li>
          <li>{isGerman ? "Schriftliche Bestätigung der Löschung auf Anfrage" : "Written confirmation of deletion upon request"}</li>
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">
          {isGerman ? "9. Kontrollrechte" : "9. Audit Rights"}
        </h3>
        <p className="text-muted-foreground">
          {isGerman
            ? "Der Verantwortliche hat das Recht, die Einhaltung dieses Vertrags zu überprüfen. Dies kann durch Einsichtnahme in Zertifizierungen, Berichte oder nach Vereinbarung durch Vor-Ort-Audits erfolgen."
            : "The Controller has the right to verify compliance with this agreement. This can be done by reviewing certifications, reports, or by on-site audits upon agreement."}
        </p>
      </div>
    </div>
  );
}
