import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Copy, Mail, Loader2, CheckCircle, MessageSquare, Clock, FileText, Send, ChevronDown, ChevronUp, Smartphone, Info } from "lucide-react";
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

type MessageType = "questionnaire" | "custom" | "infoflyer";
type SendMedium = "email" | "sms";

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
  const [copied, setCopied] = useState(false);
  
  // Compose section state
  const [composeOpen, setComposeOpen] = useState(false);
  const [messageType, setMessageType] = useState<MessageType>("questionnaire");
  const [sendMedium, setSendMedium] = useState<SendMedium>("email");
  const [emailAddress, setEmailAddress] = useState(patientEmail || "");
  const [phoneNumber, setPhoneNumber] = useState(patientPhone || "");
  const [customMessage, setCustomMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  // Check if SMS is configured
  const { data: smsStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/questionnaire/sms-status'],
    enabled: open,
  });

  const isSmsConfigured = smsStatus?.configured ?? false;

  // Check if anesthesia unit has infoflyer configured
  const { data: unitSettings } = useQuery<{ infoflyerEnabled?: boolean; infoflyerContent?: string }>({
    queryKey: ['/api/anesthesia/unit-settings', activeHospital?.id],
    queryFn: async () => {
      const res = await fetch(`/api/anesthesia/unit-settings`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) return { infoflyerEnabled: false };
      return res.json();
    },
    enabled: open && !!activeHospital?.id,
  });

  const hasInfoflyer = unitSettings?.infoflyerEnabled && unitSettings?.infoflyerContent;

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

  useEffect(() => {
    if (open) {
      setGeneratedLink(null);
      setEmailAddress(patientEmail || "");
      setPhoneNumber(patientPhone || "");
      setCopied(false);
      setCustomMessage("");
      setComposeOpen(false);
      setMessageType("questionnaire");
      setSendMedium("email");
      setSendSuccess(false);
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
      if (messageType === "questionnaire") {
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
      } else if (messageType === "custom") {
        const res = await fetch(`/api/patients/${patientId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hospital-Id': activeHospital?.id || '',
          },
          credentials: 'include',
          body: JSON.stringify({ 
            channel: 'email',
            recipient: emailAddress,
            message: customMessage 
          }),
        });
        if (!res.ok) throw new Error('Failed to send email');
        return res.json();
      } else if (messageType === "infoflyer") {
        const res = await fetch(`/api/patients/${patientId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hospital-Id': activeHospital?.id || '',
          },
          credentials: 'include',
          body: JSON.stringify({ 
            channel: 'email',
            recipient: emailAddress,
            message: unitSettings?.infoflyerContent || '',
            type: 'infoflyer'
          }),
        });
        if (!res.ok) throw new Error('Failed to send email');
        return res.json();
      }
    },
    onSuccess: () => {
      setSendSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'messages'] });
      toast({
        title: t('questionnaire.links.emailSent'),
        description: t('questionnaire.links.emailSentDesc'),
      });
      setTimeout(() => {
        setSendSuccess(false);
        setComposeOpen(false);
        setCustomMessage("");
      }, 1500);
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
      if (messageType === "questionnaire") {
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
      } else if (messageType === "custom") {
        const res = await fetch(`/api/patients/${patientId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hospital-Id': activeHospital?.id || '',
          },
          credentials: 'include',
          body: JSON.stringify({ 
            channel: 'sms',
            recipient: phoneNumber,
            message: customMessage 
          }),
        });
        if (!res.ok) throw new Error('Failed to send SMS');
        return res.json();
      } else if (messageType === "infoflyer") {
        const res = await fetch(`/api/patients/${patientId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Hospital-Id': activeHospital?.id || '',
          },
          credentials: 'include',
          body: JSON.stringify({ 
            channel: 'sms',
            recipient: phoneNumber,
            message: unitSettings?.infoflyerContent || '',
            type: 'infoflyer'
          }),
        });
        if (!res.ok) throw new Error('Failed to send SMS');
        return res.json();
      }
    },
    onSuccess: () => {
      setSendSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'messages'] });
      toast({
        title: t('questionnaire.links.smsSent', 'SMS sent'),
        description: t('questionnaire.links.smsSentDesc', 'Message sent via SMS'),
      });
      setTimeout(() => {
        setSendSuccess(false);
        setComposeOpen(false);
        setCustomMessage("");
      }, 1500);
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('questionnaire.links.smsError', 'Failed to send SMS'),
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

  const handleSend = () => {
    if (sendMedium === "email") {
      if (!emailAddress) return;
      if (messageType === "custom" && !customMessage.trim()) return;
      sendEmailMutation.mutate();
    } else {
      if (!phoneNumber) return;
      if (messageType === "custom" && !customMessage.trim()) return;
      sendSmsMutation.mutate();
    }
  };

  const isGenerating = generateLinkMutation.isPending;
  const isSending = sendEmailMutation.isPending || sendSmsMutation.isPending;

  const canSend = () => {
    const hasRecipient = sendMedium === "email" ? !!emailAddress : !!phoneNumber;
    if (messageType === "questionnaire") {
      return hasRecipient && !!generatedLink;
    } else if (messageType === "custom") {
      return hasRecipient && !!customMessage.trim();
    } else if (messageType === "infoflyer") {
      return hasRecipient && hasInfoflyer;
    }
    return false;
  };

  // Don't render if questionnaire addon is disabled
  if (!addons.questionnaire) {
    return null;
  }

  // Build unified communication history
  const getCommunicationHistory = () => {
    const history: Array<{
      id: string;
      type: 'questionnaire' | 'message' | 'infoflyer';
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
          type: (msg as any).type === 'infoflyer' ? 'infoflyer' : 'message',
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

  const getMessageTypeLabel = (type: MessageType) => {
    switch (type) {
      case "questionnaire":
        return t('messages.compose.questionnaire', 'Questionnaire Link');
      case "custom":
        return t('messages.compose.custom', 'Custom Message');
      case "infoflyer":
        return t('messages.compose.infoflyer', 'Anesthesia Infoflyer');
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col" data-testid="dialog-send-questionnaire">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            {t('messages.dialogTitle', 'Patient Communication')}
          </DialogTitle>
          <DialogDescription>
            {patientName}
          </DialogDescription>
        </DialogHeader>

        {/* Communication History - Main Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-[250px]">
            {communicationHistory.length > 0 ? (
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
                      ) : item.type === 'infoflyer' ? (
                        <Info className="h-4 w-4 text-purple-500" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {item.type === 'questionnaire' 
                            ? t('messages.historyQuestionnaire', 'Questionnaire')
                            : item.type === 'infoflyer'
                            ? t('messages.historyInfoflyer', 'Infoflyer')
                            : t('messages.historyMessage', 'Message')}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {item.channel === 'email' ? <Mail className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
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
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">{t('messages.noHistory', 'No communication history yet')}</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Compose Section - Expandable */}
        <div className="border-t pt-3">
          <Collapsible open={composeOpen} onOpenChange={setComposeOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between"
                data-testid="button-compose-message"
              >
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  {t('messages.compose.title', 'Send New Message')}
                </span>
                {composeOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {/* Message Type Selection */}
              <div className="space-y-2">
                <Label>{t('messages.compose.messageType', 'What to send')}</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={messageType === "questionnaire" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageType("questionnaire")}
                    data-testid="button-type-questionnaire"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {t('messages.compose.questionnaire', 'Questionnaire')}
                  </Button>
                  <Button
                    variant={messageType === "custom" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMessageType("custom")}
                    data-testid="button-type-custom"
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    {t('messages.compose.custom', 'Custom')}
                  </Button>
                  {hasInfoflyer && (
                    <Button
                      variant={messageType === "infoflyer" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMessageType("infoflyer")}
                      data-testid="button-type-infoflyer"
                    >
                      <Info className="h-4 w-4 mr-1" />
                      {t('messages.compose.infoflyer', 'Infoflyer')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Questionnaire Link Display */}
              {messageType === "questionnaire" && (
                <div className="space-y-2">
                  {isGenerating ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('questionnaire.send.generating', 'Generating link...')}
                    </div>
                  ) : generatedLink ? (
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
                  ) : null}
                </div>
              )}

              {/* Custom Message Input */}
              {messageType === "custom" && (
                <div className="space-y-2">
                  <Label>{t('messages.messageLabel', 'Your message')}</Label>
                  <Textarea
                    placeholder={t('messages.messagePlaceholder', 'Write your message here...')}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={3}
                    data-testid="input-custom-message"
                  />
                </div>
              )}

              {/* Infoflyer Preview */}
              {messageType === "infoflyer" && hasInfoflyer && (
                <div className="space-y-2">
                  <Label>{t('messages.compose.infoflyerPreview', 'Infoflyer content will be sent')}</Label>
                  <div className="p-2 rounded-md bg-muted/50 text-sm text-muted-foreground max-h-20 overflow-y-auto">
                    {unitSettings?.infoflyerContent?.substring(0, 150)}
                    {(unitSettings?.infoflyerContent?.length || 0) > 150 && '...'}
                  </div>
                </div>
              )}

              {/* Send Medium Selection */}
              <div className="space-y-2">
                <Label>{t('messages.compose.sendVia', 'Send via')}</Label>
                <div className="flex gap-2">
                  <Button
                    variant={sendMedium === "email" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSendMedium("email")}
                    data-testid="button-medium-email"
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    {t('common.email', 'Email')}
                  </Button>
                  {isSmsConfigured && (
                    <Button
                      variant={sendMedium === "sms" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSendMedium("sms")}
                      data-testid="button-medium-sms"
                    >
                      <Smartphone className="h-4 w-4 mr-1" />
                      {t('common.sms', 'SMS')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Recipient Input */}
              <div className="space-y-2">
                <Label>
                  {sendMedium === "email" 
                    ? t('messages.compose.emailAddress', 'Email address')
                    : t('messages.compose.phoneNumber', 'Phone number')}
                </Label>
                {sendMedium === "email" ? (
                  <Input
                    type="email"
                    placeholder={t('questionnaire.links.emailPlaceholder', 'patient@example.com')}
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    data-testid="input-send-email"
                  />
                ) : (
                  <PhoneInputWithCountry
                    placeholder={t('questionnaire.links.phonePlaceholder', '79 123 45 67')}
                    value={phoneNumber}
                    onChange={(value) => setPhoneNumber(value)}
                    data-testid="input-send-sms"
                  />
                )}
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={!canSend() || isSending || sendSuccess}
                className="w-full"
                data-testid="button-send-message"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.sending', 'Sending...')}
                  </>
                ) : sendSuccess ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {t('questionnaire.send.sent', 'Sent')}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('messages.compose.sendButton', 'Send')} {getMessageTypeLabel(messageType)}
                  </>
                )}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
