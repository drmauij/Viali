import { Badge } from "@/components/ui/badge";
import type { DemoStep } from "./postTreatmentFlow";

interface Props {
  step: DemoStep;
}

function PanelHeader({ label, type }: { label: string; type: string }) {
  return (
    <div className="border-b border-slate-700 pb-3 mb-4">
      <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">{type}</div>
      <h3 className="text-lg font-semibold text-slate-100">{label}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-sm text-slate-100">{children}</div>
    </div>
  );
}

function MessagePreview({ text }: { text: string }) {
  // Highlight {{patient.name}} tokens
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-md p-3 text-sm text-slate-100 leading-relaxed">
      {parts.map((part, i) =>
        part.startsWith("{{") ? (
          <span key={i} className="bg-purple-500/20 text-purple-300 px-1 rounded">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

export function StepConfigPanel({ step }: Props) {
  const cfg = step.config;

  switch (step.type) {
    case "trigger":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="Auslöser" label="Behandlung abgeschlossen" />
          <Field label="Ereignis">{cfg.event as string}</Field>
          <Field label="Behandlungstyp">
            <div className="flex gap-2 flex-wrap">
              {(cfg.treatmentTypes as string[]).map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </div>
          </Field>
        </div>
      );

    case "wait":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="Wartezeit" label={step.label} />
          <div className="text-3xl font-bold text-purple-300 mb-2">{cfg.duration as string}</div>
          <p className="text-xs text-slate-400">Patient wartet still im Hintergrund — keine Nachricht in dieser Zeit.</p>
        </div>
      );

    case "send_sms":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="SMS senden" label="Wellness-Check" />
          <Field label="Nachricht">
            <MessagePreview text={cfg.message as string} />
          </Field>
          <Field label="Absender">{cfg.sender as string}</Field>
          <Field label="Geschätzte Empfänger pro Monat">
            <span className="text-purple-300 font-semibold">~{cfg.recipientsPerMonth as number}</span>
          </Field>
        </div>
      );

    case "send_email":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="E-Mail senden" label="Mit Angebot" />
          <Field label="Betreff">{cfg.subject as string}</Field>
          <Field label="Vorschau">
            <MessagePreview text={cfg.preview as string} />
          </Field>
          <Field label="Promo-Code">
            <Badge variant="outline" className="font-mono">{cfg.promoCode as string}</Badge>
            <span className="text-xs text-slate-400 ml-2">automatisch generiert</span>
          </Field>
        </div>
      );

    case "condition":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="Bedingung" label="Verzweigung" />
          <Field label="Prüfung">{cfg.check as string}</Field>
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-emerald-400 font-medium w-12">Ja →</span>
              <span className="text-slate-100">{cfg.yesNext as string}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-orange-400 font-medium w-12">Nein →</span>
              <span className="text-slate-100">{cfg.noNext as string}</span>
            </div>
          </div>
        </div>
      );

    case "end":
      return (
        <div className="bg-slate-800 rounded-lg p-5 border border-slate-700">
          <PanelHeader type="Flow beendet" label={step.label} />
          <p className="text-sm text-slate-300">{cfg.reason as string}</p>
        </div>
      );
  }
}
