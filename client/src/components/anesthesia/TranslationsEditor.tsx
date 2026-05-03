import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { SUPPORTED_QUESTIONNAIRE_LANGS, type Lang, type LangMap, type OverrideMap, type TranslatableField } from "@shared/i18n";
import type { IllnessListItem } from "@shared/schema";

const FIELD_LABELS: Record<TranslatableField, string> = {
  label: "Label",
  patientLabel: "Patient label",
  patientHelpText: "Patient help text",
};

export function TranslationsEditor({
  item,
  onChange,
}: {
  item: IllnessListItem;
  onChange: (next: IllnessListItem) => void;
}) {
  const sourceLang = (item.labelSourceLang || "de") as Lang;

  const updateField = (field: TranslatableField, lang: Lang, value: string) => {
    const tKey = `${field}Translations` as const;
    const oKey = `${field}Overrides` as const;
    const translations: LangMap = { ...((item as any)[tKey] || {}) };
    const overrides: OverrideMap = { ...((item as any)[oKey] || {}) };
    if (value.trim().length === 0) {
      delete translations[lang];
      delete overrides[lang];
    } else {
      translations[lang] = value;
      overrides[lang] = true;
    }
    onChange({ ...item, [tKey]: translations, [oKey]: overrides });
  };

  const resetToAi = (field: TranslatableField, lang: Lang) => {
    const tKey = `${field}Translations` as const;
    const oKey = `${field}Overrides` as const;
    const translations: LangMap = { ...((item as any)[tKey] || {}) };
    const overrides: OverrideMap = { ...((item as any)[oKey] || {}) };
    delete translations[lang];
    delete overrides[lang];
    onChange({ ...item, [tKey]: translations, [oKey]: overrides });
  };

  const fieldsPresent: { field: TranslatableField; label: string }[] = (
    ["label", "patientLabel", "patientHelpText"] as TranslatableField[]
  )
    .filter((field) => Boolean((item as any)[field]))
    .map((field) => ({ field, label: FIELD_LABELS[field] }));

  return (
    <div className="space-y-3 p-3 bg-muted/30 rounded">
      {fieldsPresent.map(({ field, label }) => {
        const translations = ((item as any)[`${field}Translations`] || {}) as LangMap;
        const overrides = ((item as any)[`${field}Overrides`] || {}) as OverrideMap;
        return (
          <div key={field}>
            <div className="text-xs font-medium mb-1">{label}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(SUPPORTED_QUESTIONNAIRE_LANGS as readonly Lang[]).map((lang) => {
                const isSource = lang === sourceLang;
                const value = isSource
                  ? ((item as any)[field] as string) || ""
                  : translations[lang] || "";
                return (
                  <div key={lang} className="flex items-center gap-1">
                    <span className="w-8 text-xs text-muted-foreground uppercase">{lang}</span>
                    <Input
                      value={value}
                      readOnly={isSource}
                      onChange={(e) => updateField(field, lang, e.target.value)}
                      placeholder={isSource ? "(source)" : "—"}
                      data-testid={`input-${field}-${lang}-${item.id}`}
                    />
                    {!isSource && overrides[lang] && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Reset to AI translation"
                        onClick={() => resetToAi(field, lang)}
                        data-testid={`button-reset-${field}-${lang}-${item.id}`}
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
