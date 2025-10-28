import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, AlertCircle, Download, Bed } from "lucide-react";
import { VerticalBookmarkNav } from "@/components/anesthesia/VerticalBookmarkNav";

// Mock patients data (shared with Op.tsx and Preop.tsx)
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

export default function PacuDetail() {
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

  const [pacuData, setPacuData] = useState({
    // Admission
    admissionTime: "",
    aldretteScore: "",
    
    // Vitals
    arrivalBP: "",
    arrivalHR: "",
    arrivalRR: "",
    arrivalSPO2: "",
    arrivalTemp: "",
    
    // Assessments
    consciousnessLevel: "",
    painScore: "",
    nauseaVomiting: "",
    
    // Pain Management
    painManagement: "",
    
    // Fluids & Output
    ivFluids: "",
    urineOutput: "",
    drainOutput: "",
    
    // Complications
    complications: "",
    
    // Discharge Criteria
    readyForDischarge: false,
    dischargeDestination: "",
    dischargeTime: "",
    
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
      <DialogContent className="max-w-full max-h-full w-screen h-screen m-0 p-0 flex flex-col" data-testid="pacu-dialog">
        {/* Vertical Bookmark Navigation */}
        <VerticalBookmarkNav caseId={caseId!} patientName={patientName} />

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-6 py-4 shrink-0 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="bg-white/20 rounded-full p-3">
                <Bed className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold flex items-center gap-3 mb-1">
                  {patientName}
                  <span className="text-sm font-normal bg-white/20 px-3 py-1 rounded-full">
                    {patientAge} y • {currentPatient.sex === 'M' ? 'Male' : 'Female'}
                  </span>
                </h2>
                <div className="text-orange-100">
                  {currentPatient.birthday} ({currentPatient.patientId})
                </div>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-white/20 text-white"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-pacu"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-4 text-sm">
            <div>
              <span className="font-semibold">PROCEDURE</span>
              <p className="text-orange-100">{currentCase.plannedSurgery}</p>
            </div>
            <div>
              <span className="font-semibold">SURGEON</span>
              <p className="text-orange-100">{currentCase.surgeon}</p>
            </div>
            <div>
              <span className="font-semibold">DATE</span>
              <p className="text-orange-100">{currentCase.plannedDate}</p>
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

        {/* PACU Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Admission & Initial Assessment */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>PACU Admission & Initial Assessment</CardTitle>
                <Button variant="outline" size="sm" data-testid="button-download-pacu-pdf">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Admission Time</Label>
                  <Input 
                    type="time"
                    value={pacuData.admissionTime}
                    onChange={(e) => setPacuData({...pacuData, admissionTime: e.target.value})}
                    data-testid="input-admission-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Aldrete Score</Label>
                  <Input 
                    value={pacuData.aldretteScore}
                    onChange={(e) => setPacuData({...pacuData, aldretteScore: e.target.value})}
                    placeholder="e.g., 9/10"
                    data-testid="input-aldrete-score"
                  />
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold mb-3">Arrival Vitals</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label>BP (mmHg)</Label>
                    <Input 
                      value={pacuData.arrivalBP}
                      onChange={(e) => setPacuData({...pacuData, arrivalBP: e.target.value})}
                      placeholder="e.g., 120/80"
                      data-testid="input-arrival-bp"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>HR (bpm)</Label>
                    <Input 
                      value={pacuData.arrivalHR}
                      onChange={(e) => setPacuData({...pacuData, arrivalHR: e.target.value})}
                      placeholder="e.g., 72"
                      data-testid="input-arrival-hr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>RR (/min)</Label>
                    <Input 
                      value={pacuData.arrivalRR}
                      onChange={(e) => setPacuData({...pacuData, arrivalRR: e.target.value})}
                      placeholder="e.g., 16"
                      data-testid="input-arrival-rr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>SpO2 (%)</Label>
                    <Input 
                      value={pacuData.arrivalSPO2}
                      onChange={(e) => setPacuData({...pacuData, arrivalSPO2: e.target.value})}
                      placeholder="e.g., 98"
                      data-testid="input-arrival-spo2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Temp (°C)</Label>
                    <Input 
                      value={pacuData.arrivalTemp}
                      onChange={(e) => setPacuData({...pacuData, arrivalTemp: e.target.value})}
                      placeholder="e.g., 36.5"
                      data-testid="input-arrival-temp"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clinical Assessment */}
          <Card>
            <CardHeader>
              <CardTitle>Clinical Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Consciousness Level</Label>
                <Input 
                  value={pacuData.consciousnessLevel}
                  onChange={(e) => setPacuData({...pacuData, consciousnessLevel: e.target.value})}
                  placeholder="e.g., Alert and oriented, Drowsy but arousable"
                  data-testid="input-consciousness-level"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pain Score (0-10)</Label>
                  <Input 
                    value={pacuData.painScore}
                    onChange={(e) => setPacuData({...pacuData, painScore: e.target.value})}
                    placeholder="e.g., 3/10"
                    data-testid="input-pain-score"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nausea/Vomiting</Label>
                  <Input 
                    value={pacuData.nauseaVomiting}
                    onChange={(e) => setPacuData({...pacuData, nauseaVomiting: e.target.value})}
                    placeholder="e.g., None, Mild nausea"
                    data-testid="input-nausea-vomiting"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pain Management */}
          <Card>
            <CardHeader>
              <CardTitle>Pain Management</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={pacuData.painManagement}
                onChange={(e) => setPacuData({...pacuData, painManagement: e.target.value})}
                placeholder="Document pain medications given and patient response..."
                rows={3}
                data-testid="textarea-pain-management"
              />
            </CardContent>
          </Card>

          {/* Fluids & Output */}
          <Card>
            <CardHeader>
              <CardTitle>Fluids & Output</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>IV Fluids</Label>
                <Textarea 
                  value={pacuData.ivFluids}
                  onChange={(e) => setPacuData({...pacuData, ivFluids: e.target.value})}
                  placeholder="Document IV fluid administration..."
                  rows={2}
                  data-testid="textarea-iv-fluids"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Urine Output</Label>
                  <Input 
                    value={pacuData.urineOutput}
                    onChange={(e) => setPacuData({...pacuData, urineOutput: e.target.value})}
                    placeholder="e.g., 200 mL"
                    data-testid="input-urine-output"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Drain Output</Label>
                  <Input 
                    value={pacuData.drainOutput}
                    onChange={(e) => setPacuData({...pacuData, drainOutput: e.target.value})}
                    placeholder="e.g., Minimal sanguineous"
                    data-testid="input-drain-output"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Complications */}
          <Card>
            <CardHeader>
              <CardTitle>Complications</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={pacuData.complications}
                onChange={(e) => setPacuData({...pacuData, complications: e.target.value})}
                placeholder="Document any complications or concerns..."
                rows={3}
                data-testid="textarea-complications"
              />
            </CardContent>
          </Card>

          {/* Discharge Criteria */}
          <Card>
            <CardHeader>
              <CardTitle>Discharge from PACU</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discharge Destination</Label>
                  <Input 
                    value={pacuData.dischargeDestination}
                    onChange={(e) => setPacuData({...pacuData, dischargeDestination: e.target.value})}
                    placeholder="e.g., Ward, ICU, Home"
                    data-testid="input-discharge-destination"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Discharge Time</Label>
                  <Input 
                    type="time"
                    value={pacuData.dischargeTime}
                    onChange={(e) => setPacuData({...pacuData, dischargeTime: e.target.value})}
                    data-testid="input-discharge-time"
                  />
                </div>
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
                value={pacuData.notes}
                onChange={(e) => setPacuData({...pacuData, notes: e.target.value})}
                placeholder="Additional PACU notes..."
                rows={4}
                data-testid="textarea-pacu-notes"
              />
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
