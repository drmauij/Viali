import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, Clock, AlertCircle } from "lucide-react";
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
  const activeHospital = useActiveHospital();
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PendingChecklist | null>(null);

  const { data: pendingChecklists = [], isLoading: isLoadingPending } = useQuery<PendingChecklist[]>({
    queryKey: [`/api/checklists/pending/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const { data: completionHistory = [], isLoading: isLoadingHistory } = useQuery<ChecklistCompletionWithDetails[]>({
    queryKey: [`/api/checklists/history/${activeHospital?.id}`, activeHospital?.locationId],
    enabled: !!activeHospital?.id,
  });

  const handleCompleteChecklist = (checklist: PendingChecklist) => {
    setSelectedTemplate(checklist);
    setShowCompletionModal(true);
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
    </div>
  );
}
