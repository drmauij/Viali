import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { MessageSquare, Mail, Newspaper } from "lucide-react";

export type Channel = "sms" | "email" | "html_email";

interface ChannelOption {
  value: Channel;
  labelKey: string;
  labelDefault: string;
  subtitleKey: string;
  subtitleDefault: string;
  icon: typeof Mail;
}

interface Props {
  value: Channel | null;
  onChange: (channel: Channel) => void;
}

const CHANNEL_DEFS: ChannelOption[] = [
  {
    value: "sms",
    labelKey: "flows.channel.sms",
    labelDefault: "SMS",
    subtitleKey: "flows.channel.smsSubtitle",
    subtitleDefault: "Short Message (160 chars)",
    icon: MessageSquare,
  },
  {
    value: "email",
    labelKey: "flows.channel.email",
    labelDefault: "Email",
    subtitleKey: "flows.channel.emailSubtitle",
    subtitleDefault: "Plain Text Email",
    icon: Mail,
  },
  {
    value: "html_email",
    labelKey: "flows.channel.newsletter",
    labelDefault: "Newsletter",
    subtitleKey: "flows.channel.htmlSubtitle",
    subtitleDefault: "HTML Email Newsletter",
    icon: Newspaper,
  },
];

export default function ChannelPicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-3 gap-3">
      {CHANNEL_DEFS.map((ch) => (
        <button
          key={ch.value}
          type="button"
          onClick={() => onChange(ch.value)}
          className={cn(
            "flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center",
            value === ch.value
              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
              : "border-muted hover:border-primary/40 hover:bg-muted/50"
          )}
        >
          <ch.icon
            className={cn("h-6 w-6", value === ch.value ? "text-primary" : "text-muted-foreground")}
          />
          <div className="font-medium text-sm">{t(ch.labelKey, ch.labelDefault)}</div>
          <div className="text-xs text-muted-foreground">{t(ch.subtitleKey, ch.subtitleDefault)}</div>
        </button>
      ))}
    </div>
  );
}
