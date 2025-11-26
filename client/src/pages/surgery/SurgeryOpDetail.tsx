import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, FileText, ClipboardCheck, Package } from "lucide-react";
import type { Surgery, Patient } from "@shared/schema";

interface IntraopRecord {
  positioning: string;
  disinfectionType: string;
  disinfectionPerformedBy: string;
  equipmentNotes: string;
  koagulationMonopolar: boolean;
  koagulationBipolar: boolean;
  neutralElectrode: string;
  pathologyHistologie: boolean;
  pathologyMikrobiologie: boolean;
  irrigationNaCl: boolean;
  irrigationH2O2: boolean;
  infiltrationTumor: boolean;
  medRopivacain: boolean;
  medKontrastmittel: boolean;
  medSalben: boolean;
  dressingElBinden: boolean;
  dressingBauchgurt: boolean;
  dressingBH: boolean;
  dressingFaceLift: boolean;
  dressingSteristrips: boolean;
  dressingComfeel: boolean;
  dressingOpsite: boolean;
  dressingKompressen: boolean;
  dressingMefix: boolean;
  dressingOther: string;
  drainageType: string;
  drainageCH: string;
  drainageCount: string;
  signatureZudienung: string;
  signatureInstrum: string;
}

interface SurgicalCount {
  item: string;
  count1: string;
  count2: string;
  countFinal: string;
}

interface SterileItem {
  id: string;
  ref: string;
  lot: string;
  expiry: string;
  description: string;
}

interface SutureUsage {
  type: string;
  sizes: string;
}

