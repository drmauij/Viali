import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle, X } from "lucide-react";

interface PreopTabProps {
  caseId: string;
}

const mockPreopData = {
  demographics: { age_years: 56, sex: "F" },
  asaClass: "III",
  allergies: [
    { substance: "Latex", reaction: "Rash", severity: "Moderate" },
  ],
  medications: [
    { drug: "Amlodipine", dose: "5 mg", route: "PO", freq: "daily" },
    { drug: "Metformin", dose: "1000 mg", route: "PO", freq: "BID" },
  ],
  comorbidities: ["HTN", "DM2"],
  airway: {
    mallampati: "II",
    mouth_opening: "Normal",
    dentition: "Good",
  },
  fasting: {
    last_solids: "2025-10-09T06:00:00Z",
    last_clear: "2025-10-09T08:00:00Z",
  },
  plannedAnesthesia: "GA with ETT",
  notes: "Patient anxious about procedure. PONV prophylaxis recommended.",
};

export default function PreopTab({ caseId }: PreopTabProps) {
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [redactedText, setRedactedText] = useState("");
  const [proposedData, setProposedData] = useState<any>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // Mock extraction
      const mockExtracted = "Patient: John Doe\nMRN: 12345678\nAge: 56\nSex: Female\nAllergies: Latex (rash)\nMedications: Amlodipine 5mg PO daily";
      const mockRedacted = "Patient: [NAME]\nMRN: [ID]\nAge: 56\nSex: Female\nAllergies: Latex (rash)\nMedications: Amlodipine 5mg PO daily";
      setExtractedText(mockExtracted);
      setRedactedText(mockRedacted);
    }
  };

  const handleExtract = () => {
    // Mock AI extraction
    setProposedData({
      demographics: { age_years: 56, sex: "F" },
      asaClass: "III",
      allergies: [{ substance: "Latex", reaction: "Rash", severity: "Moderate" }],
      medications: [{ drug: "Amlodipine", dose: "5 mg", route: "PO", freq: "daily" }],
      proposed_ASA: "III",
      proposed_anesthesia_plan: "GA with ETT, consider PONV prophylaxis",
    });
  };

  const handleAcceptField = (field: string) => {
    console.log("Accepting field:", field);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pre-operative Assessment</h2>
        <Button
          variant="outline"
          onClick={() => setShowAiAssist(!showAiAssist)}
          className="gap-2"
          data-testid="button-toggle-ai-assist"
        >
          <FileText className="h-4 w-4" />
          {showAiAssist ? "Hide" : "Show"} AI Assist
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Demographics & ASA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="age">Age (years)</Label>
                  <Input id="age" type="number" defaultValue={mockPreopData.demographics.age_years} data-testid="input-age" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select defaultValue={mockPreopData.demographics.sex}>
                    <SelectTrigger data-testid="select-sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Male</SelectItem>
                      <SelectItem value="F">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asa">ASA Classification</Label>
                <Select defaultValue={mockPreopData.asaClass}>
                  <SelectTrigger data-testid="select-asa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I - Healthy</SelectItem>
                    <SelectItem value="II">II - Mild systemic disease</SelectItem>
                    <SelectItem value="III">III - Severe systemic disease</SelectItem>
                    <SelectItem value="IV">IV - Life-threatening disease</SelectItem>
                    <SelectItem value="V">V - Moribund</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Allergies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockPreopData.allergies.map((allergy, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <div>
                    <p className="font-medium">{allergy.substance}</p>
                    <p className="text-sm text-muted-foreground">
                      {allergy.reaction} - {allergy.severity}
                    </p>
                  </div>
                  <Badge variant="destructive">Allergy</Badge>
                </div>
              ))}
              <Button variant="outline" className="w-full" data-testid="button-add-allergy">
                Add Allergy
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Medications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {mockPreopData.medications.map((med, idx) => (
                <div key={idx} className="p-3 bg-muted rounded-md">
                  <p className="font-medium">{med.drug}</p>
                  <p className="text-sm text-muted-foreground">
                    {med.dose} {med.route} {med.freq}
                  </p>
                </div>
              ))}
              <Button variant="outline" className="w-full" data-testid="button-add-medication">
                Add Medication
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comorbidities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {mockPreopData.comorbidities.map((comorb, idx) => (
                  <Badge key={idx} variant="secondary">
                    {comorb}
                  </Badge>
                ))}
              </div>
              <Button variant="outline" className="w-full" data-testid="button-add-comorbidity">
                Add Comorbidity
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {showAiAssist && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  AI-Assisted Extraction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Upload Pre-op Document</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileUpload}
                      data-testid="input-upload-document"
                    />
                  </div>
                  {uploadedFile && (
                    <p className="text-sm text-muted-foreground">
                      Uploaded: {uploadedFile.name}
                    </p>
                  )}
                </div>

                {extractedText && (
                  <>
                    <div className="space-y-2">
                      <Label>Redaction Preview</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-xs font-medium mb-2">Original</p>
                          <pre className="text-xs whitespace-pre-wrap">{extractedText}</pre>
                        </div>
                        <div className="p-3 bg-muted rounded-md">
                          <p className="text-xs font-medium mb-2">Redacted</p>
                          <pre className="text-xs whitespace-pre-wrap">{redactedText}</pre>
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleExtract} className="w-full" data-testid="button-extract">
                      Extract & Propose
                    </Button>
                  </>
                )}

                {proposedData && (
                  <div className="space-y-3 pt-3 border-t">
                    <p className="font-medium">Proposed Fields</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded">
                        <span className="text-sm">ASA: {proposedData.proposed_ASA}</span>
                        <Button size="sm" variant="ghost" onClick={() => handleAcceptField('asa')} data-testid="button-accept-asa">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded">
                        <p className="text-sm font-medium">Proposed Plan:</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {proposedData.proposed_anesthesia_plan}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => handleAcceptField('plan')} className="mt-2" data-testid="button-accept-plan">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Airway Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mallampati">Mallampati Class</Label>
                <Select defaultValue={mockPreopData.airway.mallampati}>
                  <SelectTrigger data-testid="select-mallampati">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I</SelectItem>
                    <SelectItem value="II">II</SelectItem>
                    <SelectItem value="III">III</SelectItem>
                    <SelectItem value="IV">IV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mouth">Mouth Opening</Label>
                <Input id="mouth" defaultValue={mockPreopData.airway.mouth_opening} data-testid="input-mouth-opening" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dentition">Dentition</Label>
                <Input id="dentition" defaultValue={mockPreopData.airway.dentition} data-testid="input-dentition" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fasting Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="last-solids">Last Solids</Label>
                <Input
                  id="last-solids"
                  type="datetime-local"
                  defaultValue={new Date(mockPreopData.fasting.last_solids).toISOString().slice(0, 16)}
                  data-testid="input-last-solids"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-clear">Last Clear Fluids</Label>
                <Input
                  id="last-clear"
                  type="datetime-local"
                  defaultValue={new Date(mockPreopData.fasting.last_clear).toISOString().slice(0, 16)}
                  data-testid="input-last-clear"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anesthesia Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planned">Planned Anesthesia</Label>
                <Input id="planned" defaultValue={mockPreopData.plannedAnesthesia} data-testid="input-planned-anesthesia" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" defaultValue={mockPreopData.notes} rows={4} data-testid="textarea-notes" />
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" data-testid="button-save-preop">
            Save Pre-op Record
          </Button>
        </div>
      </div>
    </div>
  );
}
