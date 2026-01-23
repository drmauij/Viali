import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Mail, Loader2, CheckCircle, MessageSquare, Clock, FileText, Send, Smartphone, Info, Plus, X } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [generatedLink, setGeneratedLink] = useState<{ token: string; linkId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Compose section state
  const [isComposing, setIsComposing] = useState(false);
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
      setIsComposing(false);
      setMessageType("questionnaire");
      setSendMedium("email");
      setSendSuccess(false);
    }
  }, [open, patientEmail, patientPhone]);

  // Scroll to bottom when history changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [existingLinks, patientMessages]);

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
        setIsComposing(false);
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
        title: t('questionnaire.links.smsSent', 'SMS sent!'),
        description: t('questionnaire.links.smsSentDesc', 'Message was delivered.'),
      });
      setTimeout(() => {
        setSendSuccess(false);
        setIsComposing(false);
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
    if (open && !generatedLink && activeHospital?.id && isComposing && messageType === "questionnaire") {
      generateLinkMutation.mutate();
    }
  }, [open, activeHospital?.id, isComposing, messageType]);

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
          preview: msg.message.substring(0, 80) + (msg.message.length > 80 ? '...' : ''),
        });
      });
    }

    // Sort by date ascending (oldest first, like a chat)
    return history.sort((a, b) => a.date.getTime() - b.date.getTime());
  };

  const communicationHistory = getCommunicationHistory();

  const getMessageTypeIcon = (type: 'questionnaire' | 'message' | 'infoflyer', channel: 'email' | 'sms') => {
    if (type === 'questionnaire') {
      return <FileText className="h-4 w-4" />;
    } else if (type === 'infoflyer') {
      return <Info className="h-4 w-4" />;
    } else {
      return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMessageBubbleColor = (type: 'questionnaire' | 'message' | 'infoflyer') => {
    switch (type) {
      case 'questionnaire':
        return 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      case 'infoflyer':
        return 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[80vh] max-h-[600px] flex flex-col p-0" data-testid="dialog-send-questionnaire">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('messages.dialogTitle', 'Patient Communication')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {patientName}
          </DialogDescription>
        </DialogHeader>

        {/* Chat History - Scrollable Area */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-3">
            {communicationHistory.length > 0 ? (
              communicationHistory.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border ${getMessageBubbleColor(item.type)} ml-auto max-w-[85%]`}
                  data-testid={`history-item-${item.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`p-1 rounded ${
                      item.type === 'questionnaire' ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200' :
                      item.type === 'infoflyer' ? 'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200' :
                      'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-200'
                    }`}>
                      {getMessageTypeIcon(item.type, item.channel)}
                    </span>
                    <span className="text-sm font-medium">
                      {item.type === 'questionnaire' 
                        ? t('messages.historyQuestionnaire', 'Questionnaire')
                        : item.type === 'infoflyer'
                        ? t('messages.historyInfoflyer', 'Infoflyer')
                        : t('messages.historyMessage', 'Message')}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                      {item.channel === 'email' ? <Mail className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1 truncate">
                    {t('messages.sentTo', 'To')}: {item.recipient}
                  </p>
                  {item.preview && (
                    <p className="text-sm text-foreground/80 mb-1">{item.preview}</p>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{format(item.date, 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                    {item.status && (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        item.status === 'submitted' ? 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-200' :
                        item.status === 'reviewed' ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200' :
                        'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200'
                      }`}>
                        {item.status === 'submitted' ? t('questionnaire.status.submitted', 'Submitted') :
                         item.status === 'reviewed' ? t('questionnaire.status.reviewed', 'Reviewed') :
                         item.status === 'pending' ? t('questionnaire.status.pending', 'Pending') :
                         item.status}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">{t('messages.noHistory', 'No communication history yet')}</p>
                <p className="text-xs mt-1">{t('messages.startConversation', 'Send your first message below')}</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Compose Section - Fixed at Bottom */}
        <div className="border-t bg-muted/30 shrink-0">
          {!isComposing ? (
            <div className="p-3">
              <Button 
                onClick={() => setIsComposing(true)}
                className="w-full"
                data-testid="button-compose-message"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('messages.compose.title', 'Send New Message')}
              </Button>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {/* Close button */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{t('messages.compose.newMessage', 'New Message')}</Label>
                <Button variant="ghost" size="icon" onClick={() => setIsComposing(false)} className="h-6 w-6">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Message Type Pills */}
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  variant={messageType === "questionnaire" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMessageType("questionnaire")}
                  data-testid="button-type-questionnaire"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {t('messages.compose.questionnaire', 'Questionnaire')}
                </Button>
                <Button
                  variant={messageType === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMessageType("custom")}
                  data-testid="button-type-custom"
                >
                  <MessageSquare className="h-3 w-3 mr-1" />
                  {t('messages.compose.custom', 'Custom')}
                </Button>
                {hasInfoflyer && (
                  <Button
                    variant={messageType === "infoflyer" ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setMessageType("infoflyer")}
                    data-testid="button-type-infoflyer"
                  >
                    <Info className="h-3 w-3 mr-1" />
                    {t('messages.compose.infoflyer', 'Infoflyer')}
                  </Button>
                )}
              </div>

              {/* Questionnaire Link Display */}
              {messageType === "questionnaire" && (
                <div>
                  {isGenerating ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('questionnaire.send.generating', 'Generating link...')}
                    </div>
                  ) : generatedLink ? (
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${window.location.origin}/questionnaire/${generatedLink.token}`}
                        className="text-xs h-8"
                        data-testid="input-questionnaire-link"
                      />
                      <Button
                        variant={copied ? "default" : "outline"}
                        size="icon"
                        onClick={handleCopyLink}
                        className="shrink-0 h-8 w-8"
                        data-testid="button-copy-questionnaire-link"
                      >
                        {copied ? <CheckCircle className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Custom Message Input */}
              {messageType === "custom" && (
                <Textarea
                  placeholder={t('messages.messagePlaceholder', 'Write your message here...')}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={2}
                  className="text-sm resize-none"
                  data-testid="input-custom-message"
                />
              )}

              {/* Infoflyer Preview */}
              {messageType === "infoflyer" && hasInfoflyer && (
                <div className="p-2 rounded-md bg-muted text-xs text-muted-foreground max-h-16 overflow-y-auto">
                  {unitSettings?.infoflyerContent?.substring(0, 150)}
                  {(unitSettings?.infoflyerContent?.length || 0) > 150 && '...'}
                </div>
              )}

              {/* Send Medium + Recipient + Send Button in one row */}
              <div className="flex gap-2 items-end">
                {/* Medium Toggle */}
                <div className="flex gap-1">
                  <Button
                    variant={sendMedium === "email" ? "default" : "outline"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setSendMedium("email")}
                    data-testid="button-medium-email"
                    title={t('common.email', 'Email')}
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                  {isSmsConfigured && (
                    <Button
                      variant={sendMedium === "sms" ? "default" : "outline"}
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => setSendMedium("sms")}
                      data-testid="button-medium-sms"
                      title={t('common.sms', 'SMS')}
                    >
                      <Smartphone className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Recipient Input */}
                <div className="flex-1">
                  {sendMedium === "email" ? (
                    <Input
                      type="email"
                      placeholder={t('questionnaire.links.emailPlaceholder', 'patient@example.com')}
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="h-9"
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
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  data-testid="button-send-message"
                >
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sendSuccess ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
