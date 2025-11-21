import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Download, Printer } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

// MOCKUP VERSION - For UI review only, not connected to backend

interface MockupSectionProps {
  anesthesiaRecordId?: string;
}

// ============================================================================
// INSTALLATIONS SECTION
// ============================================================================
export function InstallationsSectionMockup({ anesthesiaRecordId }: MockupSectionProps) {
  const [pvEntries, setPvEntries] = useState([{ id: 1 }]);
  const [hasArterial, setHasArterial] = useState(false);
  const [hasCVC, setHasCVC] = useState(false);
  const [hasBladderCath, setHasBladderCath] = useState(false);

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Peripheral Venous Access */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Peripheral Venous Access</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPvEntries([...pvEntries, { id: pvEntries.length + 1 }])}
            data-testid="button-add-pv-access"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>

        {pvEntries.map((entry, index) => (
          <div key={entry.id} className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Entry #{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPvEntries(pvEntries.filter((_, i) => i !== index))}
                data-testid={`button-remove-pv-${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid={`select-pv-location-${index + 1}`}>
                  <option value="">Select location</option>
                  <option value="right-hand">Right Hand (Dorsum)</option>
                  <option value="left-hand">Left Hand (Dorsum)</option>
                  <option value="right-forearm">Right Forearm</option>
                  <option value="left-forearm">Left Forearm</option>
                  <option value="right-ac-fossa">Right Antecubital Fossa</option>
                  <option value="left-ac-fossa">Left Antecubital Fossa</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gauge</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid={`select-pv-gauge-${index + 1}`}>
                  <option value="">Select gauge</option>
                  <option value="14G">14G (Orange)</option>
                  <option value="16G">16G (Gray)</option>
                  <option value="18G">18G (Green)</option>
                  <option value="20G">20G (Pink)</option>
                  <option value="22G">22G (Blue)</option>
                  <option value="24G">24G (Yellow)</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input type="number" defaultValue={1} data-testid={`input-pv-attempts-${index + 1}`} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." data-testid={`textarea-pv-notes-${index + 1}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Arterial Line */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Arterial Line</Label>
          {!hasArterial && (
            <Button variant="outline" size="sm" onClick={() => setHasArterial(true)} data-testid="button-add-arterial">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {hasArterial ? (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Arterial Line</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setHasArterial(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-location">
                  <option value="">Select location</option>
                  <option value="radial-left">Radial - Left</option>
                  <option value="radial-right">Radial - Right</option>
                  <option value="femoral-left">Femoral - Left</option>
                  <option value="femoral-right">Femoral - Right</option>
                  <option value="brachial">Brachial</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Gauge</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-gauge">
                  <option value="">Select gauge</option>
                  <option value="18G">18G</option>
                  <option value="20G">20G</option>
                  <option value="22G">22G</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Number of Attempts</Label>
                <Input type="number" defaultValue={1} data-testid="input-arterial-attempts" />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-technique">
                  <option value="">Select technique</option>
                  <option value="direct">Direct (Seldinger)</option>
                  <option value="transfixion">Transfixion</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-arterial-notes" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No arterial line documented. Click "Add" to document arterial line placement.
          </p>
        )}
      </div>

      {/* Central Venous Catheter */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Central Venous Catheter</Label>
          {!hasCVC && (
            <Button variant="outline" size="sm" onClick={() => setHasCVC(true)} data-testid="button-add-cvc">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {hasCVC ? (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Central Venous Catheter</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setHasCVC(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-location">
                  <option value="">Select location</option>
                  <option value="right-ijv">Right Internal Jugular</option>
                  <option value="left-ijv">Left Internal Jugular</option>
                  <option value="right-subclavian">Right Subclavian</option>
                  <option value="left-subclavian">Left Subclavian</option>
                  <option value="femoral">Femoral</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Lumens</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-lumens">
                  <option value="">Select lumens</option>
                  <option value="1">Single</option>
                  <option value="2">Double</option>
                  <option value="3">Triple</option>
                  <option value="4">Quad</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Depth (cm)</Label>
                <Input type="number" placeholder="16" data-testid="input-cvc-depth" />
              </div>
              <div className="space-y-2">
                <Label>Technique</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-technique">
                  <option value="">Select technique</option>
                  <option value="landmark">Landmark</option>
                  <option value="ultrasound">Ultrasound-guided</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-cvc-notes" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No CVC documented. Click "Add" to document central venous catheter placement.
          </p>
        )}
      </div>

      {/* Bladder Catheter - NEW */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Bladder Catheter</Label>
          {!hasBladderCath && (
            <Button variant="outline" size="sm" onClick={() => setHasBladderCath(true)} data-testid="button-add-bladder">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>

        {hasBladderCath ? (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Bladder Catheter</span>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setHasBladderCath(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-bladder-type">
                  <option value="">Select type</option>
                  <option value="foley">Foley (Transurethral)</option>
                  <option value="suprapubic">Suprapubic</option>
                  <option value="three-way">Three-way Foley</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Size (French/Charrière)</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-bladder-size">
                  <option value="">Select size</option>
                  <option value="12">12 Fr</option>
                  <option value="14">14 Fr</option>
                  <option value="16">16 Fr</option>
                  <option value="18">18 Fr</option>
                  <option value="20">20 Fr</option>
                  <option value="22">22 Fr</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-bladder-notes" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No bladder catheter documented. Click "Add" to document bladder catheter placement.
          </p>
        )}
      </div>
    </CardContent>
  );
}

// ============================================================================
// GENERAL ANESTHESIA SECTION
// ============================================================================
export function GeneralAnesthesiaSectionMockup({ anesthesiaRecordId }: MockupSectionProps) {
  const [isDifficultAirway, setIsDifficultAirway] = useState(false);
  const [maintenanceType, setMaintenanceType] = useState<string>("");
  const [isRSI, setIsRSI] = useState(false);

  return (
    <CardContent className="space-y-6 pt-0">
      {/* Maintenance Type Options */}
      <div className="space-y-3">
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input 
              type="radio" 
              name="maintenance-type" 
              value="tiva" 
              checked={maintenanceType === "tiva"}
              onChange={(e) => setMaintenanceType(e.target.value)}
              className="h-4 w-4"
              data-testid="radio-maintenance-tiva"
            />
            <span className="font-medium">TIVA</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input 
              type="radio" 
              name="maintenance-type" 
              value="tci" 
              checked={maintenanceType === "tci"}
              onChange={(e) => setMaintenanceType(e.target.value)}
              className="h-4 w-4"
              data-testid="radio-maintenance-tci"
            />
            <span className="font-medium">TCI (Target Controlled Infusion)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
            <input 
              type="radio" 
              name="maintenance-type" 
              value="balanced-gas" 
              checked={maintenanceType === "balanced-gas"}
              onChange={(e) => setMaintenanceType(e.target.value)}
              className="h-4 w-4"
              data-testid="radio-maintenance-balanced-gas"
            />
            <span className="font-medium">Balanced/Gas</span>
          </label>
        </div>
        <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
          <input 
            type="checkbox" 
            checked={isRSI}
            onChange={(e) => setIsRSI(e.target.checked)}
            className="h-4 w-4"
            data-testid="checkbox-rsi"
          />
          <span className="font-medium">RSI (Rapid Sequence Intubation)</span>
        </label>
      </div>

      {/* Airway Management */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Airway Management</Label>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Device</Label>
              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-airway-device">
                <option value="">Select device</option>
                <option value="ett">Endotracheal Tube</option>
                <option value="lma">Laryngeal Mask Airway</option>
                <option value="facemask">Face Mask</option>
                <option value="tracheostomy">Tracheostomy</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Input type="text" placeholder="e.g., 7.5" data-testid="input-airway-size" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Depth (cm at teeth)</Label>
              <Input type="number" placeholder="22" data-testid="input-airway-depth" />
            </div>
            <div className="space-y-2">
              <Label>Cuff Pressure (cmH₂O)</Label>
              <Input type="number" placeholder="20" data-testid="input-airway-cuff" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-airway-notes" />
          </div>
        </div>
      </div>

      {/* Intubation Technique */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Intubation Technique</Label>
        <div className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Laryngoscopy Method</Label>
              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-laryngoscopy-method">
                <option value="">Select method</option>
                <option value="direct">Direct Laryngoscopy</option>
                <option value="video">Video Laryngoscopy</option>
                <option value="fiberoptic">Fiberoptic</option>
                <option value="awake">Awake Intubation</option>
                <option value="blind">Blind Nasal</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Cormack-Lehane Grade</Label>
              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cormack-grade">
                <option value="">Select grade</option>
                <option value="1">Grade I - Full view of glottis</option>
                <option value="2">Grade II - Partial view</option>
                <option value="3">Grade III - Only epiglottis visible</option>
                <option value="4">Grade IV - No glottic structures</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Number of Attempts</Label>
              <Input type="number" defaultValue={1} data-testid="input-intubation-attempts" />
            </div>
            <div className="space-y-2">
              <Label>Difficulty</Label>
              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-intubation-difficulty">
                <option value="">Select difficulty</option>
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="difficult">Difficult</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Confirmation Method</Label>
              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-confirmation-method">
                <option value="">Select method</option>
                <option value="capnography">Capnography</option>
                <option value="auscultation">Auscultation</option>
                <option value="both">Both</option>
                <option value="visualization">Direct Visualization</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-intubation-notes" />
          </div>
        </div>
      </div>

      {/* Difficult Airway Documentation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Difficult Airway Documentation</Label>
          <Button
            variant={isDifficultAirway ? "default" : "outline"}
            size="sm"
            onClick={() => setIsDifficultAirway(!isDifficultAirway)}
            data-testid="button-toggle-difficult-airway"
          >
            {isDifficultAirway ? "Active" : "Mark as Difficult Airway"}
          </Button>
        </div>

        {isDifficultAirway && (
          <Card className="border-2 border-orange-500 bg-orange-50/30 dark:bg-orange-950/20">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="bg-orange-600">Difficult Airway</Badge>
                  <span className="text-sm font-medium">Schwierige Atemwege Dokumentation</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" data-testid="button-print-airway-card">
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" data-testid="button-download-airway-card">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mallampati Score</Label>
                  <select className="w-full border rounded-md p-2 bg-background" data-testid="select-mallampati">
                    <option value="">Select score</option>
                    <option value="1">Class I - Full visibility</option>
                    <option value="2">Class II - Partial soft palate</option>
                    <option value="3">Class III - Only base of uvula</option>
                    <option value="4">Class IV - Hard palate only</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Thyromental Distance</Label>
                  <Input type="text" placeholder="e.g., < 6cm" data-testid="input-thyromental" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mouth Opening</Label>
                  <Input type="text" placeholder="e.g., < 3cm" data-testid="input-mouth-opening" />
                </div>
                <div className="space-y-2">
                  <Label>Neck Mobility</Label>
                  <select className="w-full border rounded-md p-2 bg-background" data-testid="select-neck-mobility">
                    <option value="">Select mobility</option>
                    <option value="normal">Normal</option>
                    <option value="reduced">Reduced</option>
                    <option value="severely-reduced">Severely Reduced</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Difficulty Type</Label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" data-testid="checkbox-difficult-mask" />
                    <span className="text-sm">Difficult Mask Ventilation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" data-testid="checkbox-difficult-intubation" />
                    <span className="text-sm">Difficult Intubation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" data-testid="checkbox-difficult-lma" />
                    <span className="text-sm">Difficult LMA Placement</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Successful Technique Used</Label>
                <Textarea rows={3} placeholder="Describe the successful airway management technique that worked..." data-testid="textarea-successful-technique" />
              </div>

              <div className="space-y-2">
                <Label>Recommendations for Future Anesthesia</Label>
                <Textarea rows={3} placeholder="Important recommendations for future anesthesiologists..." data-testid="textarea-recommendations" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </CardContent>
  );
}

// ============================================================================
// SEDATION SECTION
// ============================================================================
export function SedationSectionMockup({ anesthesiaRecordId }: MockupSectionProps) {
  return (
    <CardContent className="space-y-4 pt-0">
      <div className="space-y-2">
        <Label>Sedation Level</Label>
        <select className="w-full border rounded-md p-2 bg-background" data-testid="select-sedation-level">
          <option value="">Select level</option>
          <option value="minimal">Minimal (Anxiolysis)</option>
          <option value="moderate">Moderate (Conscious Sedation)</option>
          <option value="deep">Deep Sedation</option>
        </select>
      </div>
      
      <div className="space-y-2">
        <Label>Monitoring</Label>
        <Textarea
          rows={2}
          placeholder="e.g., Continuous pulse oximetry, capnography, ECG"
          data-testid="textarea-sedation-monitoring"
        />
      </div>

      <div className="space-y-2">
        <Label>Airway Support</Label>
        <select className="w-full border rounded-md p-2 bg-background" data-testid="select-airway-support">
          <option value="">Select support</option>
          <option value="none">None Required</option>
          <option value="nasal-cannula">Nasal Cannula</option>
          <option value="face-mask">Face Mask</option>
          <option value="jaw-thrust">Jaw Thrust/Chin Lift</option>
          <option value="oral-airway">Oral Airway</option>
          <option value="nasal-airway">Nasal Airway</option>
        </select>
      </div>
      
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          rows={3}
          placeholder="Additional notes..."
          data-testid="textarea-sedation-notes"
        />
      </div>

      <div className="flex justify-end pt-4">
        <Button data-testid="button-save-sedation">Save Details</Button>
      </div>
    </CardContent>
  );
}

// ============================================================================
// CENTRAL REGIONAL ANESTHESIA SECTION
// ============================================================================
export function CentralRegionalSectionMockup({ anesthesiaRecordId }: MockupSectionProps) {
  return (
    <CardContent className="space-y-6 pt-0">
      <Accordion type="multiple" className="space-y-4">
        {/* Spinal Anesthesia */}
        <AccordionItem value="spinal">
          <Card>
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid="accordion-spinal">
              <span className="text-base font-semibold">Spinal Anesthesia</span>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Level (Interspace)</Label>
                    <Input placeholder="e.g., L3-L4" data-testid="input-spinal-level" />
                  </div>
                  <div className="space-y-2">
                    <Label>Approach</Label>
                    <select className="w-full border rounded-md p-2 bg-background" data-testid="select-spinal-approach">
                      <option value="">Select approach</option>
                      <option value="midline">Midline</option>
                      <option value="paramedian">Paramedian</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Needle Gauge</Label>
                    <Input placeholder="e.g., 25G" data-testid="input-spinal-gauge" />
                  </div>
                  <div className="space-y-2">
                    <Label>Test Dose</Label>
                    <Input placeholder="e.g., Lidocaine 3ml" data-testid="input-spinal-test-dose" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Number of Attempts</Label>
                    <Input type="number" defaultValue={1} data-testid="input-spinal-attempts" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sensory Level Achieved</Label>
                    <Input placeholder="e.g., T4" data-testid="input-spinal-sensory" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} placeholder="Additional notes..." data-testid="textarea-spinal-notes" />
                </div>
                <div className="flex justify-end pt-4">
                  <Button data-testid="button-save-spinal">Save Details</Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Epidural Anesthesia */}
        <AccordionItem value="epidural">
          <Card>
            <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid="accordion-epidural">
              <span className="text-base font-semibold">Epidural Anesthesia</span>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Level (Interspace)</Label>
                    <Input placeholder="e.g., L2-L3" data-testid="input-epidural-level" />
                  </div>
                  <div className="space-y-2">
                    <Label>Approach</Label>
                    <select className="w-full border rounded-md p-2 bg-background" data-testid="select-epidural-approach">
                      <option value="">Select approach</option>
                      <option value="midline">Midline</option>
                      <option value="paramedian">Paramedian</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Needle Gauge</Label>
                    <Input placeholder="e.g., 18G Tuohy" data-testid="input-epidural-gauge" />
                  </div>
                  <div className="space-y-2">
                    <Label>Catheter Depth (cm)</Label>
                    <Input placeholder="e.g., 10cm at skin" data-testid="input-epidural-depth" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Test Dose</Label>
                  <Input placeholder="e.g., Lidocaine 3ml with epinephrine" data-testid="input-epidural-test-dose" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Number of Attempts</Label>
                    <Input type="number" defaultValue={1} data-testid="input-epidural-attempts" />
                  </div>
                  <div className="space-y-2">
                    <Label>Sensory Level Achieved</Label>
                    <Input placeholder="e.g., T8" data-testid="input-epidural-sensory" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea rows={3} placeholder="Additional notes..." data-testid="textarea-epidural-notes" />
                </div>
                <div className="flex justify-end pt-4">
                  <Button data-testid="button-save-epidural">Save Details</Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>
    </CardContent>
  );
}

// ============================================================================
// PERIPHERAL REGIONAL ANESTHESIA SECTION
// ============================================================================
export function PeripheralRegionalSectionMockup({ anesthesiaRecordId }: MockupSectionProps) {
  const [blocks, setBlocks] = useState([{ id: 1 }]);

  return (
    <CardContent className="space-y-4 pt-0">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Peripheral Nerve Blocks</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setBlocks([...blocks, { id: blocks.length + 1 }])}
          data-testid="button-add-peripheral-block"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Block
        </Button>
      </div>

      {blocks.map((block, index) => (
        <Card key={block.id} className="border-2">
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Block #{index + 1}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setBlocks(blocks.filter((_, i) => i !== index))}
                data-testid={`button-remove-block-${index + 1}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Block Type</Label>
                <Input placeholder="e.g., Interscalene, Femoral, Popliteal" data-testid={`input-block-type-${index + 1}`} />
              </div>
              <div className="space-y-2">
                <Label>Laterality</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid={`select-laterality-${index + 1}`}>
                  <option value="">Select side</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="bilateral">Bilateral</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Guidance Technique</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid={`select-guidance-${index + 1}`}>
                  <option value="">Select guidance</option>
                  <option value="ultrasound">Ultrasound</option>
                  <option value="nerve-stimulator">Nerve Stimulator</option>
                  <option value="both">Both</option>
                  <option value="landmark">Landmark</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Needle Type</Label>
                <Input placeholder="e.g., 22G 50mm stimulating needle" data-testid={`input-needle-type-${index + 1}`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catheter Placed</Label>
                <select className="w-full border rounded-md p-2 bg-background" data-testid={`select-catheter-${index + 1}`}>
                  <option value="">Select option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Number of Attempts</Label>
                <Input type="number" defaultValue={1} data-testid={`input-attempts-${index + 1}`} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sensory Block Assessment</Label>
              <Textarea rows={2} placeholder="e.g., Complete sensory blockade C5-T1" data-testid={`textarea-sensory-${index + 1}`} />
            </div>

            <div className="space-y-2">
              <Label>Motor Block Assessment</Label>
              <Textarea rows={2} placeholder="e.g., Modified Bromage scale 2" data-testid={`textarea-motor-${index + 1}`} />
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} placeholder="Additional notes..." data-testid={`textarea-notes-${index + 1}`} />
            </div>

            <div className="flex justify-end">
              <Button size="sm" data-testid={`button-save-block-${index + 1}`}>Save Block</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {blocks.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No peripheral nerve blocks documented. Click "Add Block" to document a block.
        </p>
      )}
    </CardContent>
  );
}
