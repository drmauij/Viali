import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import SignaturePad from "@/components/SignaturePad";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  FileText, 
  Download, 
  Pen, 
  Link2, 
  Copy, 
  Check, 
  Loader2, 
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Building2,
  CreditCard,
  Briefcase,
  Eye,
  Archive,
  ArchiveRestore,
  Mail
} from "lucide-react";

interface WorkerContract {
  id: string;
  hospitalId: string;
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  phone: string | null;
  email: string;
  dateOfBirth: string;
  iban: string;
  role: "awr_nurse" | "anesthesia_nurse" | "anesthesia_doctor";
  status: "pending_manager_signature" | "signed" | "rejected";
  workerSignature: string | null;
  workerSignedAt: string | null;
  workerSignatureLocation: string | null;
  managerSignature: string | null;
  managerSignedAt: string | null;
  managerId: string | null;
  managerName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanyData {
  companyName: string;
  companyStreet: string;
  companyPostalCode: string;
  companyCity: string;
  companyPhone: string;
  companyFax: string;
  companyEmail: string;
  companyLogoUrl: string;
}

const roleInfo = {
  awr_nurse: {
    title: "Tagesklinik Pflege (AWR-Nurse)",
    rate: "CHF 75.00",
    description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Intensivpflege",
    roleTitle: "IMC-Pfleger im Aufwachraum",
  },
  anesthesia_nurse: {
    title: "Pflege-Anästhesist",
    rate: "CHF 80.00",
    description: "diplomierter Pflegefachmann mit Zusatzausbildung Experte Anästhesiepflege",
    roleTitle: "Anästhesiepfleger",
  },
  anesthesia_doctor: {
    title: "Arzt Anästhesie",
    rate: "CHF 150.00",
    description: "Facharzt Anästhesiologie, in der Schweiz anerkannt",
    roleTitle: "Anästhesiearzt",
  },
};

function ContractPreview({ 
  contract, 
  companyData,
  showSignatures = false 
}: { 
  contract: WorkerContract; 
  companyData: CompanyData;
  showSignatures?: boolean;
}) {
  const role = roleInfo[contract.role];
  
  return (
    <div className="bg-white border rounded-lg p-6 text-sm space-y-4">
      <h3 className="text-center font-bold text-lg">Vertrag für Kurzzeiteinsätze auf Abruf</h3>
      
      <div>
        <p className="mb-2">zwischen</p>
        <p className="font-semibold">{companyData.companyName}</p>
        <p>{companyData.companyStreet}, {companyData.companyPostalCode} {companyData.companyCity}</p>
        <p className="italic text-gray-600">- Auftraggeber -</p>
      </div>
      
      <div>
        <p className="mb-2">und</p>
        <p className="font-semibold">{contract.lastName}, {contract.firstName}</p>
        <p>{contract.street}, {contract.postalCode} {contract.city}</p>
        <p>Tel: {contract.phone || "-"}, E-Mail: {contract.email}</p>
        <p className="italic text-gray-600">- Auftragnehmer -</p>
      </div>
      
      <div>
        <p><strong>IBAN:</strong> {contract.iban}</p>
        <p><strong>Geb.:</strong> {contract.dateOfBirth}</p>
      </div>

      <Separator />

      <div>
        <h4 className="font-bold mb-1">Präambel</h4>
        <p className="text-gray-700">
          Die {companyData.companyName} bietet die Möglichkeit für einzelne Tage stundenweise Tätigkeiten im Bereich der IMC-Pflege, Anästhesiepflege und ärztlichen Anästhesie anzubieten. Der Auftragnehmer ist bereit, künftig nach Absprache für die Leistungserbringung in seinem Fachbereich auf Abruf stundenweise zur Verfügung zu stehen.
        </p>
      </div>
      
      <div>
        <h4 className="font-bold mb-1">1. Vertragsgegenstand</h4>
        <p className="text-gray-700">
          Der Auftragnehmer ist {role.description}, in der Schweiz anerkannt. Er verpflichtet sich, Leistungen als {role.roleTitle} für den Auftraggeber zu erbringen. Der Auftragnehmer erbringt seine Leistungen in eigener fachlicher Verantwortung. Der Auftragnehmer beachtet die Weisungen der Geschäftsleitung und der Leitenden Chirurgin (Dr. med. Lena Schumann). Er hat Pausen (ohne Vergütung) auf Anweisung wahrzunehmen.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">2. Arbeitsort</h4>
        <p className="text-gray-700">
          Der Arbeitsort befindet sich an der {companyData.companyName}, {companyData.companyStreet}, {companyData.companyPostalCode} {companyData.companyCity}.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">3. Arbeitszeit und Abruf</h4>
        <p className="text-gray-700">
          Der Einsatz erfolgt nach Bedarf der Auftraggeberin. Termine, die der Auftragnehmer schriftlich oder per E-Mail bestätigt, sind verbindlich. Die Termine dürfen nur im Krankheitsfall abgesagt werden, wobei der Auftragnehmer möglichst frühzeitig (48h vorher) einen voraussichtlichen Ausfall mitzuteilen hat. Er hat die Auftraggeberin auch über die voraussichtliche Eventualität eines krankheitsbedingten Ausfalls frühzeitig zu informieren, damit rechtzeitig Ersatzpersonal geplant werden kann.
        </p>
      </div>
      
      <div>
        <h4 className="font-bold mb-1">4. Vergütung</h4>
        <p className="text-gray-700">
          Der Auftragnehmer erhält für die erbrachte Arbeitsleistung einen Bruttolohn pro Stunde in Höhe von <strong>{role.rate}</strong> ({role.title}). Die Auszahlung erfolgt im Folgemonat des Einsatzes auf das von dem Auftragnehmer angegebene Bankkonto. Der Auftragnehmer hat den Stundeneinsatz pro Tag von der ärztlichen Leitung (Dr. med. Lena Schumann) bestätigen zu lassen. Am Ende des Monats reicht der Auftragnehmer seine bestätigte Stundenaufstellung zur Abrechnung bei der Auftraggeberin ein.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">5. Sozialversicherungen</h4>
        <p className="text-gray-700">
          Dieser Vertrag unterliegt den gesetzlichen Vorschriften der Sozialversicherungen in der Schweiz. Der Auftraggeber verpflichtet sich, alle erforderlichen Abgaben für AHV, ALV abzuführen. Vom Bruttolohn werden die Auftragnehmerbeiträge in Abzug gebracht.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">6. Einschluss und Abgeltung von Ferienansprüchen und Lohnfortzahlung</h4>
        <p className="text-gray-700">
          Angesichts der kurzen Dauer der Arbeitseinsätze werden der Ferienanspruch sowie der Anspruch auf Lohnfortzahlung bei unverschuldeter Verhinderung an der Arbeitsleistung (Krankheit, Unfall, usw.) durch den vereinbarten Bruttolohn abgegolten. Für Feiertage und bezahlte Absenzen besteht kein besonderer Lohnanspruch, da die entsprechende Entschädigung mit Rücksicht auf die kurze Dauer der Arbeitseinsätze im Lohn eingeschlossen ist.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">7. Vertraulichkeit</h4>
        <p className="text-gray-700">
          Der Auftragnehmer verpflichtet sich, alle im Zusammenhang mit seiner Tätigkeit bekannt gewordenen Informationen über den Auftraggeber und dessen Geschäftsabläufe vertraulich zu behandeln und nicht an Dritte weiterzugeben.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">8. Beendigung des Arbeitsverhältnisses</h4>
        <p className="text-gray-700">
          Die Vereinbarung kann mit einer Frist von einem Monat gekündigt werden.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">9. Weitere Bestimmungen</h4>
        <p className="text-gray-700">
          Änderungen oder Ergänzungen dieses Vertrags bedürfen der Schriftform. Mündliche Abreden sind ungültig.
        </p>
      </div>

      <div>
        <h4 className="font-bold mb-1">10. Recht und Gerichtsstand</h4>
        <p className="text-gray-700">
          Soweit nicht die Bestimmungen dieses Vertrags vorgehen, gelten die allgemeinen Bestimmungen des Obligationenrechts. Abänderungen, Ergänzungen oder die Aufhebung des vorliegenden Vertrages sind nur in Schriftform und von beiden Vertragsparteien unterzeichnet rechtsgültig. Sollten Teile dieses Vertrages unwirksam sein, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt. An die Stelle unwirksamer Bestimmungen treten sinngemäss die einschlägigen gesetzlichen Bestimmungen. Auf diesen Arbeitsvertrag ist schweizerisches Recht anwendbar. Der Gerichtsstand ist Kreuzlingen. Jede Vertragspartei erhält ein Exemplar dieses Vertrages.
        </p>
      </div>

      {showSignatures && (
        <>
          <Separator />
          <div className="grid grid-cols-2 gap-8 pt-4">
            <div>
              <p className="text-sm text-gray-500 mb-2">Auftragnehmer/in</p>
              {contract.workerSignature ? (
                <>
                  <img 
                    src={contract.workerSignature} 
                    alt="Unterschrift Mitarbeiter" 
                    className="h-16 border rounded bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {contract.workerSignatureLocation}, {format(new Date(contract.workerSignedAt || contract.createdAt), 'dd.MM.yyyy', { locale: de })}
                  </p>
                </>
              ) : (
                <p className="text-gray-400 italic">Keine Unterschrift</p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-2">Auftraggeber ({companyData.companyName})</p>
              {contract.managerSignature ? (
                <>
                  <img 
                    src={contract.managerSignature} 
                    alt="Unterschrift Manager" 
                    className="h-16 border rounded bg-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {contract.managerName}, {format(new Date(contract.managerSignedAt!), 'dd.MM.yyyy', { locale: de })}
                  </p>
                </>
              ) : (
                <p className="text-gray-400 italic">Warte auf Gegenzeichnung</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Contracts() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedContract, setSelectedContract] = useState<WorkerContract | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;

  const { data: contracts = [], isLoading: isLoadingContracts } = useQuery<WorkerContract[]>({
    queryKey: ['/api/business', hospitalId, 'contracts'],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/contracts`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch contracts');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: contractToken, refetch: refetchToken } = useQuery({
    queryKey: ['/api/business', hospitalId, 'contract-token'],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/contract-token`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch token');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: companyData } = useQuery<CompanyData>({
    queryKey: ['/api/clinic', hospitalId, 'company-data'],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/company-data`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch company data');
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const signContractMutation = useMutation({
    mutationFn: async ({ contractId, signature }: { contractId: string; signature: string }) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/sign`, { signature });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vertrag unterzeichnet", description: "Der Vertrag wurde erfolgreich unterzeichnet." });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
      setShowSignDialog(false);
      setSelectedContract(null);
    },
    onError: () => {
      toast({ title: "Fehler", description: "Der Vertrag konnte nicht unterzeichnet werden.", variant: "destructive" });
    },
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contract-token/regenerate`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Link erneuert", description: "Der Vertragslink wurde erneuert." });
      refetchToken();
    },
  });

  const archiveContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/archive`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vertrag archiviert", description: "Der Vertrag wurde erfolgreich archiviert." });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Der Vertrag konnte nicht archiviert werden.", variant: "destructive" });
    },
  });

  const unarchiveContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/unarchive`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Vertrag wiederhergestellt", description: "Der Vertrag wurde erfolgreich wiederhergestellt." });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Der Vertrag konnte nicht wiederhergestellt werden.", variant: "destructive" });
    },
  });

  const sendContractEmailMutation = useMutation({
    mutationFn: async ({ contractId, pdfBase64 }: { contractId: string; pdfBase64: string }) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/send-email`, { pdfBase64 });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "E-Mail gesendet", description: "Der Vertrag wurde erfolgreich per E-Mail gesendet." });
    },
    onError: () => {
      toast({ title: "Fehler", description: "Die E-Mail konnte nicht gesendet werden.", variant: "destructive" });
    },
  });

  const activeContracts = contracts.filter(c => !c.archivedAt);
  const archivedContracts = contracts.filter(c => !!c.archivedAt);
  const pendingContracts = activeContracts.filter(c => c.status === 'pending_manager_signature');
  const signedContracts = activeContracts.filter(c => c.status === 'signed');

  const contractLink = contractToken?.contractToken 
    ? `${window.location.origin}/contract/${contractToken.contractToken}`
    : null;

  const handleCopyLink = () => {
    if (contractLink) {
      navigator.clipboard.writeText(contractLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link kopiert", description: "Der Vertragslink wurde in die Zwischenablage kopiert." });
    }
  };

  const handleSignContract = (signature: string) => {
    if (selectedContract) {
      signContractMutation.mutate({ contractId: selectedContract.id, signature });
    }
    setShowSignaturePad(false);
  };

  const generateContractPDF = async (contract: WorkerContract) => {
    if (!companyData) return;

    const doc = new jsPDF();
    const role = roleInfo[contract.role];

    let yPos = 20;
    
    if (companyData.companyLogoUrl) {
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'Anonymous';
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = companyData.companyLogoUrl;
        });
        
        const scaleFactor = 4;
        const canvas = document.createElement('canvas');
        const origWidth = logoImg.naturalWidth || logoImg.width;
        const origHeight = logoImg.naturalHeight || logoImg.height;
        canvas.width = origWidth * scaleFactor;
        canvas.height = origHeight * scaleFactor;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
        }
        
        const maxLogoWidth = 60;
        const maxLogoHeight = 30;
        const aspectRatio = origWidth / origHeight;
        let logoWidth = maxLogoWidth;
        let logoHeight = logoWidth / aspectRatio;
        if (logoHeight > maxLogoHeight) {
          logoHeight = maxLogoHeight;
          logoWidth = logoHeight * aspectRatio;
        }
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoX = (pageWidth - logoWidth) / 2;
        const flattenedLogoUrl = canvas.toDataURL('image/png');
        doc.addImage(flattenedLogoUrl, 'PNG', logoX, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 10;
      } catch (e) {
        console.warn('Failed to load logo:', e);
      }
    }

    doc.setFontSize(16);
    doc.setFont(undefined as any, 'bold');
    doc.text("Vertrag für Kurzzeiteinsätze auf Abruf", 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont(undefined as any, 'normal');
    doc.text("zwischen", 20, yPos);
    yPos += 8;

    doc.setFont(undefined as any, 'bold');
    doc.text(companyData.companyName || "Klinik", 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'normal');
    doc.text(`${companyData.companyStreet}, ${companyData.companyPostalCode} ${companyData.companyCity}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'italic');
    doc.text("- Auftraggeber -", 20, yPos);
    yPos += 10;

    doc.setFont(undefined as any, 'normal');
    doc.text("und", 20, yPos);
    yPos += 8;

    doc.setFont(undefined as any, 'bold');
    doc.text(`${contract.lastName}, ${contract.firstName}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'normal');
    doc.text(`${contract.street}, ${contract.postalCode} ${contract.city}`, 20, yPos);
    yPos += 5;
    doc.text(`Tel: ${contract.phone || '-'}, E-Mail: ${contract.email}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'italic');
    doc.text("- Auftragnehmer -", 20, yPos);
    yPos += 10;

    doc.setFont(undefined as any, 'normal');
    doc.text(`IBAN: ${contract.iban}`, 20, yPos);
    yPos += 5;
    doc.text(`Geb.: ${contract.dateOfBirth}`, 20, yPos);
    yPos += 15;

    const addSection = (title: string, content: string) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont(undefined as any, 'bold');
      doc.text(title, 20, yPos);
      yPos += 6;
      doc.setFont(undefined as any, 'normal');
      const lines = doc.splitTextToSize(content, 170);
      doc.text(lines, 20, yPos);
      yPos += lines.length * 5 + 8;
    };

    addSection("Präambel", 
      `Die ${companyData.companyName} bietet die Möglichkeit für einzelne Tage stundenweise Tätigkeiten im Bereich der IMC-Pflege, Anästhesiepflege und ärztlichen Anästhesie anzubieten. Der Auftragnehmer ist bereit, künftig nach Absprache für die Leistungserbringung in seinem Fachbereich auf Abruf stundenweise zur Verfügung zu stehen.`
    );

    addSection("1. Vertragsgegenstand", 
      `Der Auftragnehmer ist ${role.description}, in der Schweiz anerkannt. Er verpflichtet sich, Leistungen als ${role.roleTitle} für den Auftraggeber zu erbringen. Der Auftragnehmer erbringt seine Leistungen in eigener fachlicher Verantwortung. Der Auftragnehmer beachtet die Weisungen der Geschäftsleitung und der Leitenden Chirurgin (Dr. med. Lena Schumann). Er hat Pausen (ohne Vergütung) auf Anweisung wahrzunehmen.`
    );

    addSection("2. Arbeitsort", 
      `Der Arbeitsort befindet sich an der ${companyData.companyName}, ${companyData.companyStreet}, ${companyData.companyPostalCode} ${companyData.companyCity}.`
    );

    addSection("3. Arbeitszeit und Abruf", 
      `Der Einsatz erfolgt nach Bedarf der Auftraggeberin. Termine, die der Auftragnehmer schriftlich oder per E-Mail bestätigt, sind verbindlich. Die Termine dürfen nur im Krankheitsfall abgesagt werden, wobei der Auftragnehmer möglichst frühzeitig (48h vorher) einen voraussichtlichen Ausfall mitzuteilen hat. Er hat die Auftraggeberin auch über die voraussichtliche Eventualität eines krankheitsbedingten Ausfalls frühzeitig zu informieren, damit rechtzeitig Ersatzpersonal geplant werden kann.`
    );

    addSection("4. Vergütung", 
      `Der Auftragnehmer erhält für die erbrachte Arbeitsleistung einen Bruttolohn pro Stunde in Höhe von ${role.rate} (${role.title}). Die Auszahlung erfolgt im Folgemonat des Einsatzes auf das von dem Auftragnehmer angegebene Bankkonto. Der Auftragnehmer hat den Stundeneinsatz pro Tag von der ärztlichen Leitung (Dr. med. Lena Schumann) bestätigen zu lassen. Am Ende des Monats reicht der Auftragnehmer seine bestätigte Stundenaufstellung zur Abrechnung bei der Auftraggeberin ein.`
    );

    addSection("5. Sozialversicherungen", 
      `Dieser Vertrag unterliegt den gesetzlichen Vorschriften der Sozialversicherungen in der Schweiz. Der Auftraggeber verpflichtet sich, alle erforderlichen Abgaben für AHV, ALV abzuführen. Vom Bruttolohn werden die Auftragnehmerbeiträge in Abzug gebracht.`
    );

    addSection("6. Einschluss und Abgeltung von Ferienansprüchen und Lohnfortzahlung", 
      `Angesichts der kurzen Dauer der Arbeitseinsätze werden der Ferienanspruch sowie der Anspruch auf Lohnfortzahlung bei unverschuldeter Verhinderung an der Arbeitsleistung (Krankheit, Unfall, usw.) durch den vereinbarten Bruttolohn abgegolten. Für Feiertage und bezahlte Absenzen besteht kein besonderer Lohnanspruch, da die entsprechende Entschädigung mit Rücksicht auf die kurze Dauer der Arbeitseinsätze im Lohn eingeschlossen ist.`
    );

    addSection("7. Vertraulichkeit", 
      `Der Auftragnehmer verpflichtet sich, alle im Zusammenhang mit seiner Tätigkeit bekannt gewordenen Informationen über den Auftraggeber und dessen Geschäftsabläufe vertraulich zu behandeln und nicht an Dritte weiterzugeben.`
    );

    addSection("8. Beendigung des Arbeitsverhältnisses", 
      `Die Vereinbarung kann mit einer Frist von einem Monat gekündigt werden.`
    );

    addSection("9. Weitere Bestimmungen", 
      `Änderungen oder Ergänzungen dieses Vertrags bedürfen der Schriftform. Mündliche Abreden sind ungültig.`
    );

    addSection("10. Recht und Gerichtsstand", 
      `Soweit nicht die Bestimmungen dieses Vertrags vorgehen, gelten die allgemeinen Bestimmungen des Obligationenrechts. Abänderungen, Ergänzungen oder die Aufhebung des vorliegenden Vertrages sind nur in Schriftform und von beiden Vertragsparteien unterzeichnet rechtsgültig. Sollten Teile dieses Vertrages unwirksam sein, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt. An die Stelle unwirksamer Bestimmungen treten sinngemäss die einschlägigen gesetzlichen Bestimmungen. Auf diesen Arbeitsvertrag ist schweizerisches Recht anwendbar. Der Gerichtsstand ist Kreuzlingen. Jede Vertragspartei erhält ein Exemplar dieses Vertrages.`
    );

    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    if (contract.workerSignature) {
      doc.text(`${contract.workerSignatureLocation || 'Ort'}, ${format(new Date(contract.workerSignedAt || contract.createdAt), 'dd.MM.yyyy', { locale: de })}`, 20, yPos);
      yPos += 5;
      doc.text("Auftragnehmer/in", 20, yPos);
      yPos += 3;
      try {
        doc.addImage(contract.workerSignature, 'PNG', 20, yPos, 50, 20);
      } catch (e) {
        console.warn('Failed to add worker signature:', e);
      }
    }

    if (contract.managerSignature && contract.managerSignedAt) {
      doc.text(`Kreuzlingen, ${format(new Date(contract.managerSignedAt), 'dd.MM.yyyy', { locale: de })}`, 120, yPos - 8);
      doc.text(companyData.companyName || "Klinik", 120, yPos - 3);
      doc.text(contract.managerName || "Manager", 120, yPos + 2);
      try {
        doc.addImage(contract.managerSignature, 'PNG', 120, yPos + 5, 50, 20);
      } catch (e) {
        console.warn('Failed to add manager signature:', e);
      }
    }

    doc.save(`Vertrag_${contract.lastName}_${contract.firstName}_${format(new Date(contract.createdAt), 'yyyy-MM-dd')}.pdf`);
  };

  const generateContractPDFBase64 = async (contract: WorkerContract): Promise<string | null> => {
    if (!companyData) return null;

    const doc = new jsPDF();
    const role = roleInfo[contract.role];

    let yPos = 20;
    
    if (companyData.companyLogoUrl) {
      try {
        const logoImg = new Image();
        logoImg.crossOrigin = 'Anonymous';
        await new Promise<void>((resolve, reject) => {
          logoImg.onload = () => resolve();
          logoImg.onerror = () => reject();
          logoImg.src = companyData.companyLogoUrl;
        });
        
        const scaleFactor = 4;
        const canvas = document.createElement('canvas');
        const origWidth = logoImg.naturalWidth || logoImg.width;
        const origHeight = logoImg.naturalHeight || logoImg.height;
        canvas.width = origWidth * scaleFactor;
        canvas.height = origHeight * scaleFactor;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(logoImg, 0, 0, canvas.width, canvas.height);
        }
        
        const maxLogoWidth = 60;
        const maxLogoHeight = 30;
        const aspectRatio = origWidth / origHeight;
        let logoWidth = maxLogoWidth;
        let logoHeight = logoWidth / aspectRatio;
        if (logoHeight > maxLogoHeight) {
          logoHeight = maxLogoHeight;
          logoWidth = logoHeight * aspectRatio;
        }
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const logoX = (pageWidth - logoWidth) / 2;
        const flattenedLogoUrl = canvas.toDataURL('image/png');
        doc.addImage(flattenedLogoUrl, 'PNG', logoX, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 10;
      } catch (e) {
        console.warn('Failed to load logo:', e);
      }
    }

    doc.setFontSize(16);
    doc.setFont(undefined as any, 'bold');
    doc.text("Vertrag für Kurzzeiteinsätze auf Abruf", 105, yPos, { align: 'center' });
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont(undefined as any, 'normal');
    doc.text("zwischen", 20, yPos);
    yPos += 8;

    doc.setFont(undefined as any, 'bold');
    doc.text(companyData.companyName || "Klinik", 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'normal');
    doc.text(`${companyData.companyStreet}, ${companyData.companyPostalCode} ${companyData.companyCity}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'italic');
    doc.text("- Auftraggeber -", 20, yPos);
    yPos += 10;

    doc.setFont(undefined as any, 'normal');
    doc.text("und", 20, yPos);
    yPos += 8;

    doc.setFont(undefined as any, 'bold');
    doc.text(`${contract.lastName}, ${contract.firstName}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'normal');
    doc.text(`${contract.street}, ${contract.postalCode} ${contract.city}`, 20, yPos);
    yPos += 5;
    doc.text(`Tel: ${contract.phone || '-'}, E-Mail: ${contract.email}`, 20, yPos);
    yPos += 5;
    doc.setFont(undefined as any, 'italic');
    doc.text("- Auftragnehmer -", 20, yPos);
    yPos += 10;

    doc.setFont(undefined as any, 'normal');
    doc.text(`IBAN: ${contract.iban}`, 20, yPos);
    yPos += 5;
    doc.text(`Geb.: ${contract.dateOfBirth}`, 20, yPos);
    yPos += 15;

    const addSection = (title: string, content: string) => {
      if (yPos > 260) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFont(undefined as any, 'bold');
      doc.text(title, 20, yPos);
      yPos += 6;
      doc.setFont(undefined as any, 'normal');
      const lines = doc.splitTextToSize(content, 170);
      doc.text(lines, 20, yPos);
      yPos += lines.length * 5 + 8;
    };

    addSection("Präambel", 
      `Die ${companyData.companyName} bietet die Möglichkeit für einzelne Tage stundenweise Tätigkeiten im Bereich der IMC-Pflege, Anästhesiepflege und ärztlichen Anästhesie anzubieten. Der Auftragnehmer ist bereit, künftig nach Absprache für die Leistungserbringung in seinem Fachbereich auf Abruf stundenweise zur Verfügung zu stehen.`
    );

    addSection("1. Vertragsgegenstand", 
      `Der Auftragnehmer ist ${role.description}, in der Schweiz anerkannt. Er verpflichtet sich, Leistungen als ${role.roleTitle} für den Auftraggeber zu erbringen. Der Auftragnehmer erbringt seine Leistungen in eigener fachlicher Verantwortung. Der Auftragnehmer beachtet die Weisungen der Geschäftsleitung und der Leitenden Chirurgin (Dr. med. Lena Schumann). Er hat Pausen (ohne Vergütung) auf Anweisung wahrzunehmen.`
    );

    addSection("2. Arbeitsort", 
      `Der Arbeitsort befindet sich an der ${companyData.companyName}, ${companyData.companyStreet}, ${companyData.companyPostalCode} ${companyData.companyCity}.`
    );

    addSection("3. Arbeitszeit und Abruf", 
      `Der Einsatz erfolgt nach Bedarf der Auftraggeberin. Termine, die der Auftragnehmer schriftlich oder per E-Mail bestätigt, sind verbindlich. Die Termine dürfen nur im Krankheitsfall abgesagt werden, wobei der Auftragnehmer möglichst frühzeitig (48h vorher) einen voraussichtlichen Ausfall mitzuteilen hat. Er hat die Auftraggeberin auch über die voraussichtliche Eventualität eines krankheitsbedingten Ausfalls frühzeitig zu informieren, damit rechtzeitig Ersatzpersonal geplant werden kann.`
    );

    addSection("4. Vergütung", 
      `Der Auftragnehmer erhält für die erbrachte Arbeitsleistung einen Bruttolohn pro Stunde in Höhe von ${role.rate} (${role.title}). Die Auszahlung erfolgt im Folgemonat des Einsatzes auf das von dem Auftragnehmer angegebene Bankkonto. Der Auftragnehmer hat den Stundeneinsatz pro Tag von der ärztlichen Leitung (Dr. med. Lena Schumann) bestätigen zu lassen. Am Ende des Monats reicht der Auftragnehmer seine bestätigte Stundenaufstellung zur Abrechnung bei der Auftraggeberin ein.`
    );

    addSection("5. Sozialversicherungen", 
      `Dieser Vertrag unterliegt den gesetzlichen Vorschriften der Sozialversicherungen in der Schweiz. Der Auftraggeber verpflichtet sich, alle erforderlichen Abgaben für AHV, ALV abzuführen. Vom Bruttolohn werden die Auftragnehmerbeiträge in Abzug gebracht.`
    );

    addSection("6. Einschluss und Abgeltung von Ferienansprüchen und Lohnfortzahlung", 
      `Angesichts der kurzen Dauer der Arbeitseinsätze werden der Ferienanspruch sowie der Anspruch auf Lohnfortzahlung bei unverschuldeter Verhinderung an der Arbeitsleistung (Krankheit, Unfall, usw.) durch den vereinbarten Bruttolohn abgegolten. Für Feiertage und bezahlte Absenzen besteht kein besonderer Lohnanspruch, da die entsprechende Entschädigung mit Rücksicht auf die kurze Dauer der Arbeitseinsätze im Lohn eingeschlossen ist.`
    );

    addSection("7. Vertraulichkeit", 
      `Der Auftragnehmer verpflichtet sich, alle im Zusammenhang mit seiner Tätigkeit bekannt gewordenen Informationen über den Auftraggeber und dessen Geschäftsabläufe vertraulich zu behandeln und nicht an Dritte weiterzugeben.`
    );

    addSection("8. Beendigung des Arbeitsverhältnisses", 
      `Die Vereinbarung kann mit einer Frist von einem Monat gekündigt werden.`
    );

    addSection("9. Weitere Bestimmungen", 
      `Änderungen oder Ergänzungen dieses Vertrags bedürfen der Schriftform. Mündliche Abreden sind ungültig.`
    );

    addSection("10. Recht und Gerichtsstand", 
      `Soweit nicht die Bestimmungen dieses Vertrags vorgehen, gelten die allgemeinen Bestimmungen des Obligationenrechts. Abänderungen, Ergänzungen oder die Aufhebung des vorliegenden Vertrages sind nur in Schriftform und von beiden Vertragsparteien unterzeichnet rechtsgültig. Sollten Teile dieses Vertrages unwirksam sein, so wird hierdurch die Gültigkeit der übrigen Bestimmungen nicht berührt. An die Stelle unwirksamer Bestimmungen treten sinngemäss die einschlägigen gesetzlichen Bestimmungen. Auf diesen Arbeitsvertrag ist schweizerisches Recht anwendbar. Der Gerichtsstand ist Kreuzlingen. Jede Vertragspartei erhält ein Exemplar dieses Vertrages.`
    );

    if (yPos > 220) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    if (contract.workerSignature) {
      doc.text(`${contract.workerSignatureLocation || 'Ort'}, ${format(new Date(contract.workerSignedAt || contract.createdAt), 'dd.MM.yyyy', { locale: de })}`, 20, yPos);
      yPos += 5;
      doc.text("Auftragnehmer/in", 20, yPos);
      yPos += 3;
      try {
        doc.addImage(contract.workerSignature, 'PNG', 20, yPos, 50, 20);
      } catch (e) {
        console.warn('Failed to add worker signature:', e);
      }
    }

    if (contract.managerSignature && contract.managerSignedAt) {
      doc.text(`Kreuzlingen, ${format(new Date(contract.managerSignedAt), 'dd.MM.yyyy', { locale: de })}`, 120, yPos - 8);
      doc.text(companyData.companyName || "Klinik", 120, yPos - 3);
      doc.text(contract.managerName || "Manager", 120, yPos + 2);
      try {
        doc.addImage(contract.managerSignature, 'PNG', 120, yPos + 5, 50, 20);
      } catch (e) {
        console.warn('Failed to add manager signature:', e);
      }
    }

    // Return base64 without the data:application/pdf;base64, prefix
    const pdfData = doc.output('datauristring');
    return pdfData.split(',')[1];
  };

  const handleSendContractEmail = async (contract: WorkerContract) => {
    if (!contract.email) {
      toast({ title: "Fehler", description: "Keine E-Mail-Adresse vorhanden", variant: "destructive" });
      return;
    }
    
    const pdfBase64 = await generateContractPDFBase64(contract);
    if (!pdfBase64) {
      toast({ title: "Fehler", description: "PDF konnte nicht generiert werden", variant: "destructive" });
      return;
    }
    
    sendContractEmailMutation.mutate({ contractId: contract.id, pdfBase64 });
  };

  const ContractCard = ({ contract, showActions = true }: { contract: WorkerContract; showActions?: boolean }) => {
    const role = roleInfo[contract.role];
    
    return (
      <Card className="hover:shadow-md transition-shadow" data-testid={`card-contract-${contract.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="font-semibold">{contract.firstName} {contract.lastName}</span>
                <Badge variant={contract.status === 'signed' ? 'default' : 'secondary'}>
                  {contract.status === 'signed' ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> Unterschrieben</>
                  ) : contract.status === 'pending_manager_signature' ? (
                    <><Clock className="w-3 h-3 mr-1" /> Warte auf Unterschrift</>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> Abgelehnt</>
                  )}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{role.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <span>{role.rate}/Std.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>{contract.city}</span>
                </div>
                <div className="text-gray-400">
                  Eingereicht: {format(new Date(contract.createdAt), 'dd.MM.yyyy', { locale: de })}
                </div>
              </div>
            </div>
            
            {showActions && (
              <div className="flex gap-2 ml-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedContract(contract);
                    setShowViewDialog(true);
                  }}
                  data-testid={`button-view-contract-${contract.id}`}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                
                {contract.status === 'pending_manager_signature' && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setSelectedContract(contract);
                      setShowSignDialog(true);
                    }}
                    data-testid={`button-sign-contract-${contract.id}`}
                  >
                    <Pen className="w-4 h-4 mr-1" />
                    Unterschreiben
                  </Button>
                )}
                
                {contract.status === 'signed' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateContractPDF(contract)}
                      data-testid={`button-download-contract-${contract.id}`}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                    {contract.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendContractEmail(contract)}
                        disabled={sendContractEmailMutation.isPending}
                        data-testid={`button-email-contract-${contract.id}`}
                        title="Vertrag per E-Mail senden"
                      >
                        {sendContractEmailMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Mail className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </>
                )}
                
                {contract.archivedAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => unarchiveContractMutation.mutate(contract.id)}
                    disabled={unarchiveContractMutation.isPending}
                    data-testid={`button-unarchive-contract-${contract.id}`}
                    title="Wiederherstellen"
                  >
                    <ArchiveRestore className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveContractMutation.mutate(contract.id)}
                    disabled={archiveContractMutation.isPending}
                    data-testid={`button-archive-contract-${contract.id}`}
                    title="Archivieren"
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!hospitalId) {
    return (
      <div className="p-6 text-center text-gray-500">
        Kein Krankenhaus ausgewählt
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mitarbeiterverträge</h1>
          <p className="text-gray-500">Verwalten Sie temporäre Arbeitsverträge</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Vertragslink für Mitarbeiter
          </CardTitle>
          <CardDescription>
            Teilen Sie diesen Link mit temporären Mitarbeitern, um ihnen das Ausfüllen und Unterschreiben des Vertrags zu ermöglichen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input 
              value={contractLink || "Wird geladen..."} 
              readOnly 
              className="font-mono text-sm"
              data-testid="input-contract-link"
            />
            <Button
              variant="outline"
              onClick={handleCopyLink}
              disabled={!contractLink}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              onClick={() => regenerateTokenMutation.mutate()}
              disabled={regenerateTokenMutation.isPending}
              data-testid="button-regenerate-link"
            >
              <RefreshCw className={`w-4 h-4 ${regenerateTokenMutation.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2" data-testid="tab-pending-contracts">
            <Clock className="w-4 h-4" />
            Zu unterschreiben
            {pendingContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="signed" className="gap-2" data-testid="tab-signed-contracts">
            <CheckCircle className="w-4 h-4" />
            Unterschrieben
            {signedContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{signedContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2" data-testid="tab-archived-contracts">
            <Archive className="w-4 h-4" />
            Archiviert
            {archivedContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1">{archivedContracts.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {isLoadingContracts ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : pendingContracts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Keine Verträge zur Unterschrift vorhanden</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingContracts.map(contract => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="signed" className="space-y-4">
          {isLoadingContracts ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : signedContracts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Noch keine unterschriebenen Verträge</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {signedContracts.map(contract => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="space-y-4">
          {isLoadingContracts ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            </div>
          ) : archivedContracts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <Archive className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Keine archivierten Verträge</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {archivedContracts.map(contract => (
                <ContractCard key={contract.id} contract={contract} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vertragsdetails</DialogTitle>
          </DialogHeader>
          {selectedContract && companyData && (
            <div className="space-y-4">
              <ContractPreview 
                contract={selectedContract} 
                companyData={companyData}
                showSignatures={true}
              />
              
              <div className="flex gap-2 pt-4 border-t">
                {selectedContract.status === 'pending_manager_signature' && (
                  <Button
                    onClick={() => {
                      setShowViewDialog(false);
                      setShowSignDialog(true);
                    }}
                    data-testid="button-sign-from-view"
                  >
                    <Pen className="w-4 h-4 mr-2" />
                    Unterschreiben
                  </Button>
                )}
                {selectedContract.status === 'signed' && (
                  <Button
                    variant="outline"
                    onClick={() => generateContractPDF(selectedContract)}
                    data-testid="button-download-from-view"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF herunterladen
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vertrag unterschreiben</DialogTitle>
            <DialogDescription>
              Bitte lesen Sie den Vertrag sorgfältig durch und unterschreiben Sie unten.
            </DialogDescription>
          </DialogHeader>
          {selectedContract && companyData && (
            <div className="space-y-4">
              <ContractPreview 
                contract={selectedContract} 
                companyData={companyData}
                showSignatures={true}
              />
              
              <div className="border-t pt-4">
                <Button 
                  className="w-full"
                  onClick={() => setShowSignaturePad(true)}
                  data-testid="button-open-signature-pad"
                >
                  <Pen className="w-4 h-4 mr-2" />
                  Gegenzeichnung hinzufügen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={handleSignContract}
        title="Ihre Unterschrift"
      />
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs font-medium ${className}`}>{children}</p>;
}
