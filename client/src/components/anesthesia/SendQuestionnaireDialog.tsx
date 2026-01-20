import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Mail, Loader2, CheckCircle, Link as LinkIcon, MessageSquare, Clock, AlertCircle, FileText, Send } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { PatientMessage } from "@shared/schema";

interface SendQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
}

export function SendQuestionnaireDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientEmail,
  patientPhone,
}: SendQuestionnaireDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { addons } = useHospitalAddons();
  
  const [generatedLink, setGeneratedLink] = useState<{ token: string; linkId: string } | null>(null);
  const [emailAddress, setEmailAddress] = useState(patientEmail || "");
  const [phoneNumber, setPhoneNumber] = useState(patientPhone || "");
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  
  // Custom message state
  const [customMessage, setCustomMessage] = useState("");
  const [customEmailAddress, setCustomEmailAddress] = useState(patientEmail || "");
  const [customPhoneNumber, setCustomPhoneNumber] = useState(patientPhone || "");
  const [customEmailSent, setCustomEmailSent] = useState(false);
  const [customSmsSent, setCustomSmsSent] = useState(false);
  const [activeTab, setActiveTab] = useState("questionnaire");

  // Check if SMS is configured
  const { data: smsStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/questionnaire/sms-status'],
    enabled: open,
  });

  const isSmsConfigured = smsStatus?.configured ?? false;

  // Fetch existing questionnaire links for this patient to show send history
  const { data: existingLinks } = useQuery<any[]>({
    queryKey: ['/api/questionnaire/patient', patientId, 'links'],
    queryFn: async () => {
      const res = await fetch(`/api/questionnaire/patient/${patientId}/links`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!patientId && !!activeHospital?.id,
  });

  // Fetch patient messages history
  const { data: patientMessages } = useQuery<PatientMessage[]>({
    queryKey: ['/api/patients', patientId, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/messages`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!patientId && !!activeHospital?.id,
  });

  // Find the most recent sent link (email or SMS)
  const getMostRecentSendInfo = () => {
    if (!existingLinks || existingLinks.length === 0) return null;
    
    // Find links that were sent via email or SMS
    const sentLinks = existingLinks.filter(link => link.emailSent || link.smsSent);
    if (sentLinks.length === 0) return null;
    
    // Sort by most recent send date
    const sortedLinks = sentLinks.sort((a, b) => {
      const aDate = a.emailSentAt || a.smsSentAt;
      const bDate = b.emailSentAt || b.smsSentAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });
    
    const mostRecent = sortedLinks[0];
    return {
      emailSent: mostRecent.emailSent,
      emailSentAt: mostRecent.emailSentAt,
      emailSentTo: mostRecent.emailSentTo,
      smsSent: mostRecent.smsSent,
      smsSentAt: mostRecent.smsSentAt,
      smsSentTo: mostRecent.smsSentTo,
      status: mostRecent.status,
    };
  };

  const sendHistory = getMostRecentSendInfo();

  useEffect(() => {
    if (open) {
      setGeneratedLink(null);
      setEmailAddress(patientEmail || "");
      setPhoneNumber(patientPhone || "");
      setCopied(false);
      setEmailSent(false);
      setSmsSent(false);
      // Reset custom message states
      setCustomMessage("");
      setCustomEmailAddress(patientEmail || "");
      setCustomPhoneNumber(patientPhone || "");
      setCustomEmailSent(false);
      setCustomSmsSent(false);
      setActiveTab("questionnaire");
    }
  }, [open, patientEmail, patientPhone]);

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

  const sendSmsMutation = useMutation({
    mutationFn: async () => {
      if (!generatedLink) throw new Error('No link generated');
      const res = await fetch(`/api/questionnaire/links/${generatedLink.linkId}/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ phone: phoneNumber }),
      });
      if (!res.ok) throw new Error('Failed to send SMS');
      return res.json();
    },
    onSuccess: () => {
      setSmsSent(true);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      toast({
        title: t('questionnaire.links.smsSent', 'SMS sent'),
        description: t('questionnaire.links.smsSentDesc', 'The questionnaire link was sent via SMS'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.links.smsError', 'Failed to send SMS'),
        variant: 'destructive',
      });
    },
  });

  // Custom message mutations
  const sendCustomEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          channel: 'email',
          recipient: customEmailAddress,
          message: customMessage 
        }),
      });
      if (!res.ok) throw new Error('Failed to send email');
      return res.json();
    },
    onSuccess: () => {
      setCustomEmailSent(true);
      setCustomMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'messages'] });
      toast({
        title: t('messages.emailSent', 'Email sent'),
        description: t('messages.emailSentDesc', 'Your message was sent via email'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('messages.emailError', 'Failed to send email'),
        variant: 'destructive',
      });
    },
  });

  const sendCustomSmsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          channel: 'sms',
          recipient: customPhoneNumber,
          message: customMessage 
        }),
      });
      if (!res.ok) throw new Error('Failed to send SMS');
      return res.json();
    },
    onSuccess: () => {
      setCustomSmsSent(true);
      setCustomMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'messages'] });
      toast({
        title: t('messages.smsSent', 'SMS sent'),
        description: t('messages.smsSentDesc', 'Your message was sent via SMS'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('messages.smsError', 'Failed to send SMS'),
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (open && !generatedLink && activeHospital?.id) {
      generateLinkMutation.mutate();
    }
  }, [open, activeHospital?.id]);

  const handleSendCustomEmail = () => {
    if (!customEmailAddress || !customMessage.trim()) return;
    sendCustomEmailMutation.mutate();
  };

  const handleSendCustomSms = () => {
    if (!customPhoneNumber || !customMessage.trim()) return;
    sendCustomSmsMutation.mutate();
  };

  const isSendingCustomEmail = sendCustomEmailMutation.isPending;
  const isSendingCustomSms = sendCustomSmsMutation.isPending;

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

  const handleSendSms = () => {
    if (!phoneNumber || !generatedLink) return;
    sendSmsMutation.mutate();
  };

  const isGenerating = generateLinkMutation.isPending;
  const isSending = sendEmailMutation.isPending;
  const isSendingSms = sendSmsMutation.isPending;

  // Don't render if questionnaire addon is disabled
  if (!addons.questionnaire) {
    return null;
  }

  // Build unified communication history
  const getCommunicationHistory = () => {
    const history: Array<{
      id: string;
      type: 'questionnaire' | 'message';
      channel: 'email' | 'sms';
      recipient: string;
      date: Date;
      status?: string;
      preview?: string;
    }> = [];

    // Add questionnaire sends
    if (existingLinks) {
      existingLinks.forEach(link => {
        if (link.emailSent && link.emailSentAt) {
          history.push({
            id: `q-email-${link.id}`,
            type: 'questionnaire',
            channel: 'email',
            recipient: link.emailSentTo || '',
            date: new Date(link.emailSentAt),
            status: link.status,
          });
        }
        if (link.smsSent && link.smsSentAt) {
          history.push({
            id: `q-sms-${link.id}`,
            type: 'questionnaire',
            channel: 'sms',
            recipient: link.smsSentTo || '',
            date: new Date(link.smsSentAt),
            status: link.status,
          });
        }
      });
    }

    // Add custom messages
    if (patientMessages) {
      patientMessages.forEach(msg => {
        history.push({
          id: `m-${msg.id}`,
          type: 'message',
          channel: msg.channel as 'email' | 'sms',
          recipient: msg.recipient,
          date: new Date(msg.createdAt!),
          preview: msg.message.substring(0, 50) + (msg.message.length > 50 ? '...' : ''),
        });
      });
    }

    // Sort by date descending
    return history.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const communicationHistory = getCommunicationHistory();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-send-questionnaire">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {t('messages.dialogTitle', 'Patient Communication')}
          </DialogTitle>
          <DialogDescription>
            {t('messages.dialogDescription', `Send questionnaire or message to ${patientName}`)}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="questionnaire" className="flex items-center gap-2" data-testid="tab-questionnaire">
              <FileText className="h-4 w-4" />
              {t('messages.tabs.questionnaire', 'Questionnaire')}
            </TabsTrigger>
            <TabsTrigger value="message" className="flex items-center gap-2" data-testid="tab-message">
              <MessageSquare className="h-4 w-4" />
              {t('messages.tabs.customMessage', 'Custom Message')}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2" data-testid="tab-history">
              <Clock className="h-4 w-4" />
              {t('messages.tabs.history', 'History')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            {/* Questionnaire Tab */}
            <TabsContent value="questionnaire" className="mt-4 space-y-4">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {t('questionnaire.send.generating', 'Generating link...')}
                  </p>
                </div>
              ) : generatedLink ? (
                <div className="space-y-4">
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
                    <Label>{t('questionnaire.send.orSendEmail', 'Send via email')}</Label>
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
                  </div>

                  {isSmsConfigured && (
                    <div className="border-t pt-4 space-y-3">
                      <Label>{t('questionnaire.send.orSendSms', 'Send via SMS')}</Label>
                      <div className="flex gap-2">
                        <PhoneInputWithCountry
                          placeholder={t('questionnaire.links.phonePlaceholder', '79 123 45 67')}
                          value={phoneNumber}
                          onChange={(value) => setPhoneNumber(value)}
                          disabled={smsSent}
                          data-testid="input-send-sms"
                        />
                        <Button
                          onClick={handleSendSms}
                          disabled={!phoneNumber || isSendingSms || smsSent}
                          className="shrink-0"
                          data-testid="button-send-sms"
                        >
                          {isSendingSms ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : smsSent ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              {t('questionnaire.send.sent', 'Sent')}
                            </>
                          ) : (
                            <>
                              <MessageSquare className="h-4 w-4 mr-1" />
                              {t('questionnaire.send.sendSms', 'SMS')}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </TabsContent>

            {/* Custom Message Tab */}
            <TabsContent value="message" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{t('messages.messageLabel', 'Your message')}</Label>
                <Textarea
                  placeholder={t('messages.messagePlaceholder', 'Write your message here...')}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={4}
                  data-testid="input-custom-message"
                />
              </div>

              <div className="border-t pt-4 space-y-3">
                <Label>{t('messages.sendViaEmail', 'Send via email')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder={t('questionnaire.links.emailPlaceholder', 'patient@example.com')}
                    value={customEmailAddress}
                    onChange={(e) => setCustomEmailAddress(e.target.value)}
                    disabled={customEmailSent}
                    data-testid="input-custom-email"
                  />
                  <Button
                    onClick={handleSendCustomEmail}
                    disabled={!customEmailAddress || !customMessage.trim() || isSendingCustomEmail || customEmailSent}
                    className="shrink-0"
                    data-testid="button-send-custom-email"
                  >
                    {isSendingCustomEmail ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : customEmailSent ? (
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
              </div>

              {isSmsConfigured && (
                <div className="border-t pt-4 space-y-3">
                  <Label>{t('messages.sendViaSms', 'Send via SMS')}</Label>
                  <div className="flex gap-2">
                    <PhoneInputWithCountry
                      placeholder={t('questionnaire.links.phonePlaceholder', '79 123 45 67')}
                      value={customPhoneNumber}
                      onChange={(value) => setCustomPhoneNumber(value)}
                      disabled={customSmsSent}
                      data-testid="input-custom-sms"
                    />
                    <Button
                      onClick={handleSendCustomSms}
                      disabled={!customPhoneNumber || !customMessage.trim() || isSendingCustomSms || customSmsSent}
                      className="shrink-0"
                      data-testid="button-send-custom-sms"
                    >
                      {isSendingCustomSms ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : customSmsSent ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {t('questionnaire.send.sent', 'Sent')}
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 mr-1" />
                          {t('questionnaire.send.sendSms', 'SMS')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="mt-4">
              {communicationHistory.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-4">
                    {communicationHistory.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-sm"
                        data-testid={`history-item-${item.id}`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {item.type === 'questionnaire' ? (
                            <FileText className="h-4 w-4 text-blue-500" />
                          ) : (
                            <MessageSquare className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {item.type === 'questionnaire' 
                                ? t('messages.historyQuestionnaire', 'Questionnaire')
                                : t('messages.historyMessage', 'Message')}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              {item.channel === 'email' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                              {item.recipient}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(item.date, 'dd.MM.yyyy HH:mm', { locale: de })}
                            {item.status && (
                              <span className="ml-2">
                                • {item.status === 'submitted' ? t('questionnaire.status.submitted', 'Submitted') :
                                   item.status === 'reviewed' ? t('questionnaire.status.reviewed', 'Reviewed') :
                                   item.status === 'pending' ? t('questionnaire.status.pending', 'Pending') :
                                   item.status}
                              </span>
                            )}
                          </div>
                          {item.preview && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{item.preview}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">{t('messages.noHistory', 'No communication history yet')}</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
