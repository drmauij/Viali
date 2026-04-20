import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Radio, MessageSquare, Tag, Send, Maximize2, Minimize2, Sparkles, FileText, Columns2, Loader2 } from "lucide-react";
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

  // Refs per section so we can smoothly scroll the newly-activated card into
  // view (e.g. picking a channel reveals the Compose card below — without
  // scrolling, the user has to hunt for it on small screens).
  const sectionRefs = useRef<Record<Section, HTMLDivElement | null>>({
    segment: null,
    channel: null,
    compose: null,
    offer: null,
    review: null,
  });
  useEffect(() => {
    const el = sectionRefs.current[activeSection];
    if (!el) return;
    // Defer one frame so the section's mount/expand animation lands first.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeSection]);

  const [filters, setFilters] = useState<SegmentFilter[]>([]);
  const [patientCount, setPatientCount] = useState<number | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [variants, setVariants] = useState<Variant[]>([
    { label: "A", messageSubject: "", messageTemplate: "" },
  ]);
  const [abHoldoutPctPerArm, setAbHoldoutPctPerArm] = useState<number>(10);
  const [promoCodeId, setPromoCodeId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  // Optional treatment attached to the campaign — used to preselect the
  // service in the booking link when the segment isn't filtered by treatment.
  const [campaignTreatmentId, setCampaignTreatmentId] = useState<string | null>(null);
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

  // Treatments → campaign-treatment dropdown. Used to preselect "?service="
  // in the booking link when the segment isn't filtered by treatment.
  const { data: clinicServicesList = [] } = useQuery<Array<{ id: string; name: string; code: string | null }>>({
    queryKey: ["clinic-services", hospitalId],
    queryFn: () => apiRequest("GET", `/api/clinic/${hospitalId}/services`).then((r) => r.json()),
    enabled: !!hospitalId,
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
      setCampaignTreatmentId(existingFlow.campaignTreatmentId || null);
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
        campaignTreatmentId,
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
        campaignTreatmentId,
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
        campaignTreatmentId,
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
  // Auto-enable split view whenever the user enters fullscreen with 2+ variants —
  // that's almost always what you want. The toolbar button still lets you toggle
  // back to single-variant view if you'd rather focus on one at a time.
  useEffect(() => {
    if (isComposeFullscreen && variants.length >= 2) {
      setIsSplitView(true);
    }
  }, [isComposeFullscreen, variants.length]);
  // Side-by-side view only makes sense in fullscreen AND with 2+ variants
  const splitViewActive = isSplitView && isComposeFullscreen && variants.length >= 2;

  /** Per-label style hints to force the AI to take genuinely different angles.
   *  Without these, parallel calls with the same `abVariantOf` produce nearly
   *  identical variants because Claude defaults to conservative rewrites.
   *  Hints are CONCRETE so Claude can't soft-interpret them. */
  const VARIANT_STYLE_HINTS: Record<string, string> = {
    A: "", // base variant — no hint
    B: 'Subject line MUST be phrased as a QUESTION (ending in "?"). Body MUST open with a scarcity/urgency hook (e.g. "Nur noch wenige Plätze", "Diese Woche endet das Angebot", a specific deadline). Hero section copy MUST mention either limited spots OR a specific date deadline.',
    C: 'Subject line MUST start with a NUMBER or quoted testimonial (e.g. "500+ zufriedene Patientinnen…", "Unsere meistgebuchte Behandlung"). Body MUST lead with social proof — patient count, satisfaction rate, or a brief testimonial. Hero section MUST feature the social-proof number prominently.',
  };

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
      const styleHint = VARIANT_STYLE_HINTS[targetLabel] || "";
      const res = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/compose`,
        {
          channel,
          prompt: `Generate variant ${targetLabel} for an A/B test.`,
          abVariantOf: baseVariant.messageTemplate,
          // Style hint is sent as a SEPARATE field so the server's abVariantOf
          // prompt builder can append it as a hard constraint — embedding it in
          // `prompt` would get discarded since the server overwrites prompt
          // when abVariantOf is set.
          abStyleHint: styleHint || undefined,
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

  /** Rewrite each variant in place to weave in the current promo code,
   *  preserving copy/design. Used by the "Mention code in message" prompt
   *  that appears after the user picks an offer. */
  const [insertingPromoCode, setInsertingPromoCode] = useState(false);
  const insertPromoCodeIntoVariants = async () => {
    if (!hospitalId || !channel || !promoCode || variants.length === 0) return;
    setInsertingPromoCode(true);
    // Mark every populated variant as generating so each tile shows a spinner.
    setGeneratingLabels((prev) => {
      const next = new Set(prev);
      variants.forEach((v) => v.messageTemplate && next.add(v.label));
      return next;
    });
    try {
      const results = await Promise.all(
        variants.map(async (v) => {
          if (!v.messageTemplate) return null;
          try {
            const res = await apiRequest(
              "POST",
              `/api/business/${hospitalId}/flows/compose`,
              {
                channel,
                prompt: `Insert promo code into existing message.`,
                abVariantOf: v.messageTemplate,
                preserveCopy: true,
                promoCode,
              },
            );
            const data = await res.json();
            return {
              label: v.label,
              body: data.body ?? data.message ?? data.content ?? "",
              subject: data.subject as string | undefined,
            };
          } catch {
            return null;
          }
        }),
      );
      setVariants((prev) =>
        prev.map((v) => {
          const r = results.find((x) => x && x.label === v.label);
          if (!r || !r.body) return v;
          return {
            ...v,
            messageTemplate: r.body,
            messageSubject: r.subject ?? v.messageSubject,
          };
        }),
      );
    } finally {
      setGeneratingLabels(new Set());
      setInsertingPromoCode(false);
    }
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
        ref={(el) => { sectionRefs.current.segment = el; }}
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
        ref={(el) => { sectionRefs.current.channel = el; }}
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
          <ChannelPicker
            value={channel}
            onChange={(ch) => {
              // If the user changes the channel after composing, reset
              // the message state — an HTML email body makes no sense as
              // an SMS body and vice-versa. Keeps segment + promo intact.
              if (channel && ch !== channel) {
                setVariants([
                  { label: "A", messageSubject: "", messageTemplate: "" },
                ]);
                setActiveVariantLabel("A");
                setComposeView("ai");
                setIsSplitView(false);
                setGeneratingLabels(new Set());
              }
              setChannel(ch);
              completeAndGoTo("channel", "compose");
            }}
          />
        </div>
      </BookingSection>

      {/* 3 — Compose */}
      <BookingSection
        ref={(el) => { sectionRefs.current.compose = el; }}
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
          {/* Optional: attach a treatment to the campaign so the booking link
              preselects it (?service=). If a treatment filter is already set
              in the segment, that wins; this is for "All patients, but the
              campaign is about Botox" cases. */}
          {clinicServicesList.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("flows.compose.treatmentLabel", "Campaign treatment")}:
              </span>
              <select
                value={campaignTreatmentId ?? ""}
                onChange={(e) => setCampaignTreatmentId(e.target.value || null)}
                className="bg-background border rounded h-8 px-2 text-sm"
                data-testid="select-campaign-treatment"
              >
                <option value="">
                  {t("flows.compose.noTreatment", "None — patient picks at booking")}
                </option>
                {clinicServicesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                    hideAddButton={generatingLabels.size > 0}
                    onGeneratingChange={(label, generating) => {
                      setGeneratingLabels((prev) => {
                        const next = new Set(prev);
                        if (generating) next.add(label);
                        else next.delete(label);
                        return next;
                      });
                    }}
                    extraActions={
                      <>
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
        ref={(el) => { sectionRefs.current.offer = el; }}
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
          {/* Once the user picks a code, offer to weave it into the message
              copy. The code is ALWAYS attached to the booking link as a URL
              param at send time — this just makes it visible in the body too,
              for cases where the user wants visual emphasis. */}
          {(() => {
            if (!promoCode) return null;
            const codeLower = promoCode.toLowerCase();
            const variantsWithCopy = variants.filter((v) => v.messageTemplate);
            if (variantsWithCopy.length === 0) return null;
            const allMention = variantsWithCopy.every((v) =>
              v.messageTemplate.toLowerCase().includes(codeLower),
            );
            if (allMention) return null;
            return (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex items-start gap-3">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">
                    {t("flows.offer.mentionCodeTitle", "Mention this code in the message?")}
                  </div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {t(
                      "flows.offer.mentionCodeBody",
                      "The code is automatically added to the booking link, but you can also have it shown in the message body for visual emphasis.",
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={insertPromoCodeIntoVariants}
                  disabled={insertingPromoCode}
                  className="gap-1.5 flex-shrink-0"
                >
                  {insertingPromoCode ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("flows.offer.insertingCode", "Inserting...")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      {t("flows.offer.insertCode", "Insert code")}
                    </>
                  )}
                </Button>
              </div>
            );
          })()}
          <div className="flex justify-end">
            <Button onClick={() => completeAndGoTo("offer", "review")}>
              {t("common.next", "Next")}
            </Button>
          </div>
        </div>
      </BookingSection>

      {/* 5 — Review + Send */}
      <BookingSection
        ref={(el) => { sectionRefs.current.review = el; }}
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
