import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Mic, Plus, LineChart, Camera, Activity } from "lucide-react";
import { formatTime } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";

interface AnesthesiaTabProps {
  caseId: string;
}

const mockTimelineEntries = [
  {
    id: "1",
    ts: "2025-10-09T14:35:00Z",
    source: "manual",
    vitals: {
      HR: { value: "72", unit: "bpm" },
      SpO2: { value: "98", unit: "%" },
      NIBP_sys: { value: "120", unit: "mmHg" },
      NIBP_dia: { value: "80", unit: "mmHg" },
    },
    ventilation: {
      EtCO2: { value: "36", unit: "mmHg" },
      RR: { value: "12", unit: "/min" },
    },
  },
  {
    id: "2",
    ts: "2025-10-09T14:38:00Z",
    source: "voice",
    events: [{ type: "drug_bolus", details: { drug: "Propofol", dose: "200 mg", route: "IV" } }],
    rawNote: "Propofol 200 milligrams IV",
  },
  {
    id: "3",
    ts: "2025-10-09T14:40:00Z",
    source: "vision",
    vitals: {
      HR: { value: "68", unit: "bpm" },
      SpO2: { value: "99", unit: "%" },
    },
    ventilation: {
      EtCO2: { value: "38", unit: "mmHg" },
      PEEP: { value: "5", unit: "cmH2O" },
    },
  },
  {
    id: "4",
    ts: "2025-10-09T14:42:00Z",
    source: "manual",
    installations: [{ type: "airway", device: "ETT", size: "7.5", details: "Cormack-Lehane Grade I" }],
  },
];

