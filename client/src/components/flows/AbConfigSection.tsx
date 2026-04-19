import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  holdoutPctPerArm: number;
  onChange: (pct: number) => void;
  segmentSize: number | null;
  variantCount: number;
}

export default function AbConfigSection({
  holdoutPctPerArm,
  onChange,
  segmentSize,
  variantCount,
}: Props) {
  const { t } = useTranslation();
  const initialSendCount =
    segmentSize !== null
      ? Math.round((segmentSize * holdoutPctPerArm * variantCount) / 100)
      : null;
  const holdoutCount =
    segmentSize !== null && initialSendCount !== null
      ? segmentSize - initialSendCount
      : null;

  return (
    <div className="border rounded-md p-4 space-y-3 bg-muted/30">
      <h4 className="font-semibold">
        {t("flows.ab.configTitle", "A/B Test Configuration")}
      </h4>
      <div className="flex items-center gap-4">
        <Label className="text-sm">
          {t("flows.ab.holdoutPct", "Hold-out per arm")}
        </Label>
        <Select
          value={String(holdoutPctPerArm)}
          onValueChange={(v) => onChange(parseInt(v, 10))}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10%</SelectItem>
            <SelectItem value="15">15%</SelectItem>
            <SelectItem value="20">20%</SelectItem>
            <SelectItem value="25">25%</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {segmentSize !== null && (
        <p className="text-sm text-muted-foreground">
          {t(
            "flows.ab.preview",
            "Initial send: {{count}} patients ({{perArm}} per arm). {{holdout}} wait for the winner.",
            {
              count: initialSendCount ?? 0,
              perArm: Math.round((segmentSize * holdoutPctPerArm) / 100),
              holdout: holdoutCount ?? 0,
            },
          )}
        </p>
      )}
    </div>
  );
}
