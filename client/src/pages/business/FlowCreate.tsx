import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Radio, MessageSquare, Tag, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SegmentBuilder, { type SegmentFilter } from "@/components/flows/SegmentBuilder";
import ChannelPicker, { type Channel } from "@/components/flows/ChannelPicker";
import OfferSection from "@/components/flows/OfferSection";
import ReviewSend from "@/components/flows/ReviewSend";
import MessageComposer from "@/components/flows/MessageComposer";
import { BookingSection, type SectionStatus } from "@/components/booking/BookingSection";

type Section = "segment" | "channel" | "compose" | "offer" | "review";

const SECTION_ORDER: Section[] = ["segment", "channel", "compose", "offer", "review"];

export default function FlowCreate() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const { toast } = useToast();

  const [name, setName] = useState(t("flows.newCampaign", "New Campaign"));
  const [activeSection, setActiveSection] = useState<Section>("segment");
  const [completedSections, setCompletedSections] = useState<Set<Section>>(new Set());

  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messageContent, setMessageContent] = useState("");
  const [messageSubject, setMessageSubject] = useState("");
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function goTo(section: Section) {
    setActiveSection(section);
  }

  function completeAndGoTo(current: Section, next: Section) {
    setCompletedSections((prev) => new Set([...prev, current]));
    setActiveSection(next);
  }

  function sectionStatus(section: Section): SectionStatus {
    if (activeSection === section) return "active";
    if (completedSections.has(section)) return "summary";
    const sectionIdx = SECTION_ORDER.indexOf(section);
    const activeIdx = SECTION_ORDER.indexOf(activeSection);
    if (sectionIdx < activeIdx) return "summary";
    return "hidden";
  }

  const channelLabel: Record<Channel, string> = {
    sms: "SMS",
    email: t("flows.channel.email", "Email"),
    html_email: t("flows.channel.htmlEmail", "HTML Email"),
  };

  const handleSend = async () => {
    if (!hospitalId) return;
    setSending(true);
    try {
      const flowRes = await apiRequest("POST", `/api/business/${hospitalId}/flows`, {
        name,
        segmentFilters: filters,
        channel,
        promoCodeId,
        messageContent,
        messageSubject,
      });
      const flow = await flowRes.json();

      await apiRequest("POST", `/api/business/${hospitalId}/flows/${flow.id}/send`);

      toast({
        title: t("flows.toast.sent", "Campaign sent"),
        description: t("flows.toast.sentDescription", "{{name}} was sent successfully.", { name }),
      });
      navigate("/business/flows");
    } catch {
      toast({
        title: t("common.error", "Error"),
        description: t("flows.toast.sendError", "The campaign could not be sent."),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const isReady = filters.length > 0 && channel !== null && !!messageContent;

  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{t("flows.newCampaign", "New Campaign")}</h1>
          <p className="text-xs text-muted-foreground">{t("flows.create.subtitle", "Configure step by step")}</p>
        </div>
        {/* Campaign name inline */}
        <div className="flex items-center gap-2">
          <Label htmlFor="campaign-name" className="sr-only">{t("common.name", "Name")}</Label>
          <Input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("flows.create.namePlaceholder", "Campaign name")}
            className="h-8 text-sm w-52"
          />
        </div>
      </div>

      {/* 1 — Segment */}
      <BookingSection
        status={sectionStatus("segment")}
        isDark={true}
        summary={{
          icon: <Users className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.segment.title", "Target Audience"),
          value:
            filters.length > 0
              ? `${filters.length} ${t("flows.segment.filtersActive", "Filter(s) active")}${patientCount !== null ? ` · ${patientCount} ${t("flows.segment.patients", "Patients")}` : ""}`
              : t("flows.segment.allPatients", "All Patients"),
          onChange: () => goTo("segment"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.segment.select", "Select Target Audience")}</h3>
          <SegmentBuilder
            filters={filters}
            onChange={setFilters}
            patientCount={patientCount}
            onCountChange={setPatientCount}
          />
          <div className="flex justify-end">
            <Button onClick={() => completeAndGoTo("segment", "channel")}>
              {t("common.next", "Next")}
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* 2 — Channel */}
      <BookingSection
        status={sectionStatus("channel")}
        isDark={true}
        summary={{
          icon: <Radio className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.channel.label", "Channel"),
          value: channel ? channelLabel[channel] : t("flows.channel.none", "No channel selected"),
          onChange: () => goTo("channel"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.channel.title", "Select Channel")}</h3>
          <ChannelPicker value={channel} onChange={setChannel} />
          <div className="flex justify-end">
            <Button
              onClick={() => completeAndGoTo("channel", "compose")}
              disabled={!channel}
            >
              {t("common.next", "Next")}
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* 3 — Compose */}
      <BookingSection
        status={sectionStatus("compose")}
        isDark={true}
        summary={{
          icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.compose.label", "Message"),
          value: messageContent
            ? messageContent.replace(/<[^>]*>/g, "").slice(0, 60) +
              (messageContent.replace(/<[^>]*>/g, "").length > 60 ? "…" : "")
            : t("flows.compose.notYetWritten", "Not yet written"),
          onChange: () => goTo("compose"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.compose.title", "Compose Message")}</h3>
          {channel && (
            <MessageComposer
              channel={channel}
              messageContent={messageContent}
              messageSubject={messageSubject}
              onContentChange={setMessageContent}
              onSubjectChange={setMessageSubject}
              segmentFilters={filters}
              promoCode={promoCode}
            />
          )}
          <div className="flex justify-end">
            <Button
              onClick={() => completeAndGoTo("compose", "offer")}
              disabled={!messageContent}
            >
              {t("common.next", "Next")}
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* 4 — Offer */}
      <BookingSection
        status={sectionStatus("offer")}
        isDark={true}
        summary={{
          icon: <Tag className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.offer.label", "Offer"),
          value: promoCode ? `${t("flows.offer.code", "Code")}: ${promoCode}` : t("flows.offer.none", "No promo code"),
          onChange: () => goTo("offer"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.offer.title", "Offer / Promo Code")} ({t("common.optional", "optional")})</h3>
          <OfferSection
            promoCodeId={promoCodeId}
            onChange={(id, code) => {
              setPromoCodeId(id);
              setPromoCode(code);
            }}
          />
          <div className="flex justify-end">
            <Button onClick={() => completeAndGoTo("offer", "review")}>
              {t("common.next", "Next")}
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* 5 — Review + Send */}
      <BookingSection
        status={sectionStatus("review")}
        isDark={true}
        summary={{
          icon: <Send className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.review.label", "Send"),
          value: t("flows.status.sent", "Sent"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.review.title", "Review & Send")}</h3>
          <ReviewSend
            patientCount={patientCount}
            channel={channel}
            promoCode={promoCode}
            campaignName={name}
            onSend={handleSend}
            sending={sending}
            disabled={!isReady}
          />
        </div>
      </BookingSection>
    </div>
  );
}
