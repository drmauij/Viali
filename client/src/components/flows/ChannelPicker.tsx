import { cn } from "@/lib/utils";
import { MessageSquare, Mail, Newspaper } from "lucide-react";

export type Channel = "sms" | "email" | "html_email";

interface ChannelOption {
  value: Channel;
  label: string;
  subtitle: string;
  icon: typeof Mail;
}

interface Props {
  value: Channel | null;
  onChange: (channel: Channel) => void;
}

const CHANNELS: ChannelOption[] = [
  { value: "sms", label: "SMS", subtitle: "Kurznachricht (160 Zeichen)", icon: MessageSquare },
  { value: "email", label: "Email", subtitle: "Einfache Text-Email", icon: Mail },
  { value: "html_email", label: "Newsletter", subtitle: "HTML Email mit Design", icon: Newspaper },
];

export default function ChannelPicker({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CHANNELS.map((ch) => (
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
          <div className="font-medium text-sm">{ch.label}</div>
          <div className="text-xs text-muted-foreground">{ch.subtitle}</div>
        </button>
      ))}
    </div>
  );
}
