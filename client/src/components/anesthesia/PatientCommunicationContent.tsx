import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Mail, Loader2, CheckCircle, MessageSquare, Clock, FileText, Send, Smartphone, Info, Plus, X, Languages } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { PatientMessage } from "@shared/schema";

interface PatientCommunicationContentProps {
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  isEnabled?: boolean;
}

type SendMedium = "email" | "sms";

export function PatientCommunicationContent({
  patientId,
  patientName,
  patientEmail,
  patientPhone,
  isEnabled = true,
}: PatientCommunicationContentProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { addons } = useHospitalAddons();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [generatedLink, setGeneratedLink] = useState<{ token: string; linkId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [isComposing, setIsComposing] = useState(false);
  const [sendMedium, setSendMedium] = useState<SendMedium>("email");
  const [emailAddress, setEmailAddress] = useState(patientEmail || "");
  const [phoneNumber, setPhoneNumber] = useState(patientPhone || "");
  const [customMessage, setCustomMessage] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [messageLang, setMessageLang] = useState<'de' | 'en'>(i18n.language?.startsWith('de') ? 'de' : 'en');

  const [copiedLinks, setCopiedLinks] = useState<Record<string, boolean>>({});

  const getQuestionnaireMessageTemplate = (lang: 'de' | 'en', url: string) => {
    const clinicName = activeHospital?.name || 'Klinik';
    if (lang === 'de') {
      return `${clinicName}: Bitte füllen Sie Ihren präoperativen Fragebogen aus:\n${url}`;
    } else {
      return `${clinicName}: Please complete your pre-operative questionnaire:\n${url}`;
    }
  };

  const getInfoflyerMessageTemplate = (lang: 'de' | 'en', flyers: Array<{ unitName: string; downloadUrl: string }>) => {
    const clinicName = activeHospital?.name || 'Klinik';
    const flyerLinks = flyers.map(f => `• ${f.unitName}: ${f.downloadUrl}`).join('\n');
    if (lang === 'de') {
      return `${clinicName}: Wichtige Dokumente für Ihre Vorbereitung:\n${flyerLinks}`;
    } else {
      return `${clinicName}: Important documents for your preparation:\n${flyerLinks}`;
    }
  };

  const handleCopyIndividualLink = async (linkId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinks(prev => ({ ...prev, [linkId]: true }));
      setTimeout(() => {
        setCopiedLinks(prev => ({ ...prev, [linkId]: false }));
      }, 2000);
      toast({
        title: t('common.copied', 'Copied'),
        description: t('common.linkCopied', 'Link copied to clipboard'),
      });
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description: t('common.copyFailed', 'Failed to copy link'),
        variant: "destructive",
      });
    }
  };

  const translateMessage = (msg: string, fromLang: 'de' | 'en', toLang: 'de' | 'en'): string => {
    if (!msg.trim()) return msg;
    
    if (fromLang === 'de' && toLang === 'en') {
      return msg
        .replace(/Bitte füllen Sie Ihren präoperativen Fragebogen aus:/g, 'Please complete your pre-operative questionnaire:')
        .replace(/Wichtige Dokumente für Ihre Vorbereitung:/g, 'Important documents for your preparation:')
        .replace(/Wichtige Dokumente:/g, 'Important documents:')
        .replace(/Bitte beachten Sie die folgenden Informationen:/g, 'Please review the following information:')
        .replace(/Liebe(r)? Patient(in)?/g, 'Dear Patient')
        .replace(/Mit freundlichen Grüßen/g, 'Kind regards');
    } else if (fromLang === 'en' && toLang === 'de') {
      return msg
        .replace(/Please complete your pre-operative questionnaire:/g, 'Bitte füllen Sie Ihren präoperativen Fragebogen aus:')
        .replace(/Important documents for your preparation:/g, 'Wichtige Dokumente für Ihre Vorbereitung:')
        .replace(/Important documents:/g, 'Wichtige Dokumente:')
        .replace(/Please review the following information:/g, 'Bitte beachten Sie die folgenden Informationen:')
        .replace(/Dear Patient/g, 'Liebe(r) Patient(in)')
        .replace(/Kind regards/g, 'Mit freundlichen Grüßen');
    }
    return msg;
  };

  useEffect(() => {
    if (isEnabled) {
      setGeneratedLink(null);
      setEmailAddress(patientEmail || "");
      setPhoneNumber(patientPhone || "");
      setCopied(false);
      setCustomMessage("");
      setIsComposing(false);
      setSendMedium("email");
      setSendSuccess(false);
    }
  }, [patientId, patientEmail, patientPhone, isEnabled]);

  const { data: smsStatus } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/questionnaire/sms-status'],
    enabled: isEnabled,
  });

  const isSmsConfigured = smsStatus?.configured ?? false;

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
    enabled: isEnabled && !!activeHospital?.id,
  });

  const hasInfoflyer = unitSettings?.infoflyerEnabled && unitSettings?.infoflyerContent;

  const { data: patientFlyers } = useQuery<{ flyers: Array<{ unitName: string; downloadUrl: string }> }>({
    queryKey: ['/api/patients', patientId, 'info-flyers'],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/info-flyers`, {
        headers: {
          'X-Hospital-Id': activeHospital?.id || '',
        },
        credentials: 'include',
      });
      if (!res.ok) return { flyers: [] };
      return res.json();
    },
    enabled: isEnabled && !!patientId && !!activeHospital?.id,
  });

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
    enabled: isEnabled && !!patientId && !!activeHospital?.id,
  });

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
    enabled: isEnabled && !!patientId && !!activeHospital?.id,
  });

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
      if (!emailAddress || !customMessage.trim()) return;
      sendEmailMutation.mutate();
    } else {
      if (!phoneNumber || !customMessage.trim()) return;
      sendSmsMutation.mutate();
    }
  };

  const isGenerating = generateLinkMutation.isPending;
  const isSending = sendEmailMutation.isPending || sendSmsMutation.isPending;

  const canSend = () => {
    const hasRecipient = sendMedium === "email" ? !!emailAddress : !!phoneNumber;
    return hasRecipient && !!customMessage.trim();
  };

  if (!addons.questionnaire) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">{t('messages.addonDisabled', 'Patient communication is not enabled')}</p>
      </div>
    );
  }

  const getCommunicationHistory = () => {
    const history: Array<{
      id: string;
      type: 'questionnaire' | 'message' | 'infoflyer' | 'auto_questionnaire' | 'auto_reminder';
      channel: 'email' | 'sms';
      recipient: string;
      date: Date;
      status?: string;
      message?: string;
      isAutomatic?: boolean;
      linkToken?: string;
    }> = [];

    // First, collect all auto_questionnaire messages to know which questionnaire links are covered
    const coveredLinkTokens = new Set<string>();
    if (patientMessages) {
      patientMessages.forEach(msg => {
        const msgAny = msg as any;
        const messageType = msgAny.messageType || 'manual';
        if (messageType === 'auto_questionnaire' && msg.message) {
          // Extract token from message content
          const tokenMatch = msg.message.match(/\/questionnaire\/([a-zA-Z0-9_-]+)/);
          if (tokenMatch) {
            coveredLinkTokens.add(tokenMatch[1]);
          }
        }
      });
    }

    // Add questionnaire links that DON'T have a corresponding auto_questionnaire message
    if (existingLinks) {
      existingLinks.forEach(link => {
        // Skip if this link is covered by an auto_questionnaire message
        if (coveredLinkTokens.has(link.token)) {
          return;
        }
        
        if (link.emailSent && link.emailSentAt) {
          history.push({
            id: `q-email-${link.id}`,
            type: 'questionnaire',
            channel: 'email',
            recipient: link.emailSentTo || '',
            date: new Date(link.emailSentAt),
            status: link.status,
            linkToken: link.token,
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
            linkToken: link.token,
          });
        }
      });
    }

    if (patientMessages) {
      patientMessages.forEach(msg => {
        const msgAny = msg as any;
        const isAutomatic = msgAny.isAutomatic === true;
        const messageType = msgAny.messageType || 'manual';
        
        let type: 'questionnaire' | 'message' | 'infoflyer' | 'auto_questionnaire' | 'auto_reminder' = 'message';
        if (msgAny.type === 'infoflyer') {
          type = 'infoflyer';
        } else if (messageType === 'auto_questionnaire') {
          type = 'auto_questionnaire';
        } else if (messageType === 'auto_reminder') {
          type = 'auto_reminder';
        }
        
        // Find link status for auto_questionnaire messages
        let status: string | undefined;
        if (messageType === 'auto_questionnaire' && msg.message) {
          const tokenMatch = msg.message.match(/\/questionnaire\/([a-zA-Z0-9_-]+)/);
          if (tokenMatch && existingLinks) {
            const matchedLink = existingLinks.find((l: any) => l.token === tokenMatch[1]);
            if (matchedLink) {
              status = matchedLink.status;
            }
          }
        }
        
        history.push({
          id: `m-${msg.id}`,
          type,
          channel: msg.channel as 'email' | 'sms',
          recipient: msg.recipient,
          date: new Date(msg.createdAt!),
          message: msg.message,
          isAutomatic,
          status,
        });
      });
    }

    return history.sort((a, b) => a.date.getTime() - b.date.getTime());
  };

  const communicationHistory = getCommunicationHistory();

  const getMessageTypeIcon = (type: 'questionnaire' | 'message' | 'infoflyer' | 'auto_questionnaire' | 'auto_reminder') => {
    if (type === 'questionnaire' || type === 'auto_questionnaire') {
      return <FileText className="h-4 w-4" />;
    } else if (type === 'infoflyer') {
      return <Info className="h-4 w-4" />;
    } else if (type === 'auto_reminder') {
      return <Clock className="h-4 w-4" />;
    } else {
      return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getMessageBubbleColor = (type: 'questionnaire' | 'message' | 'infoflyer' | 'auto_questionnaire' | 'auto_reminder', isAutomatic?: boolean) => {
    if (isAutomatic || type === 'auto_questionnaire' || type === 'auto_reminder') {
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
    }
    switch (type) {
      case 'questionnaire':
        return 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      case 'infoflyer':
        return 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800';
      default:
        return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800';
    }
  };
  
  const getMessageTypeLabel = (type: 'questionnaire' | 'message' | 'infoflyer' | 'auto_questionnaire' | 'auto_reminder', isAutomatic?: boolean) => {
    if (type === 'auto_questionnaire') {
      return t('messages.historyAutoQuestionnaire', '🤖 Auto: Questionnaire');
    } else if (type === 'auto_reminder') {
      return t('messages.historyAutoReminder', '🤖 Auto: Surgery Reminder');
    } else if (type === 'questionnaire') {
      return t('messages.historyQuestionnaire', 'Questionnaire');
    } else if (type === 'infoflyer') {
      return t('messages.historyInfoflyer', 'Infoflyer');
    } else if (isAutomatic) {
      return t('messages.historyAutoMessage', '🤖 Auto: Message');
    } else {
      return t('messages.historyMessage', 'Message');
    }
  };

  const getQuestionnaireStatusBadge = (status: string | undefined) => {
    if (!status) return null;
    const statusConfig = {
      pending: { label: t('questionnaire.status.pending', 'Pending'), color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700' },
      started: { label: t('questionnaire.status.started', 'Started'), color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700' },
      submitted: { label: t('questionnaire.status.submitted', 'Submitted'), color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700' },
      reviewed: { label: t('questionnaire.status.reviewed', 'Reviewed'), color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700' },
      expired: { label: t('questionnaire.status.expired', 'Expired'), color: 'bg-gray-100 dark:bg-gray-900/30 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const renderMessageContent = (text: string, links: any[]) => {
    // Pattern to match questionnaire URLs like /questionnaire/TOKEN or full URLs
    const questionnairePattern = /(?:https?:\/\/[^\s]+)?\/questionnaire\/([a-zA-Z0-9_-]+)/g;
    
    const parts: Array<{ type: 'text' | 'questionnaire'; content: string; token?: string; link?: any }> = [];
    let lastIndex = 0;
    let match;
    
    while ((match = questionnairePattern.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      
      const token = match[1];
      const matchedLink = links.find(l => l.token === token);
      
      parts.push({ 
        type: 'questionnaire', 
        content: match[0], 
        token,
        link: matchedLink 
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }
    
    if (parts.length === 0) {
      return <span>{text}</span>;
    }
    
    return (
      <span className="whitespace-pre-wrap">
        {parts.map((part, idx) => {
          if (part.type === 'text') {
            return <span key={idx}>{part.content}</span>;
          }
          
          // Render questionnaire link as inline object
          const link = part.link;
          const status = link?.status || 'pending';
          
          return (
            <span 
              key={idx} 
              className="inline-flex items-center gap-1.5 mx-0.5 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 rounded-md"
              data-testid={`questionnaire-link-${part.token}`}
            >
              <FileText className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
              <a 
                href={`/questionnaire/${part.token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
              >
                {t('messages.questionnaireLink', 'Questionnaire')}
              </a>
              {getQuestionnaireStatusBadge(status)}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" data-testid="patient-communication-content">
      <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollRef}>
        <div 
          className="py-4 space-y-3"
          onClick={() => isComposing && setIsComposing(false)}
        >
          {communicationHistory.length > 0 ? (
            communicationHistory.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border ${getMessageBubbleColor(item.type, item.isAutomatic)} ml-auto max-w-[85%]`}
                data-testid={`history-item-${item.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`p-1 rounded ${
                    (item.isAutomatic || item.type === 'auto_questionnaire' || item.type === 'auto_reminder') 
                      ? 'bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-200' :
                    item.type === 'questionnaire' ? 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200' :
                    item.type === 'infoflyer' ? 'bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200' :
                    'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-200'
                  }`}>
                    {getMessageTypeIcon(item.type)}
                  </span>
                  <span className="text-sm font-medium">
                    {getMessageTypeLabel(item.type, item.isAutomatic)}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                    {item.channel === 'email' ? <Mail className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1 truncate">
                  {t('messages.sentTo', 'To')}: {item.recipient}
                </p>
                {item.message && (
                  <div className="text-sm text-foreground/80 mb-1">
                    {renderMessageContent(item.message, existingLinks || [])}
                  </div>
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

      <div className={`border-t bg-muted/30 shrink-0 ${isComposing ? 'max-h-[350px] overflow-auto' : ''}`}>
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
            <div className="flex items-center justify-between shrink-0">
              <Label className="text-sm font-medium">{t('messages.compose.newMessage', 'New Message')}</Label>
              <Button variant="ghost" size="icon" onClick={() => setIsComposing(false)} className="h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-1.5 flex-wrap items-center">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  let link = generatedLink;
                  if (!link) {
                    const result = await generateLinkMutation.mutateAsync();
                    link = { token: result.link.token, linkId: result.link.id };
                    setGeneratedLink(link);
                  }
                  if (link) {
                    const url = `${window.location.origin}/questionnaire/${link.token}`;
                    const templateText = getQuestionnaireMessageTemplate(messageLang, url);
                    setCustomMessage(prev => {
                      if (!prev.trim()) return templateText;
                      return prev + '\n\n' + templateText;
                    });
                  }
                }}
                disabled={isGenerating}
                data-testid="button-append-questionnaire"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <FileText className="h-3 w-3 mr-1" />
                )}
                {t('messages.compose.addQuestionnaire', '+ Questionnaire')}
              </Button>
              {(patientFlyers?.flyers?.length || 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (patientFlyers?.flyers) {
                      const templateText = getInfoflyerMessageTemplate(messageLang, patientFlyers.flyers);
                      setCustomMessage(prev => {
                        if (!prev.trim()) return templateText;
                        return prev + '\n\n' + templateText;
                      });
                    }
                  }}
                  data-testid="button-append-infoflyer"
                >
                  <Info className="h-3 w-3 mr-1" />
                  {t('messages.compose.addInfoflyer', '+ Infoflyer')}
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs ml-auto"
                onClick={() => {
                  const newLang = messageLang === 'de' ? 'en' : 'de';
                  const translated = translateMessage(customMessage, messageLang, newLang);
                  setCustomMessage(translated);
                  setMessageLang(newLang);
                }}
                data-testid="button-translate-message"
                title={messageLang === 'de' ? 'Translate to English' : 'Auf Deutsch übersetzen'}
              >
                <Languages className="h-3 w-3 mr-1" />
                {messageLang === 'de' ? 'DE → EN' : 'EN → DE'}
              </Button>
            </div>

            <Textarea
              placeholder={t('messages.messagePlaceholder', 'Write your message here...')}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={7}
              className="text-sm resize-none w-full"
              data-testid="input-custom-message"
            />

            {(() => {
              const detectedLinks: Array<{ label: string; url: string; id: string }> = [];
              
              if (generatedLink) {
                const questionnaireUrl = `${window.location.origin}/questionnaire/${generatedLink.token}`;
                if (customMessage.includes(questionnaireUrl)) {
                  detectedLinks.push({ 
                    label: t('messages.compose.questionnaire', 'Questionnaire'), 
                    url: questionnaireUrl, 
                    id: 'questionnaire' 
                  });
                }
              }
              
              patientFlyers?.flyers?.forEach((flyer, index) => {
                if (customMessage.includes(flyer.downloadUrl)) {
                  detectedLinks.push({ 
                    label: flyer.unitName, 
                    url: flyer.downloadUrl, 
                    id: `flyer-${index}` 
                  });
                }
              });

              if (detectedLinks.length === 0) return null;

              return (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>🔗</span>
                  {detectedLinks.map((link, idx) => (
                    <button
                      key={link.id}
                      onClick={() => handleCopyIndividualLink(link.id, link.url)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                      title={t('common.copyLink', 'Copy link')}
                      data-testid={`button-copy-${link.id}`}
                    >
                      <span className="truncate max-w-[100px]">{link.label}</span>
                      {copiedLinks[link.id] ? (
                        <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <Copy className="h-3 w-3 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              );
            })()}

            <div className="flex gap-2 items-end">
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
    </div>
  );
}
