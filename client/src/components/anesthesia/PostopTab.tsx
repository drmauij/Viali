import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Activity, AlertTriangle } from "lucide-react";

interface PostopTabProps {
  caseId: string;
}

const mockPostopTimeline = [
  {
    id: "1",
    ts: "2025-10-09T16:00:00Z",
    vitals: { HR: 78, SpO2: 97, BP: "125/82" },
    painScore: 3,
  },
  {
    id: "2",
    ts: "2025-10-09T16:15:00Z",
    vitals: { HR: 75, SpO2: 98, BP: "120/80" },
    painScore: 2,
    analgesia: { drug: "Morphine", dose: "5 mg", route: "IV" },
  },
  {
    id: "3",
    ts: "2025-10-09T16:30:00Z",
    vitals: { HR: 72, SpO2: 99, BP: "118/78" },
    painScore: 1,
  },
];

const mockPostopData = {
  summary: "Patient recovered well from GA. Extubated in OR without complications.",
  complications: ["Mild PONV"],
  analgesia: [
    { drug: "Morphine", dose: "5 mg", route: "IV", time: "2025-10-09T16:15:00Z" },
    { drug: "Paracetamol", dose: "1 g", route: "IV", time: "2025-10-09T16:30:00Z" },
  ],
  disposition: "Ward",
  notes: "Continue multimodal analgesia. Monitor for PONV.",
};

export default function PostopTab({ caseId }: PostopTabProps) {
  const [isAddVitalsOpen, setIsAddVitalsOpen] = useState(false);
  const [isAddAnalgesiaOpen, setIsAddAnalgesiaOpen] = useState(false);
  const [isAddComplicationOpen, setIsAddComplicationOpen] = useState(false);

  const getPainColor = (score: number) => {
    if (score <= 3) return "text-green-600 dark:text-green-400";
    if (score <= 6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Post-operative Record</h2>
        <Dialog open={isAddVitalsOpen} onOpenChange={setIsAddVitalsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-postop-vitals">
              <Plus className="h-4 w-4" />
              Add Vitals
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add PACU Vitals</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postop-hr">HR (bpm)</Label>
                  <Input id="postop-hr" type="number" placeholder="75" data-testid="input-postop-hr" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postop-spo2">SpO₂ (%)</Label>
                  <Input id="postop-spo2" type="number" placeholder="98" data-testid="input-postop-spo2" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postop-bp">BP</Label>
                  <Input id="postop-bp" placeholder="120/80" data-testid="input-postop-bp" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pain-score">Pain Score (0-10)</Label>
                  <Input id="pain-score" type="number" min="0" max="10" placeholder="3" data-testid="input-pain-score" />
                </div>
              </div>
              <Button className="w-full" onClick={() => setIsAddVitalsOpen(false)} data-testid="button-submit-postop-vitals">
                Add Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* PACU Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            PACU Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>HR</TableHead>
                <TableHead>SpO₂</TableHead>
                <TableHead>BP</TableHead>
                <TableHead>Pain (NRS)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockPostopTimeline.map((entry) => (
                <TableRow key={entry.id} data-testid={`row-postop-${entry.id}`}>
                  <TableCell className="font-mono text-sm">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>{entry.vitals.HR} bpm</TableCell>
                  <TableCell>{entry.vitals.SpO2}%</TableCell>
                  <TableCell>{entry.vitals.BP} mmHg</TableCell>
                  <TableCell>
                    <span className={`font-bold ${getPainColor(entry.painScore)}`}>
                      {entry.painScore}/10
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.analgesia && (
                      <span className="text-xs text-muted-foreground">
                        {entry.analgesia.drug} {entry.analgesia.dose} {entry.analgesia.route}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Analgesia Log */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Analgesia Administered</CardTitle>
              <Dialog open={isAddAnalgesiaOpen} onOpenChange={setIsAddAnalgesiaOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-analgesia">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Analgesia</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="analgesia-drug">Drug</Label>
                      <Input id="analgesia-drug" placeholder="e.g., Morphine" data-testid="input-analgesia-drug" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="analgesia-dose">Dose</Label>
                        <Input id="analgesia-dose" placeholder="5 mg" data-testid="input-analgesia-dose" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="analgesia-route">Route</Label>
                        <Select>
                          <SelectTrigger data-testid="select-analgesia-route">
                            <SelectValue placeholder="Route" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IV">IV</SelectItem>
                            <SelectItem value="IM">IM</SelectItem>
                            <SelectItem value="PO">PO</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => setIsAddAnalgesiaOpen(false)} data-testid="button-submit-analgesia">
                      Add Analgesia
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {mockPostopData.analgesia.map((item, idx) => (
              <div key={idx} className="p-3 bg-muted rounded-md">
                <p className="font-medium">{item.drug}</p>
                <p className="text-sm text-muted-foreground">
                  {item.dose} {item.route} at {new Date(item.time).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Complications */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Complications
              </CardTitle>
              <Dialog open={isAddComplicationOpen} onOpenChange={setIsAddComplicationOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-complication">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Complication</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="complication">Complication</Label>
                      <Input id="complication" placeholder="e.g., PONV, Hypotension" data-testid="input-complication" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="complication-details">Details/Management</Label>
                      <Textarea id="complication-details" rows={3} data-testid="textarea-complication-details" />
                    </div>
                    <Button className="w-full" onClick={() => setIsAddComplicationOpen(false)} data-testid="button-submit-complication">
                      Add Complication
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockPostopData.complications.length > 0 ? (
              mockPostopData.complications.map((comp, idx) => (
                <div key={idx} className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">{comp}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No complications recorded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary & Disposition */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              defaultValue={mockPostopData.summary}
              rows={4}
              placeholder="Post-operative summary..."
              data-testid="textarea-postop-summary"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disposition & Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disposition">Disposition</Label>
              <Select defaultValue={mockPostopData.disposition}>
                <SelectTrigger data-testid="select-disposition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Ward">Ward</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="HDU">HDU</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="postop-notes">Notes</Label>
              <Textarea
                id="postop-notes"
                defaultValue={mockPostopData.notes}
                rows={3}
                data-testid="textarea-postop-notes"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button className="w-full" size="lg" data-testid="button-save-postop">
        Save Post-op Record
      </Button>
    </div>
  );
}
