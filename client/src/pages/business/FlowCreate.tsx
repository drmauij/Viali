import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Radio, MessageSquare, Tag, Send, Maximize2, Minimize2, Sparkles, FileText, Columns2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import SegmentBuilder, { type SegmentFilter } from "@/components/flows/SegmentBuilder";
import ChannelPicker, { type Channel } from "@/components/flows/ChannelPicker";
import OfferSection from "@/components/flows/OfferSection";
import ReviewSend from "@/components/flows/ReviewSend";
import MessageComposer from "@/components/flows/MessageComposer";
import VariantTabs, { type Variant } from "@/components/flows/VariantTabs";
import AbConfigSection from "@/components/flows/AbConfigSection";
import { BookingSection, type SectionStatus } from "@/components/booking/BookingSection";

type Section = "segment" | "channel" | "compose" | "offer" | "review";

const SECTION_ORDER: Section[] = ["segment", "channel", "compose", "offer", "review"];

export default function FlowCreate({ editId }: { editId?: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const { toast } = useToast();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [name, setName] = useState(t("flows.newCampaign", "New Campaign"));
  const [activeSection, setActiveSection] = useState<Section>("segment");
  const [completedSections, setCompletedSections] = useState<Set<Section>>(new Set());

  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [variants, setVariants] = useState<Variant[]>([
    { label: "A", messageSubject: "", messageTemplate: "" },
  ]);
  const [abHoldoutPctPerArm, setAbHoldoutPctPerArm] = useState<number>(10);
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [loaded, setLoaded] = useState(!editId);

  // Load existing draft if editing
  const { data: existingFlow } = useQuery({
    queryKey: ["flow", hospitalId, editId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows/${editId}`).then(r => r.json()),
    enabled: !!editId && !!hospitalId,
  });

  // Load promo codes to resolve promoCodeId → code string
  const { data: promoCodes = [] } = useQuery({
    queryKey: ["promo-codes", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/promo-codes`).then(r => r.json()),
    enabled: !!hospitalId && !!editId,
  });

  useEffect(() => {
    if (existingFlow && !loaded) {
      setName(existingFlow.name || "");
      setFilters(existingFlow.segmentFilters || []);
      setChannel(existingFlow.channel || null);

      // Initialize variants — prefer saved variants array; fall back to single
      // message fields for flows saved before A/B was introduced.
      if (Array.isArray(existingFlow.variants) && existingFlow.variants.length > 0) {
        setVariants(existingFlow.variants);
        if (existingFlow.abHoldoutPctPerArm) {
          setAbHoldoutPctPerArm(existingFlow.abHoldoutPctPerArm);
        }
      } else {
        setVariants([
          {
            label: "A",
            messageSubject: existingFlow.messageSubject || "",
            messageTemplate: existingFlow.messageTemplate || "",
          },
        ]);
      }

      setPromoCodeId(existingFlow.promoCodeId || null);
      if (existingFlow.promoCodeId && (promoCodes as any[]).length > 0) {
        const pc = (promoCodes as any[]).find((p: any) => p.id === existingFlow.promoCodeId);
        if (pc) setPromoCode(pc.code);
      }

      // Mark sections as completed based on what data exists, and jump to the right step.
      // Segment is always considered complete on resume — an empty filters array is a
      // valid "all patients" selection, not an incomplete step.
      const done = new Set<Section>();
      let nextStep: Section = "channel";
      done.add("segment");
      if (existingFlow.channel) {
        done.add("channel");
        nextStep = "compose";
      }
      if (existingFlow.messageTemplate || (Array.isArray(existingFlow.variants) && existingFlow.variants.length > 0 && existingFlow.variants[0]?.messageTemplate)) {
        done.add("compose");
        nextStep = "offer";
      }
      if (existingFlow.promoCodeId) {
        done.add("offer");
        nextStep = "review";
      }

      setCompletedSections(done);
      setActiveSection(nextStep);
      setLoaded(true);
    }
  }, [existingFlow, loaded]);

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
        messageTemplate: variants[0]?.messageTemplate ?? "",
        messageSubject: variants[0]?.messageSubject ?? "",
        abTestEnabled: variants.length >= 2,
        abHoldoutPctPerArm,
        variants: variants.map((v) => ({
          label: v.label,
          messageSubject: v.messageSubject,
          messageTemplate: v.messageTemplate,
        })),
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

  const handleSaveDraft = async () => {
    if (!hospitalId) return;
    setSavingDraft(true);
    try {
      const payload = {
        name,
        segmentFilters: filters,
        channel,
        promoCodeId,
        messageTemplate: variants[0]?.messageTemplate ?? "",
        messageSubject: variants[0]?.messageSubject ?? "",
        abTestEnabled: variants.length >= 2,
        abHoldoutPctPerArm,
        variants: variants.map((v) => ({
          label: v.label,
          messageSubject: v.messageSubject,
          messageTemplate: v.messageTemplate,
        })),
      };
      if (editId) {
        await apiRequest("PATCH", `/api/business/${hospitalId}/flows/${editId}`, payload);
      } else {
        await apiRequest("POST", `/api/business/${hospitalId}/flows`, payload);
      }
      queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] });
      toast({
        title: t("flows.toast.draftSaved", "Draft saved"),
        description: t("flows.toast.draftSavedDesc", "You can continue editing later."),
      });
      navigate("/business/flows");
    } catch {
      toast({ title: t("common.error", "Error"), description: t("flows.toast.draftError", "Could not save draft."), variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendTest = async (recipient: string, testVars: { vorname: string; nachname: string; behandlung: string }) => {
    const messageContent = variants[0]?.messageTemplate ?? "";
    const messageSubject = variants[0]?.messageSubject ?? "";
    if (!hospitalId || !channel || !messageContent) return;
    setSendingTest(true);
    try {
      await apiRequest("POST", `/api/business/${hospitalId}/flows/test-send`, {
        channel,
        recipient,
        messageTemplate: messageContent,
        messageSubject,
        promoCode,
        testVars,
      });
      toast({
        title: t("flows.toast.testSent", "Test sent"),
        description: t("flows.toast.testSentDesc", "Test message sent to {{recipient}}.", { recipient }),
      });
    } catch {
      toast({ title: t("common.error", "Error"), description: t("flows.toast.testError", "Could not send test."), variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  };

  // Active variant drives the MessageComposer (chat + preview) — user can
  // switch between Variant A / B / C and chat-refine each independently.
  const [activeVariantLabel, setActiveVariantLabel] = useState("A");
  const [isComposeFullscreen, setIsComposeFullscreen] = useState(false);
  const [composeView, setComposeView] = useState<"ai" | "editor">("ai");
  const [isSplitView, setIsSplitView] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState<Set<string>>(() => new Set());
  // Side-by-side view only makes sense in fullscreen AND with 2+ variants
  const splitViewActive = isSplitView && isComposeFullscreen && variants.length >= 2;

  /** Generate a new variant from Variant A's content via the /compose endpoint.
   *  Returns the generated {subject, body} so callers can decide what to do
   *  with it (append, replace, etc.). Tracks loading state per label. */
  const generateVariantFromBase = async (
    baseVariant: Variant,
    targetLabel: string,
  ): Promise<{ subject?: string; body: string } | null> => {
    if (!hospitalId) return null;
    setGeneratingLabels((prev) => new Set(prev).add(targetLabel));
    try {
      const res = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/compose`,
        {
          channel,
          prompt: "Generate an alternative variant for A/B test",
          abVariantOf: baseVariant.messageTemplate,
        },
      );
      const data = await res.json();
      return {
        subject: data.subject,
        body: data.body ?? data.message ?? data.content ?? "",
      };
    } catch {
      return null;
    } finally {
      setGeneratingLabels((prev) => {
        const next = new Set(prev);
        next.delete(targetLabel);
        return next;
      });
    }
  };

  /** Generate all remaining variant slots (up to 3 total) in parallel from
   *  Variant A's content. Called from the toolbar's "Generate all" button. */
  const generateAllVariants = async () => {
    const labels = ["A", "B", "C"];
    const base = variants[0];
    if (!base?.messageTemplate) return;
    const existingLabels = new Set(variants.map((v) => v.label));
    const toGenerate = labels.filter((l) => !existingLabels.has(l));
    if (toGenerate.length === 0) return;
    // Mark all as generating up front so the split-view spinners show
    // immediately even before the fetch promises settle.
    setGeneratingLabels((prev) => {
      const next = new Set(prev);
      toGenerate.forEach((l) => next.add(l));
      return next;
    });
    // Switch to split view right away so the user can watch them fill in
    setIsSplitView(true);
    // Preload empty slots so the grid shows the right number of tiles
    setVariants((prev) => [
      ...prev,
      ...toGenerate.map((label) => ({ label, messageTemplate: "", messageSubject: base.messageSubject })),
    ]);
    const results = await Promise.all(
      toGenerate.map((label) => generateVariantFromBase(base, label)),
    );
    setVariants((prev) => {
      const updated = [...prev];
      results.forEach((r, i) => {
        if (!r) return;
        const targetLabel = toGenerate[i];
        const idx = updated.findIndex((v) => v.label === targetLabel);
        if (idx >= 0) {
          updated[idx] = {
            ...updated[idx],
            messageTemplate: r.body,
            messageSubject: r.subject ?? updated[idx].messageSubject,
          };
        }
      });
      return updated;
    });
  };
  const activeVariantIndex = Math.max(
    0,
    variants.findIndex((v) => v.label === activeVariantLabel),
  );
  const messageContent = variants[activeVariantIndex]?.messageTemplate ?? "";
  const messageSubject = variants[activeVariantIndex]?.messageSubject ?? "";

  // Variant A always drives the "ready to send" guards — the send loop picks
  // A/B/C per-patient at send time, but A must exist for anything to go out.
  const primaryMessageContent = variants[0]?.messageTemplate ?? "";

  // Empty filters = "all patients" is valid; require only a channel + message.
  const isReady = channel !== null && !!primaryMessageContent;

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
        isDark={isDark}
        summary={{
          icon: <Users className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.segment.title", "Target Audience"),
          value:
            filters.length > 0
              ? `${filters.length} ${t("flows.segment.filtersActive", "Filter(s) active")}${patientCount !== null ? ` · ${patientCount} ${t("flows.segment.patients", "Patients")}` : ""}`
              : `${t("flows.segment.allPatients", "All Patients")}${patientCount !== null ? ` · ${patientCount} ${t("flows.segment.patients", "Patients")}` : ""}`,
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
            channel={channel ?? undefined}
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
        isDark={isDark}
        summary={{
          icon: <Radio className="h-4 w-4 text-muted-foreground" />,
          label: t("flows.channel.label", "Channel"),
          value: channel ? channelLabel[channel] : t("flows.channel.none", "No channel selected"),
          onChange: () => goTo("channel"),
        }}
      >
        <div className="space-y-4">
          <h3 className="font-semibold">{t("flows.channel.title", "Select Channel")}</h3>
          <ChannelPicker value={channel} onChange={(ch) => { setChannel(ch); completeAndGoTo("channel", "compose"); }} />
        </div>
      </BookingSection>

      {/* 3 — Compose */}
      <BookingSection
        status={sectionStatus("compose")}
        isDark={isDark}
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
              key={activeVariantLabel}
              channel={channel}
              messageContent={messageContent}
              messageSubject={messageSubject}
              isFullscreen={isComposeFullscreen}
              onFullscreenToggle={() => setIsComposeFullscreen((v) => !v)}
              activeView={channel === "html_email" ? "ai" : composeView}
              splitPreviews={splitViewActive ? variants : undefined}
              activeVariantLabel={activeVariantLabel}
              onActivateVariant={setActiveVariantLabel}
              generatingLabels={generatingLabels}
              onChatLoadingChange={(loading) => {
                // When the chat pane is actively refining the current variant,
                // mark its label in generatingLabels so split-view spins it.
                setGeneratingLabels((prev) => {
                  const next = new Set(prev);
                  if (loading) next.add(activeVariantLabel);
                  else next.delete(activeVariantLabel);
                  return next;
                });
              }}
              toolbar={
                /* Always render the toolbar so the fullscreen exit button
                   stays reachable even when the current variant is empty. */
                (
                  <VariantTabs
                    variants={variants}
                    onChange={setVariants}
                    activeLabel={activeVariantLabel}
                    onActiveLabelChange={setActiveVariantLabel}
                    onGenerateAi={
                      hospitalId
                        ? async (base) => {
                            // Predict the label VariantTabs will assign and
                            // mark it "generating" so the tile shows a spinner.
                            const nextLabel = ["A", "B", "C"][variants.length] ?? "?";
                            const result = await generateVariantFromBase(base, nextLabel);
                            return (
                              result ?? { body: base.messageTemplate, subject: base.messageSubject }
                            );
                          }
                        : undefined
                    }
                    extraActions={
                      <>
                        {/* "Generate all" — fills remaining variant slots from
                            Variant A's content in parallel. Only shown when
                            Variant A has content AND not all slots are filled. */}
                        {primaryMessageContent && variants.length < 3 && hospitalId && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-8"
                            onClick={generateAllVariants}
                            disabled={generatingLabels.size > 0}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {generatingLabels.size > 0
                              ? t("flows.ab.generatingAll", "Generating...")
                              : t("flows.ab.generateAll", "Generate A/B/C")}
                          </Button>
                        )}
                        {channel !== "html_email" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              setComposeView((v) => (v === "ai" ? "editor" : "ai"))
                            }
                            aria-label={
                              composeView === "ai"
                                ? t("flows.compose.tabEditor", "Editor")
                                : t("flows.compose.tabAi", "AI Chat")
                            }
                            title={
                              composeView === "ai"
                                ? t("flows.compose.tabEditor", "Editor")
                                : t("flows.compose.tabAi", "AI Chat")
                            }
                          >
                            {composeView === "ai" ? (
                              <FileText className="h-4 w-4" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        {isComposeFullscreen && variants.length >= 2 && (
                          <Button
                            type="button"
                            variant={isSplitView ? "default" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setIsSplitView((v) => !v)}
                            aria-label={t("flows.ab.splitView", "Compare variants side by side")}
                            title={t("flows.ab.splitView", "Compare variants side by side")}
                          >
                            <Columns2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setIsComposeFullscreen((v) => !v)}
                          aria-label={
                            isComposeFullscreen
                              ? t("flows.compose.exitFullscreen", "Exit fullscreen")
                              : t("flows.compose.enterFullscreen", "Expand to fullscreen")
                          }
                          title={
                            isComposeFullscreen
                              ? t("flows.compose.exitFullscreen", "Exit fullscreen")
                              : t("flows.compose.enterFullscreen", "Expand to fullscreen")
                          }
                        >
                          {isComposeFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                      </>
                    }
                  />
                )
              }
              onContentChange={(content) =>
                setVariants((prev) =>
                  prev.map((v, i) =>
                    i === activeVariantIndex ? { ...v, messageTemplate: content } : v,
                  ),
                )
              }
              onSubjectChange={(subject) =>
                setVariants((prev) =>
                  prev.map((v, i) =>
                    i === activeVariantIndex ? { ...v, messageSubject: subject } : v,
                  ),
                )
              }
              segmentFilters={filters}
              promoCode={promoCode}
            />
          )}

          {variants.length >= 2 && (
            <AbConfigSection
              holdoutPctPerArm={abHoldoutPctPerArm}
              onChange={setAbHoldoutPctPerArm}
              segmentSize={patientCount}
              variantCount={variants.length}
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
        isDark={isDark}
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
        isDark={isDark}
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
            onSaveDraft={handleSaveDraft}
            onSendTest={handleSendTest}
            sending={sending}
            savingDraft={savingDraft}
            sendingTest={sendingTest}
            disabled={!isReady}
          />
        </div>
      </BookingSection>
    </div>
  );
}
