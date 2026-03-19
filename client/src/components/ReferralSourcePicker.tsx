import {
  Bot,
  Megaphone,
  MoreHorizontal,
  Search,
  Share2,
  Stethoscope,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";

export interface ReferralSourcePickerProps {
  value: string;
  detail: string;
  onChange: (source: string, detail: string) => void;
  labels: {
    title: string;
    hint: string;
    social: string;
    searchEngine: string;
    llm: string;
    wordOfMouth: string;
    belegarzt: string;
    other: string;
    whichOne: string;
    facebook: string;
    instagram: string;
    tiktok: string;
    google: string;
    bing: string;
    wordOfMouthPlaceholder: string;
    otherPlaceholder: string;
  };
}

const sources = [
  { value: "social", labelField: "social" as const, icon: Share2 },
  { value: "search_engine", labelField: "searchEngine" as const, icon: Search },
  { value: "llm", labelField: "llm" as const, icon: Bot },
  { value: "word_of_mouth", labelField: "wordOfMouth" as const, icon: Users },
  { value: "belegarzt", labelField: "belegarzt" as const, icon: Stethoscope },
  { value: "other", labelField: "other" as const, icon: MoreHorizontal },
];

export function ReferralSourcePicker({ value, detail, onChange, labels }: ReferralSourcePickerProps) {
  const handleSourceSelect = (source: string) => {
    onChange(source, "");
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-11 h-11 bg-blue-50 dark:bg-blue-900/30 rounded-xl">
          <Megaphone className="w-5 h-5 text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold">{labels.title}</h3>
        <p className="text-sm text-muted-foreground">{labels.hint}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-[360px] mx-auto">
        {sources.map(({ value: sourceValue, labelField, icon: Icon }) => {
          const isSelected = value === sourceValue;
          return (
            <button
              key={sourceValue}
              type="button"
              onClick={() => handleSourceSelect(sourceValue)}
              data-testid={`referral-card-${sourceValue}`}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                isSelected
                  ? "border-primary bg-blue-50 dark:bg-blue-900/20"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                  isSelected ? "bg-blue-100 dark:bg-blue-800/40" : "bg-slate-100 dark:bg-slate-700"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isSelected ? "text-primary" : "text-slate-600 dark:text-slate-400"}`}
                />
              </div>
              <span
                className={`text-sm font-medium ${
                  isSelected ? "text-primary font-semibold" : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {labels[labelField]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-options for social */}
      {value === "social" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {labels.whichOne}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["facebook", "instagram", "tiktok"] as const).map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => onChange(value, platform)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border-2 transition-colors ${
                  detail === platform
                    ? "border-primary bg-blue-50 dark:bg-blue-900/20 text-primary font-medium"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                {labels[platform]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sub-options for search */}
      {value === "search_engine" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {labels.whichOne}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["google", "bing"] as const).map((engine) => (
              <button
                key={engine}
                type="button"
                onClick={() => onChange(value, engine)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm border-2 transition-colors ${
                  detail === engine
                    ? "border-primary bg-blue-50 dark:bg-blue-900/20 text-primary font-medium"
                    : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                {labels[engine]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free text for word_of_mouth */}
      {value === "word_of_mouth" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <Input
            value={detail}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder={labels.wordOfMouthPlaceholder}
          />
        </div>
      )}

      {/* Free text for other */}
      {value === "other" && (
        <div className="max-w-[360px] mx-auto border rounded-xl p-3 bg-white dark:bg-slate-800">
          <Input
            value={detail}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder={labels.otherPlaceholder}
          />
        </div>
      )}
    </div>
  );
}
