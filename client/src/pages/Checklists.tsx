import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useUser } from "@/hooks/useUser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ClipboardCheck, Clock, AlertCircle, FileSignature } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ChecklistTemplate, ChecklistCompletion, User } from "@shared/schema";
import { format } from "date-fns";

interface PendingChecklist extends ChecklistTemplate {
  lastCompletion?: ChecklistCompletion;
  nextDueDate: Date;
  isOverdue: boolean;
}

interface ChecklistCompletionWithDetails extends ChecklistCompletion {
  template: ChecklistTemplate;
  completedByUser: User;
}

export default function Checklists() {
  const { t } = useTranslation();
  const { user } = useUser();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PendingChecklist | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState("");
  const [comment, setComment] = useState("");

  const { data: pendingChecklists = [], isLoading: isLoadingPending } = useQuery<PendingChecklist[]>({
    queryKey: [`/api/checklists/pending/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const { data: completionHistory = [], isLoading: isLoadingHistory } = useQuery<ChecklistCompletionWithDetails[]>({
    queryKey: [`/api/checklists/history/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const completeMutation = useMutation({
    mutationFn: async (data: { templateId: string; comment?: string; signature: string }) => {
      if (!activeHospital?.id || !activeHospital?.locationId || !user?.id) {
        throw new Error("Missing required information");
      }
      
      return await apiRequest(`/api/checklists/complete`, {
        method: "POST",
        body: JSON.stringify({
          templateId: data.templateId,
          completedBy: user.id,
          completedAt: new Date().toISOString(),
          comment: data.comment,
          signature: data.signature,
          hospitalId: activeHospital.id,
          locationId: activeHospital.locationId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/pending/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/checklists/history/${activeHospital?.id}`] });
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

  const handleCompleteChecklist = (checklist: PendingChecklist) => {
    setSelectedTemplate(checklist);
    setShowCompletionModal(true);
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

    completeMutation.mutate({
      templateId: selectedTemplate.id,
      comment: comment.trim() || undefined,
      signature,
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
    const daysUntilDue = Math.ceil((checklist.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
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
                            {t("checklists.dueDate")}: {format(new Date(checklist.nextDueDate), "PP")}
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
                      <Button 
                        onClick={() => handleCompleteChecklist(checklist)}
                        data-testid={`button-complete-${checklist.id}`}
                      >
                        {t("checklists.complete")}
                      </Button>
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
          ) : completionHistory.length === 0 ? (
            <Card data-testid="card-no-history">
              <CardContent className="p-8 text-center text-muted-foreground">
                <ClipboardCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p data-testid="text-no-history">{t("checklists.noHistory")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {completionHistory.map(completion => (
                <Card key={completion.id} className="hover:shadow-md transition-shadow" data-testid={`card-history-${completion.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2" data-testid={`text-template-${completion.id}`}>
                          {completion.template.name}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span data-testid={`text-completed-${completion.id}`}>
                            {t("checklists.completedOn")}: {format(new Date(completion.completedAt!), "PPp")}
                          </span>
                          <span>•</span>
                          <span data-testid={`text-completedby-${completion.id}`}>
                            {completion.completedByUser.firstName} {completion.completedByUser.lastName}
                          </span>
                        </div>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-completed-${completion.id}`}>
                        {t("checklists.completed")}
                      </Badge>
                    </div>
                  </CardHeader>
                  {completion.comment && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground" data-testid={`text-comment-${completion.id}`}>
                        {completion.comment}
                      </p>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
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
          }
        }}
      >
        <DialogContent className="max-w-2xl" data-testid="dialog-complete-checklist">
          <DialogHeader>
            <DialogTitle data-testid="text-modal-title">
              {t("checklists.complete")} - {selectedTemplate?.name}
            </DialogTitle>
            <DialogDescription data-testid="text-modal-description">
              {t("checklists.completionDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Checklist Items */}
            {selectedTemplate && Array.isArray(selectedTemplate.items) && selectedTemplate.items.length > 0 && (
              <div>
                <Label className="text-sm font-semibold mb-2 block" data-testid="label-items">
                  {t("checklists.itemsToCheck")}
                </Label>
                <ul className="space-y-2 bg-muted p-4 rounded-lg" data-testid="list-items">
                  {selectedTemplate.items.map((item, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm" data-testid={`item-${index}`}>
                      <div className="w-4 h-4 border-2 border-primary rounded"></div>
                      <span>{item}</span>
                    </li>
                  ))}
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

          <div className="flex gap-3 mt-6">
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
