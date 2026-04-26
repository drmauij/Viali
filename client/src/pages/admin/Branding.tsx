import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookPreview } from "@/components/booking/BookPreview";
import type { BookingTheme } from "@shared/schema";

const HEADING_FONTS = [
  "Playfair Display", "Cormorant Garamond", "Merriweather", "Lora",
  "DM Serif Display", "Libre Baskerville", "Montserrat", "Poppins",
  "Bebas Neue", "Oswald",
];
const BODY_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Source Sans 3",
  "Nunito Sans", "Work Sans", "DM Sans", "IBM Plex Sans", "Manrope",
];

interface Props {
  scope: { kind: "group"; id: string } | { kind: "hospital"; id: string };
  initialTheme: BookingTheme | null;
}

interface FormState {
  bgColor: string;
  primaryColor: string;
  secondaryColor: string;
  headingFont: string;
  bodyFont: string;
  cardRadius: "sharp" | "rounded" | "pill" | "";
  buttonStyle: "filled" | "outline" | "ghost" | "";
}

const fieldKeys = ["bgColor", "primaryColor", "secondaryColor"] as const;

export default function Branding({ scope, initialTheme }: Props) {
  const [theme, setTheme] = useState<FormState>({
    bgColor: initialTheme?.bgColor ?? "",
    primaryColor: initialTheme?.primaryColor ?? "",
    secondaryColor: initialTheme?.secondaryColor ?? "",
    headingFont: initialTheme?.headingFont ?? "",
    bodyFont: initialTheme?.bodyFont ?? "",
    cardRadius: (initialTheme?.cardRadius as FormState["cardRadius"]) ?? "",
    buttonStyle: (initialTheme?.buttonStyle as FormState["buttonStyle"]) ?? "",
  });
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const path = scope.kind === "group"
        ? `/api/branding/group/${scope.id}`
        : `/api/branding/hospital/${scope.id}`;
      const body = {
        bgColor: theme.bgColor || null,
        primaryColor: theme.primaryColor || null,
        secondaryColor: theme.secondaryColor || null,
        headingFont: theme.headingFont || null,
        bodyFont: theme.bodyFont || null,
        cardRadius: theme.cardRadius || null,
        buttonStyle: theme.buttonStyle || null,
      };
      const res = await apiRequest("PATCH", path, body);
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Booking theme updated." });
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    },
  });

  async function importFromUrl() {
    if (!importUrl) return;
    setImporting(true);
    try {
      const res = await apiRequest("POST", "/api/branding/extract-from-url", { url: importUrl });
      const t = await res.json();
      setTheme({
        bgColor: t.bgColor ?? "",
        primaryColor: t.primaryColor ?? "",
        secondaryColor: t.secondaryColor ?? "",
        headingFont: t.headingFont ?? "",
        bodyFont: t.bodyFont ?? "",
        cardRadius: t.cardRadius ?? "",
        buttonStyle: t.buttonStyle ?? "",
      });
      toast({
        title: "Imported",
        description: t.sourceFont
          ? `Mapped '${t.sourceFont.body}' → '${t.bodyFont}'`
          : "Theme extracted.",
      });
    } catch (err: any) {
      toast({
        title: "Import failed",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setTheme({ bgColor: "", primaryColor: "", secondaryColor: "", headingFont: "", bodyFont: "", cardRadius: "", buttonStyle: "" });
  }

  const previewTheme: BookingTheme = {
    bgColor: theme.bgColor || null,
    primaryColor: theme.primaryColor || null,
    secondaryColor: theme.secondaryColor || null,
    headingFont: theme.headingFont || null,
    bodyFont: theme.bodyFont || null,
    cardRadius: theme.cardRadius || null,
    buttonStyle: theme.buttonStyle || null,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="rounded border p-4 space-y-2">
          <Label>Import from URL</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/termin-buchen"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <Button onClick={importFromUrl} disabled={importing}>
              {importing ? "Reading..." : "Run"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Powered by Claude — extracts colors and fonts from a public page.
          </p>
        </div>

        {fieldKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <Label className="w-32 capitalize">{key.replace("Color", " color")}</Label>
            <input
              type="color"
              value={theme[key] || "#ffffff"}
              onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
              className="h-9 w-12 rounded border"
            />
            <Input
              value={theme[key] || ""}
              onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
              placeholder="#aabbcc"
              className="font-mono"
            />
          </div>
        ))}

        <div className="flex items-center gap-2">
          <Label className="w-32">Heading font</Label>
          <select
            className="border rounded px-2 py-2 flex-1 bg-background text-foreground border-input"
            value={theme.headingFont || ""}
            onChange={(e) => setTheme({ ...theme, headingFont: e.target.value })}
          >
            <option value="">— Default —</option>
            {HEADING_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-32">Body font</Label>
          <select
            className="border rounded px-2 py-2 flex-1 bg-background text-foreground border-input"
            value={theme.bodyFont || ""}
            onChange={(e) => setTheme({ ...theme, bodyFont: e.target.value })}
          >
            <option value="">— Default —</option>
            {BODY_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-32">Corner radius</Label>
          <div className="flex gap-1 flex-1">
            {([
              ["", "Default"],
              ["sharp", "Sharp"],
              ["rounded", "Rounded"],
              ["pill", "Pill"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTheme({ ...theme, cardRadius: val as FormState["cardRadius"] })}
                className={`flex-1 py-2 text-sm rounded border ${
                  (theme.cardRadius || "") === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="w-32">Button style</Label>
          <div className="flex gap-1 flex-1">
            {([
              ["", "Default"],
              ["filled", "Filled"],
              ["outline", "Outline"],
              ["ghost", "Ghost"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTheme({ ...theme, buttonStyle: val as FormState["buttonStyle"] })}
                className={`flex-1 py-2 text-sm rounded border ${
                  (theme.buttonStyle || "") === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-input hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save"}
          </Button>
          <Button variant="outline" onClick={reset}>Reset</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Live preview</Label>
        <BookPreview theme={previewTheme} />
      </div>
    </div>
  );
}
