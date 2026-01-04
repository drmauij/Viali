import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Mail, Loader2, CheckCircle, Link as LinkIcon } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";

interface SendQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
}

export function SendQuestionnaireDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientEmail,
}: SendQuestionnaireDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  
  const [generatedLink, setGeneratedLink] = useState<{ token: string; linkId: string } | null>(null);
  const [emailAddress, setEmailAddress] = useState(patientEmail || "");
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (open) {
      setGeneratedLink(null);
      setEmailAddress(patientEmail || "");
      setCopied(false);
      setEmailSent(false);
    }
  }, [open, patientEmail]);

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/questionnaire/generate-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ patientId, expiresInDays: 7 }),
      });
      if (!res.ok) throw new Error('Failed to generate link');
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedLink({ token: data.link.token, linkId: data.link.id });
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
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
    mutationFn: async () => {
      if (!generatedLink) throw new Error('No link generated');
      const res = await fetch(`/api/questionnaire/links/${generatedLink.linkId}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ email: emailAddress }),
      });
      if (!res.ok) throw new Error('Failed to send email');
      return res.json();
    },
    onSuccess: () => {
      setEmailSent(true);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
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

  useEffect(() => {
    if (open && !generatedLink && activeHospital?.id) {
      generateLinkMutation.mutate();
    }
  }, [open, activeHospital?.id]);

  const handleCopyLink = () => {
    if (!generatedLink) return;
    const link = `${window.location.origin}/questionnaire/${generatedLink.token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast({
      title: t('questionnaire.links.copied'),
      description: t('questionnaire.links.copiedDesc'),
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = () => {
    if (!emailAddress || !generatedLink) return;
    sendEmailMutation.mutate();
  };

  const isGenerating = generateLinkMutation.isPending;
  const isSending = sendEmailMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-send-questionnaire">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            {t('questionnaire.send.title', 'Send Questionnaire')}
          </DialogTitle>
          <DialogDescription>
            {t('questionnaire.send.description', { name: patientName })}
          </DialogDescription>
        </DialogHeader>
        
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              {t('questionnaire.send.generating', 'Generating link...')}
            </p>
          </div>
        ) : generatedLink ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('questionnaire.send.linkLabel', 'Questionnaire Link')}</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/questionnaire/${generatedLink.token}`}
                  className="text-xs"
                  data-testid="input-questionnaire-link"
                />
                <Button
                  variant={copied ? "default" : "outline"}
                  size="icon"
                  onClick={handleCopyLink}
                  className="shrink-0"
                  data-testid="button-copy-questionnaire-link"
                >
                  {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label>{t('questionnaire.send.orSendEmail', 'Or send via email')}</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder={t('questionnaire.links.emailPlaceholder', 'patient@example.com')}
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  disabled={emailSent}
                  data-testid="input-send-email"
                />
                <Button
                  onClick={handleSendEmail}
                  disabled={!emailAddress || isSending || emailSent}
                  className="shrink-0"
                  data-testid="button-send-email"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : emailSent ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {t('questionnaire.send.sent', 'Sent')}
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 mr-1" />
                      {t('questionnaire.send.send', 'Send')}
                    </>
                  )}
                </Button>
              </div>
              {!patientEmail && (
                <p className="text-xs text-muted-foreground">
                  {t('questionnaire.send.noEmailHint', 'No email on file for this patient')}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