export default function AnesthesiaTab({ caseId }: AnesthesiaTabProps) {
  const { t } = useTranslation();
  const [isAddVitalsOpen, setIsAddVitalsOpen] = useState(false);
  const [isAddDrugOpen, setIsAddDrugOpen] = useState(false);
  const [isAddLineOpen, setIsAddLineOpen] = useState(false);

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "manual":
        return <Badge variant="outline">{t("anesthesia.op.manual")}</Badge>;
      case "vision":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{t("anesthesia.op.aiVision")}</Badge>;
      case "voice":
        return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">{t("anesthesia.op.aiVoice")}</Badge>;
      default:
        return <Badge variant="secondary">{source}</Badge>;
    }
  };

  const handleMonitorUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log("Uploading monitor photo:", file.name);
      // Mock AI vision extraction
    }
  };

  const handleVoiceRecord = () => {
    console.log("Starting voice recording...");
    // Mock voice transcription
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("anesthesia.op.intraoperativeRecord")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" data-testid="button-upload-monitor">
            <Camera className="h-4 w-4" />
            <Input
              type="file"
              accept="image/*"
              onChange={handleMonitorUpload}
              className="hidden"
              id="monitor-upload"
            />
            <label htmlFor="monitor-upload" className="cursor-pointer">
              {t("anesthesia.op.monitorPhoto")}
            </label>
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleVoiceRecord} data-testid="button-voice-record">
            <Mic className="h-4 w-4" />
            {t("anesthesia.op.voiceNote")}
          </Button>
        </div>
      </div>

      {/* Mini Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-500" />
              {t("anesthesia.op.heartRate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-24 flex items-end justify-around gap-1">
              {[72, 68, 70, 72, 74, 70, 68].map((value, idx) => (
                <div
                  key={idx}
                  className="bg-red-500 rounded-t w-full"
                  style={{ height: `${(value / 100) * 100}%` }}
                />
              ))}
            </div>
            <p className="text-2xl font-bold text-center mt-2">68 bpm</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              SpO₂
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-24 flex items-end justify-around gap-1">
              {[98, 99, 98, 99, 99, 98, 99].map((value, idx) => (
                <div
                  key={idx}
                  className="bg-blue-500 rounded-t w-full"
                  style={{ height: `${value}%` }}
                />
              ))}
            </div>
            <p className="text-2xl font-bold text-center mt-2">99%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-green-500" />
              EtCO₂
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-24 flex items-end justify-around gap-1">
              {[36, 38, 37, 38, 36, 37, 38].map((value, idx) => (
                <div
                  key={idx}
                  className="bg-green-500 rounded-t w-full"
                  style={{ height: `${(value / 50) * 100}%` }}
                />
              ))}
            </div>
            <p className="text-2xl font-bold text-center mt-2">38 mmHg</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{t("anesthesia.op.timeline")}</CardTitle>
            <div className="flex gap-2">
              <Dialog open={isAddVitalsOpen} onOpenChange={setIsAddVitalsOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-vitals">
                    <Plus className="h-3 w-3" />
                    {t("anesthesia.op.vitals")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("anesthesia.op.addVitalsEntry")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="hr">HR (bpm)</Label>
                        <Input id="hr" type="number" placeholder="72" data-testid="input-hr" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="spo2">SpO₂ (%)</Label>
                        <Input id="spo2" type="number" placeholder="98" data-testid="input-spo2" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sys">SBP (mmHg)</Label>
                        <Input id="sys" type="number" placeholder="120" data-testid="input-sbp" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dia">DBP (mmHg)</Label>
                        <Input id="dia" type="number" placeholder="80" data-testid="input-dbp" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="etco2">EtCO₂ (mmHg)</Label>
                        <Input id="etco2" type="number" placeholder="36" data-testid="input-etco2" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rr">RR (/min)</Label>
                        <Input id="rr" type="number" placeholder="12" data-testid="input-rr" />
                      </div>
                    </div>
                    <Button className="w-full" onClick={() => setIsAddVitalsOpen(false)} data-testid="button-submit-vitals">
                      {t("anesthesia.op.addEntry")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isAddDrugOpen} onOpenChange={setIsAddDrugOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-drug">
                    <Plus className="h-3 w-3" />
                    {t("anesthesia.op.drug")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("anesthesia.op.addDrugAdmin")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="drug">{t("anesthesia.op.drugName")}</Label>
                      <Input id="drug" placeholder="e.g., Propofol" data-testid="input-drug-name" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dose">{t("anesthesia.op.dose")}</Label>
                        <Input id="dose" placeholder="200" data-testid="input-dose" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unit">{t("anesthesia.op.unit")}</Label>
                        <Input id="unit" placeholder="mg" data-testid="input-unit" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="route">{t("anesthesia.op.route")}</Label>
                      <Select>
                        <SelectTrigger data-testid="select-route">
                          <SelectValue placeholder={t("anesthesia.op.selectRoute")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IV">IV</SelectItem>
                          <SelectItem value="IM">IM</SelectItem>
                          <SelectItem value="PO">PO</SelectItem>
                          <SelectItem value="SC">SC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mode">{t("mode")}</Label>
                      <Select>
                        <SelectTrigger data-testid="select-mode">
                          <SelectValue placeholder={t("anesthesia.op.selectMode")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bolus">Bolus</SelectItem>
                          <SelectItem value="infusion">Infusion</SelectItem>
                          <SelectItem value="TCI">TCI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={() => setIsAddDrugOpen(false)} data-testid="button-submit-drug">
                      {t("anesthesia.op.addDrug")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isAddLineOpen} onOpenChange={setIsAddLineOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2" data-testid="button-add-line">
                    <Plus className="h-3 w-3" />
                    {t("anesthesia.op.lineAirway")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("anesthesia.op.addLineAirway")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="type">{t("anesthesia.op.type")}</Label>
                      <Select>
                        <SelectTrigger data-testid="select-line-type">
                          <SelectValue placeholder={t("anesthesia.op.selectType")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="airway">{t("anesthesia.op.airway")}</SelectItem>
                          <SelectItem value="iv">{t("anesthesia.op.ivLine")}</SelectItem>
                          <SelectItem value="arterial">{t("anesthesia.op.arterialLine")}</SelectItem>
                          <SelectItem value="cvl">{t("anesthesia.op.centralLine")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="device">{t("anesthesia.op.device")}</Label>
                        <Input id="device" placeholder="e.g., ETT, 18G" data-testid="input-device" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="size">{t("anesthesia.op.size")}</Label>
                        <Input id="size" placeholder="e.g., 7.5" data-testid="input-size" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="site">{t("anesthesia.op.siteDetails")}</Label>
                      <Input id="site" placeholder="e.g., Left forearm, Grade I" data-testid="input-site" />
                    </div>
                    <Button className="w-full" onClick={() => setIsAddLineOpen(false)} data-testid="button-submit-line">
                      {t("anesthesia.op.addEntry")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("anesthesia.op.source")}</TableHead>
                <TableHead>{t("anesthesia.op.type")}</TableHead>
                <TableHead>{t("anesthesia.op.details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockTimelineEntries.map((entry) => (
                <TableRow key={entry.id} data-testid={`row-timeline-${entry.id}`}>
                  <TableCell className="font-mono text-sm">
                    {formatTime(entry.ts)}
                  </TableCell>
                  <TableCell>{getSourceBadge(entry.source)}</TableCell>
                  <TableCell>
                    {entry.vitals && <Badge variant="outline">{t("anesthesia.op.vitals")}</Badge>}
                    {entry.events && <Badge variant="outline">{t("anesthesia.op.event")}</Badge>}
                    {entry.installations && <Badge variant="outline">{t("anesthesia.op.installation")}</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.vitals && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(entry.vitals).map(([key, val]) => (
                          <span key={key} className="text-xs">
                            {key}: {val.value} {val.unit}
                          </span>
                        ))}
                      </div>
                    )}
                    {entry.ventilation && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(entry.ventilation).map(([key, val]) => (
                          <span key={key} className="text-xs text-muted-foreground">
                            {key}: {val.value} {val.unit}
                          </span>
                        ))}
                      </div>
                    )}
                    {entry.events && (
                      <div>
                        {entry.events.map((evt, idx) => (
                          <div key={idx} className="text-xs">
                            {evt.type}: {evt.details.drug} {evt.details.dose} {evt.details.route}
                          </div>
                        ))}
                        {entry.rawNote && (
                          <p className="text-xs text-muted-foreground italic mt-1">"{entry.rawNote}"</p>
                        )}
                      </div>
                    )}
                    {entry.installations && (
                      <div>
                        {entry.installations.map((inst, idx) => (
                          <div key={idx} className="text-xs">
                            {inst.type}: {inst.device} {inst.size} - {inst.details}
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
