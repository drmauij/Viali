import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, Copy, Check, Send, Trash2, Link as LinkIcon, Mail } from "lucide-react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";

interface WorklogLink {
  id: string;
  hospitalId: string;
  unitId: string;
  email: string;
  token: string;
  isActive: boolean;
  createdAt: string;
}

interface WorklogLinkManagerProps {
  hospitalId: string;
  unitId: string;
  unitName: string;
}

export function WorklogLinkManager({ hospitalId, unitId, unitName }: WorklogLinkManagerProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [showNewLinkDialog, setShowNewLinkDialog] = useState(false);
  const [newLinkEmail, setNewLinkEmail] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const dateLocale = i18n.language === 'de' ? de : enUS;

  const { data: worklogLinks = [], isLoading } = useQuery<WorklogLink[]>({
    queryKey: ['/api/hospitals', hospitalId, 'units', unitId, 'worklog', 'links'],
  });

  const createLinkMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/units/${unitId}/worklog/links`, { email, sendEmail: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'units', unitId, 'worklog', 'links'] });
      toast({
        title: t('worklogs.linkCreated'),
        description: t('worklogs.linkCreatedAndSent'),
      });
      setShowNewLinkDialog(false);
      setNewLinkEmail("");
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.linkCreateFailed'),
        variant: "destructive",
      });
    },
  });

  const sendLinkMutation = useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/worklog/links/${linkId}/send`, {});
    },
    onSuccess: () => {
      toast({
        title: t('worklogs.linkSent'),
        description: t('worklogs.linkResent'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.emailSendFailed'),
        variant: "destructive",
      });
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async ({ linkId }: { linkId: string }) => {
      return apiRequest('DELETE', `/api/hospitals/${hospitalId}/worklog/links/${linkId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', hospitalId, 'units', unitId, 'worklog', 'links'] });
      toast({
        title: t('worklogs.linkDeleted'),
        description: t('worklogs.linkDeletedDesc'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('worklogs.linkDeleteFailed'),
        variant: "destructive",
      });
    },
  });

  const handleCopyLink = async (link: WorklogLink) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${baseUrl}/worklog/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(link.id);
      toast({
        title: t('worklogs.linkCopied'),
        description: t('worklogs.linkCopiedDesc'),
      });
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (err) {
      toast({
        title: t('common.error'),
        description: t('worklogs.linkCopyFailed'),
        variant: "destructive",
      });
    }
  };

  const handleCreateLink = () => {
    if (!newLinkEmail) {
      toast({
        title: t('common.error'),
        description: t('worklogs.emailRequired'),
        variant: "destructive",
      });
      return;
    }
    createLinkMutation.mutate({ email: newLinkEmail });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              {t('worklogs.externalTimeTracking')}
            </CardTitle>
            <CardDescription>
              {t('worklogs.linksForExternalWorkers', { unitName })}
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNewLinkDialog(true)} data-testid="button-new-worklog-link">
            <Plus className="w-4 h-4 mr-1" />
            {t('worklogs.newLink')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : worklogLinks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('worklogs.noLinks')}</p>
            <p className="text-sm">{t('worklogs.noLinksHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {worklogLinks.map((link) => (
              <div 
                key={link.id} 
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                data-testid={`worklog-link-${link.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{link.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('worklogs.createdOn')}: {format(new Date(link.createdAt), "dd.MM.yyyy", { locale: dateLocale })}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopyLink(link)}
                    title={t('worklogs.copyLink')}
                    data-testid={`button-copy-link-${link.id}`}
                  >
                    {copiedLink === link.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => sendLinkMutation.mutate({ linkId: link.id })}
                    disabled={sendLinkMutation.isPending}
                    title={t('worklogs.resendLink')}
                    data-testid={`button-send-link-${link.id}`}
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteLinkMutation.mutate({ linkId: link.id })}
                    disabled={deleteLinkMutation.isPending}
                    title={t('worklogs.deleteLink')}
                    className="text-destructive hover:text-destructive"
                    data-testid={`button-delete-link-${link.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showNewLinkDialog} onOpenChange={setShowNewLinkDialog}>
        <DialogContent data-testid="dialog-new-worklog-link">
          <DialogHeader>
            <DialogTitle>{t('worklogs.createNewLink')}</DialogTitle>
            <DialogDescription>
              {t('worklogs.createLinkDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-link-email">{t('worklogs.emailAddress')}</Label>
              <Input
                id="new-link-email"
                type="email"
                placeholder="worker@example.com"
                value={newLinkEmail}
                onChange={(e) => setNewLinkEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()}
                data-testid="input-new-link-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewLinkDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleCreateLink} 
              disabled={createLinkMutation.isPending || !newLinkEmail}
              data-testid="button-create-link"
            >
              {createLinkMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('worklogs.creating')}
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  {t('worklogs.createAndSendLink')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
