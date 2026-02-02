import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  FileText, 
  Plus, 
  Copy, 
  Mail, 
  MailCheck,
  Trash2, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Link as LinkIcon,
  ExternalLink
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { useCanWrite } from "@/hooks/useCanWrite";
import { formatDate } from "@/lib/dateUtils";

interface QuestionnaireLink {
  id: string;
  token: string;
  patientId?: string;
  surgeryId?: string;
  status: 'pending' | 'started' | 'submitted' | 'reviewed' | 'expired';
  createdAt?: string;
  expiresAt?: string;
  emailSent?: boolean;
  emailSentAt?: string;
  emailSentTo?: string;
}

interface QuestionnaireLinksCardProps {
  patientId: string;
  patientEmail?: string | null;
  patientName: string;
}

export function QuestionnaireLinksCard({ patientId, patientEmail, patientName }: QuestionnaireLinksCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { addons, questionnaireDisabled } = useHospitalAddons();
  const canWrite = useCanWrite();
  
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isSendEmailDialogOpen, setIsSendEmailDialogOpen] = useState(false);
  const [isInvalidateDialogOpen, setIsInvalidateDialogOpen] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [emailAddress, setEmailAddress] = useState(patientEmail || "");
  const [expiryDays, setExpiryDays] = useState(7);

  const { data: links = [], isLoading } = useQuery<QuestionnaireLink[]>({
    queryKey: ['/api/questionnaire/patient', patientId, 'links'],
    queryFn: async () => {
      const res = await fetch(`/api/questionnaire/patient/${patientId}/links`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch links');
      return res.json();
    },
    enabled: !!patientId && !!activeHospital?.id,
  });

  const generateLinkMutation = useMutation({
    mutationFn: async (data: { patientId: string; expiresInDays: number }) => {
      const res = await fetch('/api/questionnaire/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to generate link');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      setIsGenerateDialogOpen(false);
      toast({
        title: t('questionnaire.links.generated'),
        description: t('questionnaire.links.generatedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.links.generateError'),
        variant: 'destructive',
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { linkId: string; email: string }) => {
      const res = await fetch(`/api/questionnaire/links/${data.linkId}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ email: data.email }),
      });
      if (!res.ok) throw new Error('Failed to send email');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      setIsSendEmailDialogOpen(false);
      setSelectedLinkId(null);
      toast({
        title: t('questionnaire.links.emailSent'),
        description: t('questionnaire.links.emailSentDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.links.emailError'),
        variant: 'destructive',
      });
    },
  });

  const invalidateLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/questionnaire/links/${linkId}/invalidate`, {
        method: 'POST',
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to invalidate link');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      setIsInvalidateDialogOpen(false);
      setSelectedLinkId(null);
      toast({
        title: t('questionnaire.links.invalidated'),
        description: t('questionnaire.links.invalidatedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.links.invalidateError'),
        variant: 'destructive',
      });
    },
  });

  const handleGenerateLink = () => {
    generateLinkMutation.mutate({ patientId, expiresInDays: expiryDays });
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/patient/${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: t('questionnaire.links.copied'),
      description: t('questionnaire.links.copiedDesc'),
    });
  };

  const handleOpenSendEmail = (linkId: string) => {
    setSelectedLinkId(linkId);
    setEmailAddress(patientEmail || "");
    setIsSendEmailDialogOpen(true);
  };

  const handleSendEmail = () => {
    if (!selectedLinkId || !emailAddress) return;
    sendEmailMutation.mutate({ linkId: selectedLinkId, email: emailAddress });
  };

  const handleOpenInvalidate = (linkId: string) => {
    setSelectedLinkId(linkId);
    setIsInvalidateDialogOpen(true);
  };

  const handleInvalidate = () => {
    if (!selectedLinkId) return;
    invalidateLinkMutation.mutate(selectedLinkId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" />{t('questionnaire.links.statusPending')}</Badge>;
      case 'started':
        return <Badge className="bg-yellow-500 text-white flex items-center gap-1"><FileText className="h-3 w-3" />{t('questionnaire.links.statusStarted')}</Badge>;
      case 'submitted':
        return <Badge className="bg-blue-500 text-white flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{t('questionnaire.links.statusSubmitted')}</Badge>;
      case 'reviewed':
        return <Badge className="bg-green-500 text-white flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{t('questionnaire.links.statusReviewed')}</Badge>;
      case 'expired':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" />{t('questionnaire.links.statusExpired')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const activeLinks = links.filter(l => l.status !== 'expired' && l.status !== 'reviewed');
  const expiredLinks = links.filter(l => l.status === 'expired');
  const hasActiveLink = activeLinks.length > 0;
  const [showExpired, setShowExpired] = useState(false);

  const visibleLinks = showExpired ? links : links.filter(l => l.status !== 'expired');

  // Don't render if questionnaire addon is disabled or manually disabled
  if (!addons.questionnaire || questionnaireDisabled) {
    return null;
  }

  return (
    <>
      <Card data-testid="card-questionnaire-links">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" />
              {t('questionnaire.links.title')}
            </CardTitle>
            {canWrite && (
              <Button 
                size="sm" 
                onClick={() => setIsGenerateDialogOpen(true)}
                data-testid="button-generate-link"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('questionnaire.links.generate')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin" data-testid="loader-links" />
            </div>
          ) : links.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground" data-testid="text-no-links">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('questionnaire.links.noLinks')}</p>
              {canWrite && (
                <p className="text-xs mt-1">{t('questionnaire.links.noLinksHint')}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleLinks.map((link) => (
                <div 
                  key={link.id} 
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                  data-testid={`link-row-${link.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {getStatusBadge(link.status)}
                      {link.emailSent && (
                        <Badge variant="outline" className="flex items-center gap-1 text-green-600 border-green-300 bg-green-50">
                          <MailCheck className="h-3 w-3" />
                          {t('questionnaire.links.emailSentBadge', 'Emailed')}
                        </Badge>
                      )}
                      {link.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          {t('questionnaire.links.expires')}: {formatDate(link.expiresAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('questionnaire.links.created')}: {formatDate(link.createdAt || '')}
                      {link.emailSent && link.emailSentTo && (
                        <span className="ml-2">
                          • {t('questionnaire.links.sentTo', 'Sent to')}: {link.emailSentTo}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {link.status !== 'expired' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCopyLink(link.token)}
                          title={t('questionnaire.links.copyLink')}
                          data-testid={`button-copy-link-${link.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/patient/${link.token}`, '_blank')}
                          title={t('questionnaire.links.openLink')}
                          data-testid={`button-open-link-${link.id}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        {canWrite && (link.status === 'pending' || link.status === 'started') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenSendEmail(link.id)}
                            title={link.emailSent 
                              ? t('questionnaire.links.resendEmail', 'Resend email')
                              : t('questionnaire.links.sendEmail')
                            }
                            data-testid={`button-send-email-${link.id}`}
                          >
                            {link.emailSent ? (
                              <MailCheck className="h-4 w-4 text-green-600" />
                            ) : (
                              <Mail className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {canWrite && link.status !== 'submitted' && link.status !== 'reviewed' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenInvalidate(link.id)}
                            title={t('questionnaire.links.invalidate')}
                            data-testid={`button-invalidate-link-${link.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {expiredLinks.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => setShowExpired(!showExpired)}
                  data-testid="button-toggle-expired"
                >
                  {showExpired 
                    ? t('questionnaire.links.hideExpired', { count: expiredLinks.length })
                    : t('questionnaire.links.showExpired', { count: expiredLinks.length })
                  }
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('questionnaire.links.generateTitle')}</DialogTitle>
            <DialogDescription>
              {t('questionnaire.links.generateDesc', { name: patientName })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expiry-days">{t('questionnaire.links.expiryDays')}</Label>
              <Input
                id="expiry-days"
                type="number"
                min={1}
                max={30}
                value={expiryDays}
                onChange={(e) => setExpiryDays(parseInt(e.target.value) || 7)}
                data-testid="input-expiry-days"
              />
              <p className="text-xs text-muted-foreground">{t('questionnaire.links.expiryDaysHint')}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleGenerateLink}
              disabled={generateLinkMutation.isPending}
              data-testid="button-confirm-generate"
            >
              {generateLinkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t('questionnaire.links.generate')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSendEmailDialogOpen} onOpenChange={setIsSendEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('questionnaire.links.sendEmailTitle')}</DialogTitle>
            <DialogDescription>
              {t('questionnaire.links.sendEmailDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-address">{t('auth.email')}</Label>
              <Input
                id="email-address"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder={t('questionnaire.links.emailPlaceholder')}
                data-testid="input-email-address"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsSendEmailDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending || !emailAddress}
              data-testid="button-confirm-send-email"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              {t('questionnaire.links.sendEmail')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isInvalidateDialogOpen} onOpenChange={setIsInvalidateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('questionnaire.links.invalidateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('questionnaire.links.invalidateDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-invalidate">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleInvalidate}
              disabled={invalidateLinkMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-invalidate"
            >
              {invalidateLinkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t('questionnaire.links.invalidate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