export default function SurgeryOpDetail() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/surgery/op/:id");
  const surgeryId = params?.id;

  const [activeTab, setActiveTab] = useState("intraop");

  const { data: surgery, isLoading: surgeryLoading } = useQuery<Surgery>({
    queryKey: ['/api/surgeries', surgeryId],
    enabled: !!surgeryId,
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ['/api/patients', surgery?.patientId],
    enabled: !!surgery?.patientId,
  });

  const [intraopRecord, setIntraopRecord] = useState<IntraopRecord>({
    positioning: "",
    disinfectionType: "",
    disinfectionPerformedBy: "",
    equipmentNotes: "",
    koagulationMonopolar: false,
    koagulationBipolar: false,
    neutralElectrode: "",
    pathologyHistologie: false,
    pathologyMikrobiologie: false,
    irrigationNaCl: false,
    irrigationH2O2: false,
    infiltrationTumor: false,
    medRopivacain: false,
    medKontrastmittel: false,
    medSalben: false,
    dressingElBinden: false,
    dressingBauchgurt: false,
    dressingBH: false,
    dressingFaceLift: false,
    dressingSteristrips: false,
    dressingComfeel: false,
    dressingOpsite: false,
    dressingKompressen: false,
    dressingMefix: false,
    dressingOther: "",
    drainageType: "redon",
    drainageCH: "",
    drainageCount: "",
    signatureZudienung: "",
    signatureInstrum: "",
  });

  const [surgicalCounts, setSurgicalCounts] = useState<SurgicalCount[]>([
    { item: "Bauchtücher", count1: "", count2: "", countFinal: "" },
    { item: "Kompressen", count1: "", count2: "", countFinal: "" },
    { item: "Tupfer", count1: "", count2: "", countFinal: "" },
    { item: "Tupferli", count1: "", count2: "", countFinal: "" },
    { item: "Gummibändli", count1: "", count2: "", countFinal: "" },
    { item: "5x5 Kompressen", count1: "", count2: "", countFinal: "" },
  ]);

  const [sterileItems, setSterileItems] = useState<SterileItem[]>([]);
  const [sutureUsages, setSutureUsages] = useState<SutureUsage[]>([
    { type: "Vicryl", sizes: "" },
    { type: "V-Lock", sizes: "" },
    { type: "Prolene", sizes: "" },
    { type: "Ethilon", sizes: "" },
    { type: "Monocryl", sizes: "" },
    { type: "Stratafix", sizes: "" },
    { type: "PDS Plus", sizes: "" },
    { type: "Ethicon", sizes: "" },
  ]);

  const updateIntraop = (field: keyof IntraopRecord, value: any) => {
    setIntraopRecord(prev => ({ ...prev, [field]: value }));
  };

  const updateCount = (index: number, field: keyof SurgicalCount, value: string) => {
    setSurgicalCounts(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addSterileItem = () => {
    setSterileItems(prev => [...prev, {
      id: Date.now().toString(),
      ref: "",
      lot: "",
      expiry: "",
      description: "",
    }]);
  };

  const updateSterileItem = (id: string, field: keyof SterileItem, value: string) => {
    setSterileItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const updateSuture = (index: number, sizes: string) => {
    setSutureUsages(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], sizes };
      return updated;
    });
  };

  if (surgeryLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/surgery/op")}
            data-testid="back-button"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <i className="fas fa-user-nurse text-teal-500"></i>
              {t('surgery.opDetail.title')}
            </h1>
            {patient && (
              <p className="text-sm text-muted-foreground">
                {patient.firstName} {patient.surname} {patient.patientNumber && `• #${patient.patientNumber}`}
                {patient.birthday && ` • *${new Date(patient.birthday).toLocaleDateString('de-CH')}`}
              </p>
            )}
            {surgery && (
              <p className="text-sm font-medium text-foreground mt-1">
                {surgery.plannedSurgery}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" data-testid="save-draft-button">
            <Save className="h-4 w-4 mr-2" />
            {t('surgery.opDetail.saveDraft')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-4">
          <TabsList className="h-12 bg-transparent gap-2">
            <TabsTrigger 
              value="intraop" 
              className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-900 dark:data-[state=active]:bg-teal-900 dark:data-[state=active]:text-teal-100"
              data-testid="tab-intraop"
            >
              <FileText className="h-4 w-4 mr-2" />
              {t('surgery.opDetail.tabs.intraop')}
            </TabsTrigger>
            <TabsTrigger 
              value="counts" 
              className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-900 dark:data-[state=active]:bg-teal-900 dark:data-[state=active]:text-teal-100"
              data-testid="tab-counts"
            >
              <ClipboardCheck className="h-4 w-4 mr-2" />
              {t('surgery.opDetail.tabs.counts')}
            </TabsTrigger>
            <TabsTrigger 
              value="sterile" 
              className="data-[state=active]:bg-teal-100 data-[state=active]:text-teal-900 dark:data-[state=active]:bg-teal-900 dark:data-[state=active]:text-teal-100"
              data-testid="tab-sterile"
            >
              <Package className="h-4 w-4 mr-2" />
              {t('surgery.opDetail.tabs.sterile')}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <TabsContent value="intraop" className="m-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-bed text-muted-foreground"></i>
                  {t('surgery.intraop.positioning')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {['RL', 'SL', 'BL', 'SSL', 'EXT'].map(pos => (
                    <Button
                      key={pos}
                      variant={intraopRecord.positioning === pos ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateIntraop('positioning', pos)}
                      data-testid={`pos-${pos}`}
                    >
                      {pos}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-spray-can text-muted-foreground"></i>
                  {t('surgery.intraop.disinfection')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 'kodan_colored', label: t('surgery.intraop.kodanColored') },
                    { id: 'kodan_colorless', label: t('surgery.intraop.kodanColorless') },
                    { id: 'octanisept', label: 'Octanisept' },
                  ].map(opt => (
                    <Button
                      key={opt.id}
                      variant={intraopRecord.disinfectionType === opt.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateIntraop('disinfectionType', opt.id)}
                      data-testid={`disinfection-${opt.id}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div>
                  <Label className="text-sm">{t('surgery.intraop.performedBy')}</Label>
                  <Input
                    value={intraopRecord.disinfectionPerformedBy}
                    onChange={(e) => updateIntraop('disinfectionPerformedBy', e.target.value)}
                    placeholder={t('surgery.intraop.performedByPlaceholder')}
                    className="mt-1"
                    data-testid="disinfection-performer"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-tools text-muted-foreground"></i>
                  {t('surgery.intraop.equipment')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">{t('surgery.intraop.koagulation')}</Label>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="monopolar"
                        checked={intraopRecord.koagulationMonopolar}
                        onCheckedChange={(c) => updateIntraop('koagulationMonopolar', c)}
                        data-testid="koag-monopolar"
                      />
                      <Label htmlFor="monopolar" className="text-sm">Monopolar</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="bipolar"
                        checked={intraopRecord.koagulationBipolar}
                        onCheckedChange={(c) => updateIntraop('koagulationBipolar', c)}
                        data-testid="koag-bipolar"
                      />
                      <Label htmlFor="bipolar" className="text-sm">Bipolar</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">{t('surgery.intraop.neutralElectrode')}</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { id: 'shoulder', label: t('surgery.intraop.shoulder') },
                      { id: 'abdomen', label: t('surgery.intraop.abdomen') },
                      { id: 'thigh', label: t('surgery.intraop.thigh') },
                      { id: 'back', label: t('surgery.intraop.back') },
                    ].map(opt => (
                      <Button
                        key={opt.id}
                        variant={intraopRecord.neutralElectrode === opt.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateIntraop('neutralElectrode', opt.id)}
                        data-testid={`electrode-${opt.id}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">{t('surgery.intraop.pathology')}</Label>
                  <div className="flex gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="histologie"
                        checked={intraopRecord.pathologyHistologie}
                        onCheckedChange={(c) => updateIntraop('pathologyHistologie', c)}
                        data-testid="path-histologie"
                      />
                      <Label htmlFor="histologie" className="text-sm">{t('surgery.intraop.histologie')}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="mikrobio"
                        checked={intraopRecord.pathologyMikrobiologie}
                        onCheckedChange={(c) => updateIntraop('pathologyMikrobiologie', c)}
                        data-testid="path-mikrobio"
                      />
                      <Label htmlFor="mikrobio" className="text-sm">{t('surgery.intraop.mikrobio')}</Label>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm">{t('surgery.intraop.equipmentNotes')}</Label>
                  <Textarea
                    value={intraopRecord.equipmentNotes}
                    onChange={(e) => updateIntraop('equipmentNotes', e.target.value)}
                    placeholder={t('surgery.intraop.equipmentNotesPlaceholder')}
                    className="mt-1"
                    rows={2}
                    data-testid="equipment-notes"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-tint text-muted-foreground"></i>
                  {t('surgery.intraop.irrigationMeds')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('surgery.intraop.irrigation')}</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox id="nacl" checked={intraopRecord.irrigationNaCl} onCheckedChange={(c) => updateIntraop('irrigationNaCl', c)} data-testid="irr-nacl" />
                      <Label htmlFor="nacl" className="text-sm">NaCl</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="h2o2" checked={intraopRecord.irrigationH2O2} onCheckedChange={(c) => updateIntraop('irrigationH2O2', c)} data-testid="irr-h2o2" />
                      <Label htmlFor="h2o2" className="text-sm">H₂O₂</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('surgery.intraop.infiltration')}</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox id="tumor" checked={intraopRecord.infiltrationTumor} onCheckedChange={(c) => updateIntraop('infiltrationTumor', c)} data-testid="inf-tumor" />
                      <Label htmlFor="tumor" className="text-sm">{t('surgery.intraop.tumorSolution')}</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('surgery.intraop.medications')}</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox id="ropivacain" checked={intraopRecord.medRopivacain} onCheckedChange={(c) => updateIntraop('medRopivacain', c)} data-testid="med-ropivacain" />
                      <Label htmlFor="ropivacain" className="text-sm">Ropivacain</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="kontrast" checked={intraopRecord.medKontrastmittel} onCheckedChange={(c) => updateIntraop('medKontrastmittel', c)} data-testid="med-kontrast" />
                      <Label htmlFor="kontrast" className="text-sm">{t('surgery.intraop.contrast')}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="salben" checked={intraopRecord.medSalben} onCheckedChange={(c) => updateIntraop('medSalben', c)} data-testid="med-salben" />
                      <Label htmlFor="salben" className="text-sm">{t('surgery.intraop.ointments')}</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-bandage text-muted-foreground"></i>
                  {t('surgery.intraop.dressing')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'dressingElBinden', label: 'el. Binden' },
                    { key: 'dressingBauchgurt', label: 'Bauchgurt' },
                    { key: 'dressingBH', label: 'BH' },
                    { key: 'dressingFaceLift', label: 'Face-Lift-Maske' },
                    { key: 'dressingSteristrips', label: 'Steristrips' },
                    { key: 'dressingComfeel', label: 'Comfeel' },
                    { key: 'dressingOpsite', label: 'OPSITE' },
                    { key: 'dressingKompressen', label: 'Kompressen' },
                    { key: 'dressingMefix', label: 'Mefix' },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-2">
                      <Checkbox
                        id={item.key}
                        checked={intraopRecord[item.key as keyof IntraopRecord] as boolean}
                        onCheckedChange={(c) => updateIntraop(item.key as keyof IntraopRecord, c)}
                        data-testid={`dressing-${item.key}`}
                      />
                      <Label htmlFor={item.key} className="text-sm">{item.label}</Label>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Input
                    value={intraopRecord.dressingOther}
                    onChange={(e) => updateIntraop('dressingOther', e.target.value)}
                    placeholder={t('surgery.intraop.otherDressing')}
                    data-testid="dressing-other"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-grip-lines-vertical text-muted-foreground"></i>
                  {t('surgery.intraop.drainage')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-sm">{t('surgery.intraop.drainageType')}</Label>
                    <Select value={intraopRecord.drainageType} onValueChange={(v) => updateIntraop('drainageType', v)}>
                      <SelectTrigger className="mt-1" data-testid="drainage-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="redon">Redon</SelectItem>
                        <SelectItem value="jackson">Jackson-Pratt</SelectItem>
                        <SelectItem value="penrose">Penrose</SelectItem>
                        <SelectItem value="other">{t('surgery.intraop.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Label className="text-sm">CH</Label>
                    <Input
                      value={intraopRecord.drainageCH}
                      onChange={(e) => updateIntraop('drainageCH', e.target.value)}
                      placeholder="15"
                      className="mt-1"
                      data-testid="drainage-ch"
                    />
                  </div>
                  <div className="w-24">
                    <Label className="text-sm">{t('surgery.intraop.count')}</Label>
                    <Input
                      value={intraopRecord.drainageCount}
                      onChange={(e) => updateIntraop('drainageCount', e.target.value)}
                      placeholder="2"
                      className="mt-1"
                      data-testid="drainage-count"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-signature text-muted-foreground"></i>
                  {t('surgery.intraop.signatures')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureZudienung')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureInstrum')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="counts" className="m-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-calculator text-muted-foreground"></i>
                  {t('surgery.counts.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-medium">{t('surgery.counts.item')}</th>
                        <th className="text-center py-2 px-2 font-medium w-24">{t('surgery.counts.count1')}</th>
                        <th className="text-center py-2 px-2 font-medium w-24">{t('surgery.counts.count2')}</th>
                        <th className="text-center py-2 px-2 font-medium w-24">{t('surgery.counts.countFinal')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {surgicalCounts.map((count, index) => (
                        <tr key={count.item} className="border-b border-border">
                          <td className="py-2 px-2 font-medium">{count.item}</td>
                          <td className="py-2 px-2">
                            <Input
                              value={count.count1}
                              onChange={(e) => updateCount(index, 'count1', e.target.value)}
                              className="text-center h-9"
                              data-testid={`count1-${index}`}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              value={count.count2}
                              onChange={(e) => updateCount(index, 'count2', e.target.value)}
                              className="text-center h-9"
                              data-testid={`count2-${index}`}
                            />
                          </td>
                          <td className="py-2 px-2">
                            <Input
                              value={count.countFinal}
                              onChange={(e) => updateCount(index, 'countFinal', e.target.value)}
                              className="text-center h-9"
                              data-testid={`countFinal-${index}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-clipboard-check text-muted-foreground"></i>
                  {t('surgery.counts.whoChecklist')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { phase: 'Sign In', icon: 'fa-play', color: 'text-blue-500' },
                    { phase: 'Time Out', icon: 'fa-pause', color: 'text-amber-500' },
                    { phase: 'Sign Out', icon: 'fa-stop', color: 'text-green-500' },
                  ].map(item => (
                    <div key={item.phase} className="bg-muted/50 rounded-lg p-3 text-center">
                      <i className={`fas ${item.icon} ${item.color} text-lg mb-1`}></i>
                      <p className="text-sm font-medium">{item.phase}</p>
                      <p className="text-xs text-muted-foreground">{t('surgery.counts.pending')}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {t('surgery.counts.whoIntegrationNote')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-signature text-muted-foreground"></i>
                  {t('surgery.counts.signatures')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureInstrum')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureZudienung')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sterile" className="m-0 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <i className="fas fa-box-open text-muted-foreground"></i>
                    {t('surgery.sterile.items')}
                  </span>
                  <Button variant="outline" size="sm" onClick={addSterileItem} data-testid="add-sterile-item">
                    <i className="fas fa-plus mr-2"></i>
                    {t('surgery.sterile.addItem')}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sterileItems.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <i className="fas fa-barcode text-3xl mb-2"></i>
                    <p>{t('surgery.sterile.noItems')}</p>
                    <p className="text-xs mt-1">{t('surgery.sterile.scanOrAdd')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sterileItems.map((item) => (
                      <div key={item.id} className="border border-border rounded-lg p-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <Label className="text-xs">REF</Label>
                            <Input
                              value={item.ref}
                              onChange={(e) => updateSterileItem(item.id, 'ref', e.target.value)}
                              className="h-8 text-sm"
                              data-testid={`sterile-ref-${item.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">LOT</Label>
                            <Input
                              value={item.lot}
                              onChange={(e) => updateSterileItem(item.id, 'lot', e.target.value)}
                              className="h-8 text-sm"
                              data-testid={`sterile-lot-${item.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t('surgery.sterile.expiry')}</Label>
                            <Input
                              value={item.expiry}
                              onChange={(e) => updateSterileItem(item.id, 'expiry', e.target.value)}
                              placeholder="MM/YYYY"
                              className="h-8 text-sm"
                              data-testid={`sterile-expiry-${item.id}`}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t('surgery.sterile.description')}</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updateSterileItem(item.id, 'description', e.target.value)}
                              className="h-8 text-sm"
                              data-testid={`sterile-desc-${item.id}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-syringe text-muted-foreground"></i>
                  {t('surgery.sterile.sutures')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-2 font-medium w-28">{t('surgery.sterile.sutureType')}</th>
                        <th className="text-left py-2 px-2 font-medium">{t('surgery.sterile.sizes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sutureUsages.map((suture, index) => (
                        <tr key={suture.type} className="border-b border-border">
                          <td className="py-2 px-2 font-medium">{suture.type}</td>
                          <td className="py-2 px-2">
                            <Input
                              value={suture.sizes}
                              onChange={(e) => updateSuture(index, e.target.value)}
                              placeholder={t('surgery.sterile.sizePlaceholder')}
                              className="h-9"
                              data-testid={`suture-${index}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <i className="fas fa-signature text-muted-foreground"></i>
                  {t('surgery.sterile.signatures')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureZudienung')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">{t('surgery.intraop.signatureInstrum')}</Label>
                    <div className="mt-1 h-20 border border-dashed border-border rounded-lg flex items-center justify-center bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('surgery.intraop.tapToSign')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
