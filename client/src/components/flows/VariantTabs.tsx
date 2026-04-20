import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Sparkles } from "lucide-react";

export interface Variant {
  label: string; // "A", "B", "C"
  messageSubject?: string;
  messageTemplate: string;
}

interface Props {
  variants: Variant[];
  /** Accepts either a fresh array OR a functional updater. Updater form is
   *  required for safe rollbacks: the closure-captured `variants` array can
   *  be stale if other code (e.g. streaming chat) updated state mid-flight. */
  onChange: (variants: Variant[] | ((prev: Variant[]) => Variant[])) => void;
  activeLabel?: string; // controlled active tab (falls back to internal state when omitted)
  onActiveLabelChange?: (label: string) => void;
  onGenerateAi?: (baseVariant: Variant) => Promise<{ subject?: string; body: string }>;
  /** Rendered in the toolbar row to the right of the "Add variant" button. */
  extraActions?: React.ReactNode;
  /** When true, hide the "Add variant" button entirely (e.g. while Variant A
   *  is still being generated — there's nothing complete to fork from yet). */
  hideAddButton?: boolean;
  /** Eager generating-state notification. Fires SYNCHRONOUSLY before/after the
   *  AI request so the parent can mark the label as generating in the same
   *  React batch as the placeholder addition — guarantees the spinner state
   *  is on screen even if the AI call resolves/fails very fast. */
  onGeneratingChange?: (label: string, generating: boolean) => void;
}

const MAX_VARIANTS = 3;
const LABELS = ["A", "B", "C"];

export default function VariantTabs({
  variants,
  onChange,
  activeLabel: controlledActiveLabel,
  onActiveLabelChange,
  onGenerateAi,
  extraActions,
  hideAddButton,
  onGeneratingChange,
}: Props) {
  const { t } = useTranslation();
  const [internalActiveLabel, setInternalActiveLabel] = useState(variants[0]?.label ?? "A");
  const activeLabel = controlledActiveLabel ?? internalActiveLabel;
  const [generatingAi, setGeneratingAi] = useState(false);

  const setActiveLabel = (label: string) => {
    if (onActiveLabelChange) onActiveLabelChange(label);
    else setInternalActiveLabel(label);
  };

  const addVariant = async () => {
    if (variants.length >= MAX_VARIANTS) return;
    const label = LABELS[variants.length];
    // Append an EMPTY placeholder + activate it BEFORE awaiting the AI call.
    // The parent (FlowCreate) marks this label as "generating" via
    // onGenerateAi → generateVariantFromBase, so the new tab + tile show
    // a spinner immediately instead of staying invisible until the model
    // finishes (~30-60s for html_email).
    const placeholder: Variant = {
      label,
      messageSubject: variants[0]?.messageSubject,
      messageTemplate: "",
    };
    onChange((prev) => [...prev, placeholder]);
    setActiveLabel(label);

    if (onGenerateAi && variants.length > 0 && variants[0]?.messageTemplate) {
      setGeneratingAi(true);
      // Fire EAGERLY so the parent flips its generatingLabels state in the
      // same synchronous batch as the placeholder add. Otherwise a fast 500
      // can race and net out the add+remove inside generateVariantFromBase
      // before React ever paints the spinner.
      onGeneratingChange?.(label, true);
      let succeeded = false;
      let resultBody = "";
      let resultSubject: string | undefined;
      try {
        const gen = await onGenerateAi(variants[0]);
        // Treat empty body OR body identical to Variant A as a failure —
        // both indicate the AI didn't actually produce a divergent variant.
        if (gen.body && gen.body.trim() && gen.body !== variants[0]?.messageTemplate) {
          resultBody = gen.body;
          resultSubject = gen.subject;
          succeeded = true;
        }
      } catch {
        // handled by !succeeded branch below
      } finally {
        setGeneratingAi(false);
        onGeneratingChange?.(label, false);
      }
      if (!succeeded) {
        // Roll back ONLY the placeholder we added. Functional update so we
        // don't accidentally clobber other updates (e.g. chat-stream that
        // populated Variant A's body in parallel).
        onChange((prev) => prev.filter((v) => v.label !== label));
        if (variants[0]) setActiveLabel(variants[0].label);
        // eslint-disable-next-line no-alert
        alert(
          "AI variant generation failed (no result, or result was identical to Variant A). Try again or refine Variant A first.",
        );
        return;
      }
      // Replace the placeholder with the generated content (functional update
      // so concurrent edits to other variants survive).
      onChange((prev) =>
        prev.map((v) =>
          v.label === label
            ? { ...v, messageTemplate: resultBody, messageSubject: resultSubject ?? v.messageSubject }
            : v,
        ),
      );
    } else {
      // No AI path — copy Variant A's text into the new placeholder.
      const baseTemplate = variants[0]?.messageTemplate ?? "";
      onChange((prev) =>
        prev.map((v) =>
          v.label === label ? { ...v, messageTemplate: baseTemplate } : v,
        ),
      );
    }
  };

  const removeVariant = (idx: number) => {
    const newVariants = variants.filter((_, i) => i !== idx);
    // Re-label remaining variants A, B, C...
    const relabeled = newVariants.map((v, i) => ({ ...v, label: LABELS[i] }));
    onChange(relabeled);
    if (relabeled.length > 0 && !relabeled.find((v) => v.label === activeLabel)) {
      setActiveLabel(relabeled[0].label);
    }
  };

  if (variants.length === 0) return null;

  return (
    <Tabs value={activeLabel} onValueChange={setActiveLabel}>
      <div className="flex items-center justify-between">
        <TabsList>
          {variants.map((v, i) => (
            <TabsTrigger key={v.label} value={v.label} className="gap-2">
              {t("flows.ab.variant", "Variant")} {v.label}
              {variants.length > 1 && (
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeVariant(i);
                  }}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                  title={t("flows.ab.removeVariant", "Remove variant")}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex items-center gap-2">
          {/* Only offer "Add variant" once Variant A has actual content —
              otherwise there's nothing for the AI to base a variant on. */}
          {variants.length < MAX_VARIANTS && variants[0]?.messageTemplate && !hideAddButton && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={addVariant}
              disabled={generatingAi}
            >
              {onGenerateAi ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {generatingAi
                    ? t("flows.ab.generating", "Generating...")
                    : t("flows.ab.addWithAi", "Add variant + AI")}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {t("flows.ab.add", "Add variant")}
                </>
              )}
            </Button>
          )}
          {extraActions}
        </div>
      </div>
    </Tabs>
  );
}
