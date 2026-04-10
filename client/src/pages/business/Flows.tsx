import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import {
  Send, Users, BarChart3, CalendarCheck, Plus, Trash2, Loader2,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DUMMY_STATS = [
  { label: "Kampagnen diesen Monat", value: "12", icon: Send, color: "text-purple-400" },
  { label: "Empfänger erreicht", value: "384", icon: Users, color: "text-blue-400" },
  { label: "Ø Öffnungsrate", value: "34%", icon: BarChart3, color: "text-green-400" },
  { label: "Buchungen", value: "28", icon: CalendarCheck, color: "text-orange-400" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Entwurf", variant: "outline" },
  sending: { label: "Wird gesendet...", variant: "secondary" },
  sent: { label: "Gesendet", variant: "default" },
  failed: { label: "Fehlgeschlagen", variant: "destructive" },
};

const CHANNEL_LABEL: Record<string, string> = {
  sms: "SMS",
  email: "Email",
  html_email: "Newsletter",
};

export default function Flows() {
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const hospitalId = activeHospital?.id;

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["flows", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const deleteMutation = useMutation({
    mutationFn: (flowId: string) =>
      apiRequest("DELETE", `/api/business/${hospitalId}/flows/${flowId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] }),
  });

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flows</h1>
          <p className="text-sm text-muted-foreground">Marketing-Kampagnen verwalten</p>
        </div>
        <Button onClick={() => navigate("/business/flows/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          Neue Kampagne
        </Button>
      </div>

      {/* Dashboard cards (dummy) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {DUMMY_STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaign list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (campaigns as any[]).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Send className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-medium mb-1">Noch keine Kampagnen</p>
            <p className="text-sm opacity-60 mb-4">Erstellen Sie Ihre erste Marketing-Kampagne</p>
            <Button onClick={() => navigate("/business/flows/new")} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Erste Kampagne erstellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kanal</TableHead>
                <TableHead>Empfänger</TableHead>
                <TableHead>Gesendet</TableHead>
                <TableHead>Öffnungsrate</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(campaigns as any[]).map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]?.variant || "outline"}>
                      {STATUS_BADGE[c.status]?.label || c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{CHANNEL_LABEL[c.channel] || c.channel || "—"}</TableCell>
                  <TableCell>{c.recipientCount ?? "—"}</TableCell>
                  <TableCell>
                    {c.sentAt ? new Date(c.sentAt).toLocaleDateString("de-CH") : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    {c.status === "draft" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kampagne löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
