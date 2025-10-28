import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { X, AlertCircle, Download } from "lucide-react";
import { VerticalBookmarkNav } from "@/components/anesthesia/VerticalBookmarkNav";

// Mock patients data (shared with Op.tsx)
const mockPatients = [
  {
    id: "1",
    patientId: "P-2024-001",
    surname: "Rossi",
    firstName: "Maria",
    birthday: "1968-05-12",
    sex: "F",
    height: "165",
    weight: "68",
    allergies: ["Latex", "Penicillin"],
    cave: "NSAIDs contraindicated",
  },
  {
    id: "2",
    patientId: "P-2024-002",
    surname: "Bianchi",
    firstName: "Giovanni",
    birthday: "1957-11-03",
    sex: "M",
    height: "180",
    weight: "130",
    allergies: ["None"],
    cave: "",
  },
];

const mockCases = [
  {
    id: "case-1",
    patientId: "1",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Romano",
    plannedDate: "2024-01-15",
    status: "in-progress",
  },
  {
    id: "case-2",
    patientId: "2",
    plannedSurgery: "Total Hip Replacement",
    surgeon: "Dr. Smith",
    plannedDate: "2024-01-20",
    status: "scheduled",
  },
];

export default function Preop() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);

  const caseId = params.id;
  const currentCase = mockCases.find(c => c.id === caseId);

  useEffect(() => {
    if (!currentCase) {
      setIsOpen(false);
      setTimeout(() => setLocation("/anesthesia/patients"), 100);
    }
  }, [currentCase, setLocation]);

  const currentPatient = currentCase ? mockPatients.find(p => p.id === currentCase.patientId) : null;

  const [preopData, setPreopData] = useState({
    // Pre-operative Assessment
    asa: "",
    npo: "",
    allergiesConfirmed: false,
    consentObtained: false,
    labsReviewed: false,
    imagingReviewed: false,
    
    // Medical History
    medicalHistory: "",
    currentMedications: "",
    previousAnesthesia: "",
    
    // Physical Exam
    cardiovascular: "",
    respiratory: "",
    airwayAssessment: "",
    
    // Anesthesia Plan
    plannedTechnique: "",
    anticipatedChallenges: "",
    specialConsiderations: "",
    
    // Notes
    notes: "",
  });

  if (!currentCase || !currentPatient) {
    return null;
  }

  const patientAge = new Date().getFullYear() - parseInt(currentPatient.birthday.split('-')[0]);
  const patientName = `${currentPatient.surname}, ${currentPatient.firstName}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setTimeout(() => setLocation("/anesthesia/patients"), 100);
      }
    }}>
      <DialogContent className="max-w-full max-h-full w-screen h-screen m-0 p-0 flex flex-col" data-testid="preop-dialog">
        {/* Vertical Bookmark Navigation */}
        <VerticalBookmarkNav caseId={caseId!} patientName={patientName} />

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 shrink-0 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="bg-white/20 rounded-full p-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-1">
                  {patientName}
                  <span className="text-sm font-normal bg-white/20 px-3 py-1 rounded-full">
                    {patientAge} y • {currentPatient.sex === 'M' ? 'Male' : 'Female'}
                  </span>
                </h2>
                <div className="text-blue-100">
                  {currentPatient.birthday} ({currentPatient.patientId})
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-white/20 text-white"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-preop"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <span className="font-semibold">PROCEDURE</span>
              <p className="text-blue-100">{currentCase.plannedSurgery}</p>
            </div>
            <div>
              <span className="font-semibold">SURGEON</span>
              <p className="text-blue-100">{currentCase.surgeon}</p>
            </div>
            <div>
              <span className="font-semibold">DATE</span>
              <p className="text-blue-100">{currentCase.plannedDate}</p>
            </div>
          </div>

          {currentPatient.allergies.length > 0 && currentPatient.allergies[0] !== "None" && (
            <div className="mt-4 p-3 bg-yellow-500/20 border border-yellow-400/30 rounded-lg flex gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-yellow-200" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-yellow-100">ALLERGIES</span>
                    <p className="text-yellow-200 font-medium">{currentPatient.allergies.join(", ")}</p>
                  </div>
                  {currentPatient.cave && (
                    <div className="ml-6">
                      <span className="font-semibold text-yellow-100">CAVE</span>
                      <p className="text-yellow-200 font-medium">{currentPatient.cave}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pre-operative Assessment Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Pre-operative Checklist */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Pre-operative Checklist</CardTitle>
                <Button variant="outline" size="sm" data-testid="button-download-preop-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="allergies-confirmed"
                      checked={preopData.allergiesConfirmed}
                      onCheckedChange={(checked) => setPreopData({...preopData, allergiesConfirmed: checked as boolean})}
                      data-testid="checkbox-allergies-confirmed"
                    />
                    <Label htmlFor="allergies-confirmed" className="cursor-pointer">Allergies Confirmed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="consent-obtained"
                      checked={preopData.consentObtained}
                      onCheckedChange={(checked) => setPreopData({...preopData, consentObtained: checked as boolean})}
                      data-testid="checkbox-consent-obtained"
                    />
                    <Label htmlFor="consent-obtained" className="cursor-pointer">Informed Consent Obtained</Label>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="labs-reviewed"
                      checked={preopData.labsReviewed}
                      onCheckedChange={(checked) => setPreopData({...preopData, labsReviewed: checked as boolean})}
                      data-testid="checkbox-labs-reviewed"
                    />
                    <Label htmlFor="labs-reviewed" className="cursor-pointer">Labs Reviewed</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="imaging-reviewed"
                      checked={preopData.imagingReviewed}
                      onCheckedChange={(checked) => setPreopData({...preopData, imagingReviewed: checked as boolean})}
                      data-testid="checkbox-imaging-reviewed"
                    />
                    <Label htmlFor="imaging-reviewed" className="cursor-pointer">Imaging Reviewed</Label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ASA Classification</Label>
                  <Input 
                    value={preopData.asa}
                    onChange={(e) => setPreopData({...preopData, asa: e.target.value})}
                    placeholder="e.g., ASA II"
                    data-testid="input-asa"
                  />
                </div>
                <div className="space-y-2">
                  <Label>NPO Status</Label>
                  <Input 
                    value={preopData.npo}
                    onChange={(e) => setPreopData({...preopData, npo: e.target.value})}
                    placeholder="e.g., NPO since midnight"
                    data-testid="input-npo"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Medical History */}
          <Card>
            <CardHeader>
              <CardTitle>Medical History & Medications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Medical History</Label>
                <Textarea 
                  value={preopData.medicalHistory}
                  onChange={(e) => setPreopData({...preopData, medicalHistory: e.target.value})}
                  placeholder="Document relevant medical history..."
                  rows={3}
                  data-testid="textarea-medical-history"
                />
              </div>
              <div className="space-y-2">
                <Label>Current Medications</Label>
                <Textarea 
                  value={preopData.currentMedications}
                  onChange={(e) => setPreopData({...preopData, currentMedications: e.target.value})}
                  placeholder="List current medications..."
                  rows={3}
                  data-testid="textarea-current-medications"
                />
              </div>
              <div className="space-y-2">
                <Label>Previous Anesthesia Experience</Label>
                <Textarea 
                  value={preopData.previousAnesthesia}
                  onChange={(e) => setPreopData({...preopData, previousAnesthesia: e.target.value})}
                  placeholder="Document previous anesthesia experiences and complications..."
                  rows={2}
                  data-testid="textarea-previous-anesthesia"
                />
              </div>
            </CardContent>
          </Card>

          {/* Physical Examination */}
          <Card>
            <CardHeader>
              <CardTitle>Pre-operative Physical Examination</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Cardiovascular</Label>
                <Textarea 
                  value={preopData.cardiovascular}
                  onChange={(e) => setPreopData({...preopData, cardiovascular: e.target.value})}
                  placeholder="Document cardiovascular examination findings..."
                  rows={2}
                  data-testid="textarea-cardiovascular"
                />
              </div>
              <div className="space-y-2">
                <Label>Respiratory</Label>
                <Textarea 
                  value={preopData.respiratory}
                  onChange={(e) => setPreopData({...preopData, respiratory: e.target.value})}
                  placeholder="Document respiratory examination findings..."
                  rows={2}
                  data-testid="textarea-respiratory"
                />
              </div>
              <div className="space-y-2">
                <Label>Airway Assessment</Label>
                <Textarea 
                  value={preopData.airwayAssessment}
                  onChange={(e) => setPreopData({...preopData, airwayAssessment: e.target.value})}
                  placeholder="Mallampati score, thyromental distance, mouth opening, neck mobility..."
                  rows={2}
                  data-testid="textarea-airway-assessment"
                />
              </div>
            </CardContent>
          </Card>

          {/* Anesthesia Plan */}
          <Card>
            <CardHeader>
              <CardTitle>Anesthesia Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Planned Anesthesia Technique</Label>
                <Textarea 
                  value={preopData.plannedTechnique}
                  onChange={(e) => setPreopData({...preopData, plannedTechnique: e.target.value})}
                  placeholder="e.g., General anesthesia with endotracheal intubation..."
                  rows={2}
                  data-testid="textarea-planned-technique"
                />
              </div>
              <div className="space-y-2">
                <Label>Anticipated Challenges</Label>
                <Textarea 
                  value={preopData.anticipatedChallenges}
                  onChange={(e) => setPreopData({...preopData, anticipatedChallenges: e.target.value})}
                  placeholder="Document any anticipated challenges or risk factors..."
                  rows={2}
                  data-testid="textarea-anticipated-challenges"
                />
              </div>
              <div className="space-y-2">
                <Label>Special Considerations</Label>
                <Textarea 
                  value={preopData.specialConsiderations}
                  onChange={(e) => setPreopData({...preopData, specialConsiderations: e.target.value})}
                  placeholder="Equipment needs, special positioning, blood products, etc..."
                  rows={2}
                  data-testid="textarea-special-considerations"
                />
              </div>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={preopData.notes}
                onChange={(e) => setPreopData({...preopData, notes: e.target.value})}
                placeholder="Additional pre-operative notes..."
                rows={4}
                data-testid="textarea-preop-notes"
              />
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
