import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles } from "lucide-react";
import { TEMPLATES } from "./postTreatmentFlow";

interface Props {
  onOpenDemo: (templateId: string) => void;
}

export function TemplatesList({ onOpenDemo }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Automatisierungs-Vorlagen</h2>
        <p className="text-sm text-muted-foreground">
          Mehrstufige Patientenreisen — vom Auslöser bis zur Conversion.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TEMPLATES.map((tpl) => (
          <Card
            key={tpl.id}
            className={!tpl.available ? "opacity-60" : "hover:border-purple-500 transition-colors"}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-400" />
                  <h3 className="font-semibold">{tpl.title}</h3>
                </div>
                {!tpl.available && <Badge variant="outline">Demnächst</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mb-4">{tpl.description}</p>
              <Button
                variant={tpl.available ? "default" : "outline"}
                size="sm"
                disabled={!tpl.available}
                onClick={() => tpl.available && onOpenDemo(tpl.id)}
                className="gap-2"
              >
                Demo ansehen
                <ArrowRight className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
