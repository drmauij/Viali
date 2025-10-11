import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, FileText, Activity, Upload, Mic } from "lucide-react";

interface AuditTabProps {
  caseId: string;
}

const mockAuditEntries = [
  {
    id: "1",
    ts: "2025-10-09T14:30:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "create_case",
    details: { title: "Laparoscopic Cholecystectomy" },
  },
  {
    id: "2",
    ts: "2025-10-09T14:32:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "ai_extract_preop",
    details: {
      model: "gpt-4o",
      promptId: "preop_v1",
      redactionMasks: 5,
      fieldsExtracted: ["demographics", "allergies", "medications", "ASA"],
    },
  },
  {
    id: "3",
    ts: "2025-10-09T14:33:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "accept_preop_field",
    details: { field: "asaClass", value: "III" },
  },
  {
    id: "4",
    ts: "2025-10-09T14:40:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "ai_vision_monitor",
    details: {
      model: "gpt-4o-mini",
      promptId: "vision_v1",
      itemsExtracted: 6,
      vitals: ["HR", "SpO2", "NIBP"],
      ventilation: ["EtCO2", "PEEP"],
    },
  },
  {
    id: "5",
    ts: "2025-10-09T14:42:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "ai_voice_transcription",
    details: {
      model: "whisper-1",
      rawNote: "Propofol 200 milligrams IV",
      extractedEvent: { type: "drug_bolus", drug: "Propofol", dose: "200 mg" },
    },
  },
  {
    id: "6",
    ts: "2025-10-09T14:45:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "create_timeline_manual",
    details: { type: "installation", device: "ETT 7.5" },
  },
  {
    id: "7",
    ts: "2025-10-09T16:30:00Z",
    userId: "user-123",
    userName: "Dr. Johnson",
    action: "update_postop",
    details: { field: "disposition", value: "Ward" },
  },
];

export default function AuditTab({ caseId }: AuditTabProps) {
  const getActionIcon = (action: string) => {
    if (action.startsWith("ai_")) return <Bot className="h-4 w-4 text-purple-500" />;
    if (action.includes("timeline")) return <Activity className="h-4 w-4 text-blue-500" />;
    return <FileText className="h-4 w-4 text-gray-500" />;
  };

  const getActionBadge = (action: string) => {
    if (action.startsWith("ai_")) {
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">AI</Badge>;
    }
    if (action.includes("create") || action.includes("update")) {
      return <Badge variant="outline">Manual</Badge>;
    }
    return <Badge variant="secondary">Action</Badge>;
  };

  const formatActionName = (action: string) => {
    return action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Audit Trail</h2>
        <p className="text-sm text-muted-foreground">
          Chronological log of all user and AI actions for this case
        </p>
      </div>

      <div className="space-y-3">
        {mockAuditEntries.map((entry) => (
          <Card key={entry.id} data-testid={`audit-entry-${entry.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  {getActionIcon(entry.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getActionBadge(entry.action)}
                    <span className="font-medium text-sm">{formatActionName(entry.action)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <User className="h-3 w-3" />
                    <span>{entry.userName}</span>
                    <span>•</span>
                    <span>{new Date(entry.ts).toLocaleString()}</span>
                  </div>
                  {entry.details && (
                    <div className="bg-muted rounded-md p-3 text-xs font-mono">
                      <pre className="whitespace-pre-wrap overflow-auto">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Audit Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full mt-1.5"></div>
            <div>
              <p className="font-medium">AI Actions</p>
              <p className="text-xs text-muted-foreground">
                Include model IDs, prompt versions, input/output snippets, and redaction masks
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
            <div>
              <p className="font-medium">Manual Actions</p>
              <p className="text-xs text-muted-foreground">
                Track all user-initiated changes, edits, and data entry
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full mt-1.5"></div>
            <div>
              <p className="font-medium">Timestamps</p>
              <p className="text-xs text-muted-foreground">
                All times stored in UTC, displayed in local timezone
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
