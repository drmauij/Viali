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
  onChange: (variants: Variant[]) => void;
  activeLabel?: string; // controlled active tab (falls back to internal state when omitted)
  onActiveLabelChange?: (label: string) => void;
  onGenerateAi?: (baseVariant: Variant) => Promise<{ subject?: string; body: string }>;
  /** Rendered in the toolbar row to the right of the "Add variant" button. */
  extraActions?: React.ReactNode;
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
    const fresh: Variant = {
      label,
      messageSubject: variants[0]?.messageSubject,
      messageTemplate: variants[0]?.messageTemplate ?? "",
    };
    if (onGenerateAi && variants.length > 0 && variants[0]?.messageTemplate) {
      setGeneratingAi(true);
      let succeeded = false;
      try {
        const gen = await onGenerateAi(variants[0]);
        // Treat empty body OR body identical to Variant A as a failure —
        // both indicate the AI didn't actually produce a divergent variant.
        // Surface the failure instead of silently appending an A-clone.
        if (gen.body && gen.body.trim() && gen.body !== variants[0]?.messageTemplate) {
          fresh.messageTemplate = gen.body;
          if (gen.subject) fresh.messageSubject = gen.subject;
          succeeded = true;
        }
      } catch {
        // ignore — handled by !succeeded branch below
      } finally {
        setGeneratingAi(false);
      }
      if (!succeeded) {
        // Don't add the variant on AI failure — better to bail than to
        // silently produce a duplicate of Variant A.
        // eslint-disable-next-line no-alert
        alert(
          "AI variant generation failed (no result, or result was identical to Variant A). Try again or refine Variant A first.",
        );
        return;
      }
    }
    onChange([...variants, fresh]);
    setActiveLabel(label);
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
          {variants.length < MAX_VARIANTS && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={addVariant}
              disabled={generatingAi}
            >
              {onGenerateAi && variants.length >= 1 && variants[0]?.messageTemplate ? (
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
