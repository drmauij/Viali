import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/dateUtils";
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";
import { ContractDocument } from "@/lib/contractTemplates/ContractDocument";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import type { ContractTemplate } from "@shared/schema";
import SignaturePad from "@/components/SignaturePad";
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
  Mail,
  Settings2,
  ChevronDown
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
  // Template-system fields (Task 1 additions)
  templateId: string | null;
  templateSnapshot: { blocks: any[]; variables: any } | null;
  data: Record<string, unknown> | null;
  publicToken: string | null;
}


export default function Contracts() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedContract, setSelectedContract] = useState<WorkerContract | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [, navigate] = useLocation();
  
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

  const { data: templates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/business', hospitalId, 'contract-templates'],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/contract-templates`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch templates');
      return res.json();
    },
    enabled: !!hospitalId,
  });
  const activeTemplates = templates.filter((tmpl) => tmpl.status === 'active' && tmpl.publicToken);
  const draftTemplateCount = templates.filter((tmpl) => tmpl.status === 'draft').length;
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [showAllLinks, setShowAllLinks] = useState(true);

const signContractMutation = useMutation({
    mutationFn: async ({ contractId, signature }: { contractId: string; signature: string }) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/sign`, { signature });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('business.contracts.toast.signed'), description: t('business.contracts.toast.signedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
      setShowSignDialog(false);
      setSelectedContract(null);
    },
    onError: () => {
      toast({ title: t('business.contracts.toast.signError'), description: t('business.contracts.toast.signErrorDesc'), variant: "destructive" });
    },
  });

  const archiveContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/archive`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('business.contracts.toast.archived'), description: t('business.contracts.toast.archivedDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
    },
    onError: () => {
      toast({ title: t('business.contracts.toast.archiveError'), description: t('business.contracts.toast.archiveErrorDesc'), variant: "destructive" });
    },
  });

  const unarchiveContractMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/unarchive`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('business.contracts.toast.restored'), description: t('business.contracts.toast.restoredDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/business', hospitalId, 'contracts'] });
    },
    onError: () => {
      toast({ title: t('business.contracts.toast.restoreError'), description: t('business.contracts.toast.restoreErrorDesc'), variant: "destructive" });
    },
  });

  const sendContractEmailMutation = useMutation({
    mutationFn: async ({ contractId, pdfBase64 }: { contractId: string; pdfBase64: string }) => {
      const res = await apiRequest('POST', `/api/business/${hospitalId}/contracts/${contractId}/send-email`, { pdfBase64 });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('business.contracts.toast.emailSent'), description: t('business.contracts.toast.emailSentDesc') });
    },
    onError: () => {
      toast({ title: t('business.contracts.toast.emailError'), description: t('business.contracts.toast.emailErrorDesc'), variant: "destructive" });
    },
  });

  const activeContracts = contracts.filter(c => !c.archivedAt);
  const archivedContracts = contracts.filter(c => !!c.archivedAt);
  const pendingContracts = activeContracts.filter(c => c.status === 'pending_manager_signature');
  const signedContracts = activeContracts.filter(c => c.status === 'signed');

  const handleCopyTemplateLink = async (tmpl: ContractTemplate) => {
    if (!tmpl.publicToken) return;
    const url = `${window.location.origin}/contract/t/${tmpl.publicToken}`;
    await navigator.clipboard.writeText(url);
    setCopiedTemplateId(tmpl.id);
    setTimeout(() => setCopiedTemplateId((id) => (id === tmpl.id ? null : id)), 2000);
    toast({ title: t('business.contracts.toast.linkCopied'), description: url });
  };

  const handleSignContract = (signature: string) => {
    if (selectedContract) {
      signContractMutation.mutate({ contractId: selectedContract.id, signature });
    }
    setShowSignaturePad(false);
  };

  const downloadContractPDF = async (contract: WorkerContract) => {
    const snapshot = contract.templateSnapshot;
    const data = contract.data;
    if (!snapshot || !data) {
      toast({ title: t('business.contracts.toast.legacyContract'), variant: "destructive" });
      return;
    }
    const blob = await pdf(
      <ContractDocumentPdf
        blocks={snapshot.blocks}
        data={data}
        workerSignaturePng={contract.workerSignature ?? null}
        managerSignaturePng={contract.managerSignature ?? null}
      />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const lastName = contract.lastName ?? "contract";
    a.download = `${lastName}-${contract.id.slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendContractEmail = async (contract: WorkerContract) => {
    if (!contract.email) {
      toast({ title: t('business.contracts.toast.emailError'), description: t('business.contracts.toast.noEmail'), variant: "destructive" });
      return;
    }
    const snapshot = contract.templateSnapshot;
    const data = contract.data;
    if (!snapshot || !data) {
      toast({ title: t('business.contracts.toast.emailError'), description: t('business.contracts.toast.legacyContract'), variant: "destructive" });
      return;
    }
    const blob = await pdf(
      <ContractDocumentPdf
        blocks={snapshot.blocks}
        data={data}
        workerSignaturePng={contract.workerSignature ?? null}
        managerSignaturePng={contract.managerSignature ?? null}
      />
    ).toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    sendContractEmailMutation.mutate({ contractId: contract.id, pdfBase64 });
  };

  const ContractCard = ({ contract, showActions = true }: { contract: WorkerContract; showActions?: boolean }) => {
    const roleTitle = t(`business.contracts.roles.${contract.role}.title`);
    const roleRate = t(`business.contracts.roles.${contract.role}.rate`);
    
    return (
      <Card className="hover:shadow-md transition-shadow" data-testid={`card-contract-${contract.id}`}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="font-semibold truncate">{contract.firstName} {contract.lastName}</span>
                <Badge variant={contract.status === 'signed' ? 'default' : 'secondary'} className="flex-shrink-0">
                  {contract.status === 'signed' ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> {t('business.contracts.status.signed')}</>
                  ) : contract.status === 'pending_manager_signature' ? (
                    <><Clock className="w-3 h-3 mr-1" /> <span className="hidden sm:inline">{t('business.contracts.status.pendingSignature')}</span><span className="sm:hidden">{t('business.contracts.status.pendingShort')}</span></>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> {t('business.contracts.status.rejected')}</>
                  )}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{roleTitle}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 flex-shrink-0" />
                  <span>{roleRate}{t('business.contracts.card.perHour')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 flex-shrink-0" />
                  <span>{contract.city}</span>
                </div>
                <div className="text-gray-400">
                  {t('business.contracts.card.submitted')}: {formatDate(new Date(contract.createdAt))}
                </div>
              </div>
            </div>
            
            {showActions && (
              <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:ml-4">
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
                    <Pen className="w-4 h-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t('business.contracts.actions.sign')}</span>
                  </Button>
                )}
                
                {contract.status === 'signed' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadContractPDF(contract)}
                      data-testid={`button-download-contract-${contract.id}`}
                    >
                      <Download className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">{t('business.contracts.actions.download')}</span>
                    </Button>
                    {contract.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendContractEmail(contract)}
                        disabled={sendContractEmailMutation.isPending}
                        data-testid={`button-email-contract-${contract.id}`}
                        title={t('business.contracts.actions.sendEmail')}
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
                    title={t('business.contracts.actions.restore')}
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
                    title={t('business.contracts.actions.archive')}
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
        {t('business.contracts.noHospitalSelected')}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('business.contracts.title')}</h1>
          <p className="text-gray-500">{t('business.contracts.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate('/business/contracts/templates')}
          data-testid="button-manage-templates"
        >
          <Settings2 className="w-4 h-4 mr-2" />
          Manage templates
        </Button>
      </div>

      <Card>
        <Collapsible open={showAllLinks} onOpenChange={setShowAllLinks}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="w-5 h-5" />
                    {t('business.contracts.contractLinkTitle')}
                    <Badge variant="secondary" className="ml-1">
                      {activeTemplates.length}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {activeTemplates.length === 0
                      ? "No active templates yet — create or activate one in Manage templates."
                      : "Send the right link to the right worker. Each template has its own URL."}
                    {draftTemplateCount > 0 && (
                      <span className="ml-1 text-xs">
                        ({draftTemplateCount} draft{draftTemplateCount === 1 ? '' : 's'} not shown)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform ${showAllLinks ? 'rotate-180' : ''}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-2">
              {activeTemplates.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/business/contracts/templates')}
                  data-testid="button-go-to-templates"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  Manage templates
                </Button>
              ) : (
                activeTemplates.map((tmpl) => {
                  const url = `${window.location.origin}/contract/t/${tmpl.publicToken}`;
                  return (
                    <div
                      key={tmpl.id}
                      className="flex items-center gap-2 rounded border bg-background p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                          {tmpl.name}
                          <span className="text-xs text-muted-foreground uppercase">
                            {tmpl.language}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground truncate mt-1">
                          {url}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyTemplateLink(tmpl)}
                        title="Copy link"
                        data-testid={`button-copy-template-link-${tmpl.id}`}
                      >
                        {copiedTemplateId === tmpl.id ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/business/contracts/templates/${tmpl.id}`)}
                        title="Edit template"
                        data-testid={`button-edit-template-${tmpl.id}`}
                      >
                        <Settings2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="pending" className="flex-1 min-w-0 gap-1 sm:gap-2 px-2 sm:px-4 py-2" data-testid="tab-pending-contracts">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{t('business.contracts.tabs.pending')}</span>
            <span className="sm:hidden truncate">{t('business.contracts.tabs.pendingShort')}</span>
            {pendingContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1 flex-shrink-0">{pendingContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="signed" className="flex-1 min-w-0 gap-1 sm:gap-2 px-2 sm:px-4 py-2" data-testid="tab-signed-contracts">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{t('business.contracts.tabs.signed')}</span>
            <span className="sm:hidden truncate">{t('business.contracts.tabs.signedShort')}</span>
            {signedContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1 flex-shrink-0">{signedContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-1 min-w-0 gap-1 sm:gap-2 px-2 sm:px-4 py-2" data-testid="tab-archived-contracts">
            <Archive className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{t('business.contracts.tabs.archived')}</span>
            <span className="sm:hidden truncate">{t('business.contracts.tabs.archivedShort')}</span>
            {archivedContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1 flex-shrink-0">{archivedContracts.length}</Badge>
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
                <p>{t('business.contracts.empty.pending')}</p>
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
                <p>{t('business.contracts.empty.signed')}</p>
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
                <p>{t('business.contracts.empty.archived')}</p>
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
            <DialogTitle>{t('business.contracts.dialog.viewTitle')}</DialogTitle>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              {selectedContract.templateSnapshot ? (
                <ContractDocument
                  blocks={(selectedContract.templateSnapshot?.blocks ?? []) as any}
                  data={(selectedContract.data ?? {}) as Record<string, unknown>}
                  workerSignaturePng={selectedContract.workerSignature ?? null}
                  managerSignaturePng={selectedContract.managerSignature ?? null}
                />
              ) : (
                <p className="text-sm text-gray-500 italic py-4 text-center">
                  {t('business.contracts.preview.legacyNoSnapshot')}
                </p>
              )}

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
                    {t('business.contracts.actions.sign')}
                  </Button>
                )}
                {selectedContract.status === 'signed' && (
                  <Button
                    variant="outline"
                    onClick={() => downloadContractPDF(selectedContract)}
                    data-testid="button-download-from-view"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t('business.contracts.actions.downloadPdf')}
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
            <DialogTitle>{t('business.contracts.dialog.signTitle')}</DialogTitle>
            <DialogDescription>
              {t('business.contracts.dialog.signDescription')}
            </DialogDescription>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              {selectedContract.templateSnapshot ? (
                <ContractDocument
                  blocks={(selectedContract.templateSnapshot?.blocks ?? []) as any}
                  data={(selectedContract.data ?? {}) as Record<string, unknown>}
                  workerSignaturePng={selectedContract.workerSignature ?? null}
                  managerSignaturePng={selectedContract.managerSignature ?? null}
                />
              ) : (
                <p className="text-sm text-gray-500 italic py-4 text-center">
                  {t('business.contracts.preview.legacyNoSnapshot')}
                </p>
              )}

              <div className="border-t pt-4">
                <Button
                  className="w-full"
                  onClick={() => setShowSignaturePad(true)}
                  data-testid="button-open-signature-pad"
                >
                  <Pen className="w-4 h-4 mr-2" />
                  {t('business.contracts.dialog.addCountersignature')}
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
        title={t('business.contracts.dialog.yourSignature')}
      />
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-xs font-medium ${className}`}>{children}</p>;
}
