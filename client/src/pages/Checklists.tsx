import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { useCanWrite } from "@/hooks/useCanWrite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ClipboardCheck, Clock, AlertCircle, FileSignature, X, Download } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatShortDate, formatDateTimeLong } from "@/lib/dateUtils";
import { generateChecklistHistoryPdf } from "@/lib/checklistHistoryPdf";
import type { ChecklistTemplate, ChecklistCompletion, User } from "@shared/schema";

interface PendingChecklist extends ChecklistTemplate {
  lastCompletion?: ChecklistCompletion;
  nextDueDate: Date;
  isOverdue: boolean;
}

interface ChecklistHistoryEntry {
  id: string;
  templateId: string;
  date: string;
  dueDate: string;
  userName: string;
  userId: string;
  status: 'completed' | 'skipped';
  signature?: string;
  comment?: string;
  reason?: string;
}

interface ChecklistHistoryResponse {
  templates: ChecklistTemplate[];
  history: ChecklistHistoryEntry[];
}

export default function Checklists() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const canWrite = useCanWrite();
  const { toast } = useToast();
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PendingChecklist | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState("");
  const [comment, setComment] = useState("");
  const [dismissReason, setDismissReason] = useState("");
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const { data: pendingChecklists = [], isLoading: isLoadingPending } = useQuery<PendingChecklist[]>({
    queryKey: [`/api/checklists/pending/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });

  const { data: historyResponse, isLoading: isLoadingHistory } = useQuery<ChecklistHistoryResponse>({
    queryKey: [`/api/checklists/history/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
  });

  const historyTemplates = historyResponse?.templates ?? [];
  const historyEntries = historyResponse?.history ?? [];

  const historyByTemplate = useMemo(() => {
    const map = new Map<string, ChecklistHistoryEntry[]>();
    for (const entry of historyEntries) {
      const list = map.get(entry.templateId) || [];
      list.push(entry);
      map.set(entry.templateId, list);
    }
    return map;
  }, [historyEntries]);

  const completeMutation = useMutation({
    mutationFn: async (data: { 
      templateId: string; 
      dueDate: Date;
      comment?: string; 
      signature: string;
      templateSnapshot: Pick<ChecklistTemplate, 'name' | 'description' | 'recurrency' | 'items' | 'role'>;
    }) => {
      if (!activeHospital?.id || !activeHospital?.unitId || !user?.id) {
        throw new Error("Missing required information");
      }
      
      const response = await apiRequest("POST", `/api/checklists/complete`, {
        templateId: data.templateId,
        dueDate: new Date(data.dueDate).toISOString(),
        comment: data.comment,
        signature: data.signature,
        templateSnapshot: data.templateSnapshot,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/history/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/count/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      toast({
        title: t("common.success"),
        description: t("checklists.completionSuccess"),
      });
      setShowCompletionModal(false);
      setSelectedTemplate(null);
      setSignature("");
      setComment("");
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("checklists.completionError"),
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (data: { 
      templateId: string; 
      dueDate: Date;
      reason?: string;
    }) => {
      if (!activeHospital?.id || !activeHospital?.unitId || !user?.id) {
        throw new Error("Missing required information");
      }
      
      const response = await apiRequest("POST", `/api/checklists/dismiss`, {
        templateId: data.templateId,
        dueDate: new Date(data.dueDate).toISOString(),
        reason: data.reason,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/count/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      toast({
        title: t("common.success"),
        description: t("checklists.dismissSuccess"),
      });
      setShowDismissModal(false);
      setSelectedTemplate(null);
      setDismissReason("");
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("checklists.dismissError"),
        variant: "destructive",
      });
    },
  });

  const handleCompleteChecklist = (checklist: PendingChecklist) => {
    setSelectedTemplate(checklist);
    setCheckedItems(new Set()); // Reset checked items
    setShowCompletionModal(true);
  };

  const handleDismissChecklist = (checklist: PendingChecklist) => {
    setSelectedTemplate(checklist);
    setDismissReason("");
    setShowDismissModal(true);
  };

  const handleSubmitDismissal = () => {
    if (!selectedTemplate) return;

    dismissMutation.mutate({
      templateId: selectedTemplate.id,
      dueDate: selectedTemplate.nextDueDate,
      reason: dismissReason.trim() || undefined,
    });
  };

  const toggleItemCheck = (index: number) => {
    setCheckedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSubmitCompletion = () => {
    if (!selectedTemplate) return;
    
    if (!signature) {
      toast({
        title: t("common.error"),
        description: t("checklists.signatureRequired"),
        variant: "destructive",
      });
      return;
    }

    // Create template snapshot for historical record
    const templateSnapshot = {
      name: selectedTemplate.name,
      description: selectedTemplate.description,
      recurrency: selectedTemplate.recurrency,
      items: selectedTemplate.items,
      role: selectedTemplate.role,
    };

    completeMutation.mutate({
      templateId: selectedTemplate.id,
      dueDate: selectedTemplate.nextDueDate,
      comment: comment.trim() || undefined,
      signature,
      templateSnapshot,
    });
  };

  const getStatusBadge = (checklist: PendingChecklist) => {
    if (checklist.isOverdue) {
      return (
        <Badge variant="destructive" className="gap-1" data-testid={`badge-overdue-${checklist.id}`}>
          <AlertCircle className="w-3 h-3" />
          {t("checklists.overdue")}
        </Badge>
      );
    }
    
    const now = new Date();
    const dueDate = new Date(checklist.nextDueDate);
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue <= 2) {
      return (
        <Badge variant="default" className="gap-1 bg-yellow-500" data-testid={`badge-duesoon-${checklist.id}`}>
          <Clock className="w-3 h-3" />
          {t("checklists.dueSoon")}
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="gap-1" data-testid={`badge-upcoming-${checklist.id}`}>
        <Clock className="w-3 h-3" />
        {t("checklists.upcoming")}
      </Badge>
    );
  };

  const getRecurrencyLabel = (recurrency: string) => {
    const labels: Record<string, string> = {
      daily: t("checklists.recurrency.daily"),
      weekly: t("checklists.recurrency.weekly"),
      monthly: t("checklists.recurrency.monthly"),
      yearly: t("checklists.recurrency.yearly"),
    };
    return labels[recurrency] || recurrency;
  };

  return (
    <div className="p-4 pb-20" data-testid="page-checklists">
      <div className="flex items-center gap-2 mb-6">
        <ClipboardCheck className="w-6 h-6" />
        <h1 className="text-2xl font-bold" data-testid="text-title">{t("checklists.title")}</h1>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2" data-testid="tabs-checklist">
          <TabsTrigger value="pending" data-testid="tab-pending">
            {t("checklists.pending")}
            {pendingChecklists.length > 0 && (
              <Badge variant="destructive" className="ml-2" data-testid="badge-pending-count">
                {pendingChecklists.filter(c => c.isOverdue).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            {t("checklists.history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4" data-testid="content-pending">
          {isLoadingPending ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse" data-testid={`skeleton-pending-${i}`}>
                  <CardHeader>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : pendingChecklists.length === 0 ? (
            <Card data-testid="card-no-pending">
              <CardContent className="p-8 text-center text-muted-foreground">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p data-testid="text-no-pending">{t("checklists.noPending")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingChecklists.map(checklist => (
                <Card key={checklist.id} className="hover:shadow-md transition-shadow" data-testid={`card-pending-${checklist.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2" data-testid={`text-name-${checklist.id}`}>
                          {checklist.name}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span data-testid={`text-recurrency-${checklist.id}`}>
                            {getRecurrencyLabel(checklist.recurrency)}
                          </span>
                          <span>•</span>
                          <span data-testid={`text-duedate-${checklist.id}`}>
                            {t("checklists.dueDate")}: {formatShortDate(checklist.nextDueDate)}
                          </span>
                          {checklist.role && (
                            <>
                              <span>•</span>
                              <span data-testid={`text-role-${checklist.id}`}>
                                {t(`checklists.role.${checklist.role}`)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(checklist)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-muted-foreground" data-testid={`text-items-${checklist.id}`}>
                        {Array.isArray(checklist.items) ? checklist.items.length : 0} {t("checklists.items")}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline"
                          onClick={() => handleDismissChecklist(checklist)}
                          disabled={!canWrite}
                          data-testid={`button-skip-${checklist.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
                          {t("checklists.skip")}
                        </Button>
                        <Button 
                          onClick={() => handleCompleteChecklist(checklist)}
                          disabled={!canWrite}
                          data-testid={`button-complete-${checklist.id}`}
                        >
                          {t("checklists.complete")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4" data-testid="content-history">
          {isLoadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse" data-testid={`skeleton-history-${i}`}>
                  <CardHeader>
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : historyTemplates.length === 0 ? (
            <Card data-testid="card-no-history">
              <CardContent className="p-8 text-center text-muted-foreground">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p data-testid="text-no-history">{t("checklists.historyNoTemplates")}</p>
              </CardContent>
            </Card>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {historyTemplates.map(template => {
                const entries = historyByTemplate.get(template.id) || [];
                return (
                  <AccordionItem key={template.id} value={template.id} className="border rounded-lg px-4" data-testid={`accordion-${template.id}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-center gap-3 mr-2">
                        <span className="font-semibold text-left">{template.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {getRecurrencyLabel(template.recurrency)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {entries.length} {t("checklists.entries")}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-8 w-8 p-0"
                          disabled={entries.length === 0}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await generateChecklistHistoryPdf({
                              templateName: template.name,
                              recurrency: template.recurrency,
                              hospitalName: activeHospital?.name || '',
                              entries: entries.map(en => ({
                                date: new Date(en.date),
                                userName: en.userName,
                                status: en.status,
                                comment: en.comment,
                                reason: en.reason,
                                signature: en.signature,
                              })),
                              t,
                            });
                          }}
                          data-testid={`button-pdf-${template.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {entries.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">{t("checklists.historyNoEntries")}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                <th className="py-2 pr-4">{t("checklists.dateTime")}</th>
                                <th className="py-2 pr-4">{t("checklists.person")}</th>
                                <th className="py-2 pr-4">{t("checklists.status")}</th>
                                <th className="py-2 pr-4">{t("checklists.commentReason")}</th>
                                <th className="py-2">{t("checklists.signature")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map(entry => (
                                <tr key={entry.id} className="border-b last:border-0">
                                  <td className="py-2 pr-4 whitespace-nowrap">{formatDateTimeLong(entry.date)}</td>
                                  <td className="py-2 pr-4">{entry.userName}</td>
                                  <td className="py-2 pr-4">
                                    {entry.status === 'completed' ? (
                                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100">
                                        {t("checklists.completed")}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 hover:bg-amber-100">
                                        {t("checklists.skipped")}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-2 pr-4 text-muted-foreground">
                                    {entry.comment || entry.reason || '-'}
                                  </td>
                                  <td className="py-2">
                                    {entry.signature ? (
                                      <img
                                        src={entry.signature.startsWith('data:') ? entry.signature : `data:image/png;base64,${entry.signature}`}
                                        alt="Signature"
                                        className="h-8 w-auto"
                                      />
                                    ) : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>

      {/* Completion Modal */}
      <Dialog 
        open={showCompletionModal} 
        onOpenChange={(open) => {
          setShowCompletionModal(open);
          if (!open) {
            // Reset all state when dialog closes
            setSelectedTemplate(null);
            setSignature("");
            setComment("");
            setShowSignaturePad(false);
            setCheckedItems(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-complete-checklist">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle data-testid="text-modal-title">
              {t("checklists.complete")} - {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription data-testid="text-modal-description">
              {t("checklists.completionDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 mt-4 pr-1">
            {/* Checklist Items */}
            {selectedTemplate && Array.isArray(selectedTemplate.items) && selectedTemplate.items.length > 0 && (
              <div>
                <Label className="text-sm font-semibold mb-3 block" data-testid="label-items">
                  {t("checklists.itemsToCheck")}
                </Label>
                <ul className="space-y-3" data-testid="list-items">
                  {selectedTemplate.items.map((item, index) => {
                    const isChecked = checkedItems.has(index);
                    return (
                      <li
                        key={index}
                        onClick={() => toggleItemCheck(index)}
                        className="flex items-center gap-3 p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer active:scale-[0.98]"
                        data-testid={`item-${index}`}
                      >
                        <div 
                          className={`min-w-6 w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${
                            isChecked 
                              ? 'bg-primary border-primary' 
                              : 'border-muted-foreground/40'
                          }`}
                        >
                          {isChecked && (
                            <svg
                              className="w-4 h-4 text-primary-foreground"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path d="M5 13l4 4L19 7"></path>
                            </svg>
                          )}
                        </div>
                        <span className={`text-base ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                          {typeof item === 'string' ? item : item.description}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Comment */}
            <div>
              <Label htmlFor="comment" className="mb-2 block" data-testid="label-comment">
                {t("checklists.comment")} ({t("checklists.optional")})
              </Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("checklists.commentPlaceholder")}
                className="min-h-24"
                data-testid="input-comment"
              />
            </div>

            {/* Signature */}
            <div>
              <Label className="mb-2 block" data-testid="label-signature">
                {t("checklists.signature")} *
              </Label>
              <div
                className="signature-pad cursor-pointer border-2 border-dashed border-border rounded-lg p-6 hover:bg-muted/50 transition-colors"
                onClick={() => setShowSignaturePad(true)}
                data-testid="signature-trigger"
              >
                {signature ? (
                  <div className="text-center">
                    <FileSignature className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-green-600" data-testid="text-signature-added">
                      {t("checklists.signatureAdded")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("checklists.clickToChange")}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <FileSignature className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium" data-testid="text-signature-required">
                      {t("checklists.clickToSign")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 flex-shrink-0 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowCompletionModal(false);
                setSelectedTemplate(null);
                setSignature("");
                setComment("");
              }}
              disabled={completeMutation.isPending}
              data-testid="button-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmitCompletion}
              disabled={completeMutation.isPending || !signature}
              className="flex-1"
              data-testid="button-submit"
            >
              {completeMutation.isPending ? t("checklists.completing") : t("checklists.submitCompletion")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dismiss Modal */}
      <Dialog 
        open={showDismissModal} 
        onOpenChange={(open) => {
          setShowDismissModal(open);
          if (!open) {
            setSelectedTemplate(null);
            setDismissReason("");
          }
        }}
      >
        <DialogContent className="max-w-md" data-testid="dialog-dismiss-checklist">
          <DialogHeader>
            <DialogTitle data-testid="text-dismiss-modal-title">
              {t("checklists.skipChecklist")}
            </DialogTitle>
            <DialogDescription data-testid="text-dismiss-modal-description">
              {t("checklists.skipDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium" data-testid="text-dismiss-template-name">{selectedTemplate?.name}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-dismiss-due-date">
                {t("checklists.dueDate")}: {selectedTemplate?.nextDueDate && formatShortDate(selectedTemplate.nextDueDate)}
              </p>
            </div>

            <div>
              <Label htmlFor="dismiss-reason" className="mb-2 block" data-testid="label-dismiss-reason">
                {t("checklists.skipReason")} ({t("checklists.optional")})
              </Label>
              <Textarea
                id="dismiss-reason"
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder={t("checklists.skipReasonPlaceholder")}
                className="min-h-20"
                data-testid="input-dismiss-reason"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setShowDismissModal(false);
                setSelectedTemplate(null);
                setDismissReason("");
              }}
              disabled={dismissMutation.isPending}
              data-testid="button-dismiss-cancel"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmitDismissal}
              disabled={dismissMutation.isPending}
              className="flex-1"
              data-testid="button-dismiss-confirm"
            >
              {dismissMutation.isPending ? t("checklists.skipping") : t("checklists.confirmSkip")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Pad */}
      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => setShowSignaturePad(false)}
        onSave={(sig) => setSignature(sig)}
        title={t("checklists.yourSignature")}
      />
    </div>
  );
}
