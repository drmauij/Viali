import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Sparkles } from "lucide-react";

export interface Variant {
  label: string; // "A", "B", "C"
  messageSubject?: string;
  messageTemplate: string;
}

interface Props {
  variants: Variant[];
  onChange: (variants: Variant[]) => void;
  showSubject: boolean;
  onGenerateAi?: (baseVariant: Variant) => Promise<{ subject?: string; body: string }>;
}

const MAX_VARIANTS = 3;
const LABELS = ["A", "B", "C"];

export default function VariantTabs({
  variants,
  onChange,
  showSubject,
  onGenerateAi,
}: Props) {
  const { t } = useTranslation();
  const [activeLabel, setActiveLabel] = useState(variants[0]?.label ?? "A");
  const [generatingAi, setGeneratingAi] = useState(false);

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
      try {
        const gen = await onGenerateAi(variants[0]);
        fresh.messageTemplate = gen.body;
        if (gen.subject) fresh.messageSubject = gen.subject;
      } catch {
        // If AI generation fails, keep the seeded copy of variant A
      } finally {
        setGeneratingAi(false);
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

  const updateVariant = (idx: number, patch: Partial<Variant>) => {
    onChange(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  if (variants.length === 0) return null;

  return (
    <div className="space-y-4">
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
        </div>

        {variants.map((v, i) => (
          <TabsContent key={v.label} value={v.label} className="space-y-3 pt-4">
            {showSubject && (
              <div>
                <label className="text-sm font-medium">
                  {t("flows.ab.subject", "Subject")}
                </label>
                <Input
                  value={v.messageSubject ?? ""}
                  onChange={(e) => updateVariant(i, { messageSubject: e.target.value })}
                  placeholder={t("flows.ab.subjectPlaceholder", "Email subject line")}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">
                {t("flows.ab.body", "Message body")}
              </label>
              <Textarea
                value={v.messageTemplate}
                onChange={(e) => updateVariant(i, { messageTemplate: e.target.value })}
                rows={10}
                placeholder={t("flows.ab.bodyPlaceholder", "Message body...")}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
