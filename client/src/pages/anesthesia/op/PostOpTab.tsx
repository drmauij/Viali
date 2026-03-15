import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { apiRequest } from "@/lib/queryClient";

type MedicationTime = "Immediately" | "Contraindicated" | string;

interface PostOpData {
  postOpDestination?: string;
  postOpNotes?: string;
  complications?: string;
  paracetamolTime?: MedicationTime;
  nsarTime?: MedicationTime;
  novalginTime?: MedicationTime;
  ponvProphylaxis?: {
    ondansetron?: boolean;
    droperidol?: boolean;
    haloperidol?: boolean;
    dexamethasone?: boolean;
  };
  ambulatoryCare?: {
    repeatAntibioticAfter4h?: boolean;
    osasObservation?: boolean;
    escortRequired?: boolean;
    postBlockMotorCheck?: boolean;
    extendedObservation?: boolean;
    noOralAnticoagulants24h?: boolean;
    notes?: string;
  };
}

interface PostOpTabProps {
  anesthesiaRecordId: string | undefined;
  initialData: PostOpData | null | undefined;
  surgeryId: string;
  t: (key: string) => string;
}

export function PostOpTab({ anesthesiaRecordId, initialData, surgeryId, t }: PostOpTabProps) {
  const [postOpData, setPostOpData] = useState<PostOpData>({});

  // Sync Post-Op data from anesthesia record
  useEffect(() => {
    if (initialData) {
      setPostOpData(initialData);
    }
  }, [initialData]);

  // Auto-save mutation for Post-Op data
  const postOpAutoSave = useAutoSaveMutation({
    mutationFn: async (data: PostOpData) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecordId}/postop`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t('anesthesia.op.postOperativeInformation')}</CardTitle>
        {postOpAutoSave.status !== 'idle' && (
          <Badge variant={
            postOpAutoSave.status === 'saving' ? 'secondary' :
            postOpAutoSave.status === 'saved' ? 'default' : 'destructive'
          } data-testid="badge-postop-status">
            {postOpAutoSave.status === 'saving' && t('anesthesia.op.saving')}
            {postOpAutoSave.status === 'saved' && t('anesthesia.op.saved')}
            {postOpAutoSave.status === 'error' && t('anesthesia.op.errorSaving')}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Destination */}
        <div className="space-y-2">
          <Label htmlFor="postop-destination">{t('anesthesia.op.destination')}</Label>
          <Select
            value={postOpData.postOpDestination || ""}
            onValueChange={(value) => {
              const updated = { ...postOpData, postOpDestination: value };
              setPostOpData(updated);
              postOpAutoSave.mutate(updated);
            }}
            disabled={!anesthesiaRecordId}
          >
            <SelectTrigger data-testid="select-postop-destination">
              <SelectValue placeholder={t('anesthesia.op.selectDestination')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pacu">{t('anesthesia.op.destinationPacu')}</SelectItem>
              <SelectItem value="icu">{t('anesthesia.op.destinationIcu')}</SelectItem>
              <SelectItem value="ward">{t('anesthesia.op.destinationWard')}</SelectItem>
              <SelectItem value="home">{t('anesthesia.op.destinationHome')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Post-Operative Notes */}
        <div className="space-y-2">
          <Label htmlFor="postop-notes">{t('anesthesia.op.postOperativeNotes')}</Label>
          <Textarea
            id="postop-notes"
            rows={4}
            placeholder="Enter post-operative notes..."
            value={postOpData.postOpNotes || ""}
            onChange={(e) => {
              const updated = { ...postOpData, postOpNotes: e.target.value };
              setPostOpData(updated);
              postOpAutoSave.mutate(updated);
            }}
            disabled={!anesthesiaRecordId}
            data-testid="textarea-postop-notes"
          />
        </div>

        {/* Medication Timing Fields */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Medication Timing</h4>

          {/* Paracetamol */}
          <div className="space-y-2">
            <Label>Paracetamol</Label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="paracetamol"
                  value="Immediately"
                  checked={postOpData.paracetamolTime === "Immediately"}
                  onChange={(e) => {
                    const updated = { ...postOpData, paracetamolTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-paracetamol-immediately"
                />
                <span className="text-sm">{t('anesthesia.op.immediately')}</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="paracetamol"
                  value="Contraindicated"
                  checked={postOpData.paracetamolTime === "Contraindicated"}
                  onChange={(e) => {
                    const updated = { ...postOpData, paracetamolTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-paracetamol-contraindicated"
                />
                <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
              </label>
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="paracetamol"
                    value="custom"
                    checked={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" && !!postOpData.paracetamolTime}
                    onChange={() => {
                      const inputEl = document.querySelector('[data-testid="input-paracetamol-time"]') as HTMLInputElement;
                      if (inputEl) {
                        inputEl.focus();
                        if (!postOpData.paracetamolTime || postOpData.paracetamolTime === "Immediately" || postOpData.paracetamolTime === "Contraindicated") {
                          const updated = { ...postOpData, paracetamolTime: "" };
                          setPostOpData(updated);
                        }
                      }
                    }}
                    disabled={!anesthesiaRecordId}
                    data-testid="radio-paracetamol-custom"
                  />
                  <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                </label>
                <Input
                  type="text"
                  className="w-32"
                  placeholder={t('anesthesia.op.hhMM')}
                  value={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" ? (postOpData.paracetamolTime || "") : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPostOpData({ ...postOpData, paracetamolTime: value });
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    let formatted = value;

                    if (value && value !== "Immediately" && value !== "Contraindicated") {
                      const digitsOnly = value.replace(/\D/g, '');

                      if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                        const hours = parseInt(digitsOnly, 10);
                        if (hours >= 0 && hours <= 23) {
                          formatted = `${hours.toString().padStart(2, '0')}:00`;
                        }
                      } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                        const hours = parseInt(digitsOnly.slice(0, -2), 10);
                        const minutes = parseInt(digitsOnly.slice(-2), 10);
                        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                          formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        }
                      }
                    }

                    const updated = { ...postOpData, paracetamolTime: formatted };
                    setPostOpData(updated);
                    if (formatted) {
                      postOpAutoSave.mutate(updated);
                    }
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="input-paracetamol-time"
                />
              </div>
            </div>
          </div>

          {/* NSAR */}
          <div className="space-y-2">
            <Label>NSAR</Label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="nsar"
                  value="Immediately"
                  checked={postOpData.nsarTime === "Immediately"}
                  onChange={(e) => {
                    const updated = { ...postOpData, nsarTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-nsar-immediately"
                />
                <span className="text-sm">{t('anesthesia.op.immediately')}</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="nsar"
                  value="Contraindicated"
                  checked={postOpData.nsarTime === "Contraindicated"}
                  onChange={(e) => {
                    const updated = { ...postOpData, nsarTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-nsar-contraindicated"
                />
                <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
              </label>
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="nsar"
                    value="custom"
                    checked={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" && !!postOpData.nsarTime}
                    onChange={() => {
                      const inputEl = document.querySelector('[data-testid="input-nsar-time"]') as HTMLInputElement;
                      if (inputEl) {
                        inputEl.focus();
                        if (!postOpData.nsarTime || postOpData.nsarTime === "Immediately" || postOpData.nsarTime === "Contraindicated") {
                          const updated = { ...postOpData, nsarTime: "" };
                          setPostOpData(updated);
                        }
                      }
                    }}
                    disabled={!anesthesiaRecordId}
                    data-testid="radio-nsar-custom"
                  />
                  <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                </label>
                <Input
                  type="text"
                  className="w-32"
                  placeholder={t('anesthesia.op.hhMM')}
                  value={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" ? (postOpData.nsarTime || "") : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPostOpData({ ...postOpData, nsarTime: value });
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    let formatted = value;

                    if (value && value !== "Immediately" && value !== "Contraindicated") {
                      const digitsOnly = value.replace(/\D/g, '');

                      if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                        const hours = parseInt(digitsOnly, 10);
                        if (hours >= 0 && hours <= 23) {
                          formatted = `${hours.toString().padStart(2, '0')}:00`;
                        }
                      } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                        const hours = parseInt(digitsOnly.slice(0, -2), 10);
                        const minutes = parseInt(digitsOnly.slice(-2), 10);
                        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                          formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        }
                      }
                    }

                    const updated = { ...postOpData, nsarTime: formatted };
                    setPostOpData(updated);
                    if (formatted) {
                      postOpAutoSave.mutate(updated);
                    }
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="input-nsar-time"
                />
              </div>
            </div>
          </div>

          {/* Novalgin */}
          <div className="space-y-2">
            <Label>Novalgin</Label>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="novalgin"
                  value="Immediately"
                  checked={postOpData.novalginTime === "Immediately"}
                  onChange={(e) => {
                    const updated = { ...postOpData, novalginTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-novalgin-immediately"
                />
                <span className="text-sm">{t('anesthesia.op.immediately')}</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="novalgin"
                  value="Contraindicated"
                  checked={postOpData.novalginTime === "Contraindicated"}
                  onChange={(e) => {
                    const updated = { ...postOpData, novalginTime: e.target.value };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="radio-novalgin-contraindicated"
                />
                <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
              </label>
              <div className="flex items-center space-x-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="novalgin"
                    value="custom"
                    checked={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" && !!postOpData.novalginTime}
                    onChange={() => {
                      const inputEl = document.querySelector('[data-testid="input-novalgin-time"]') as HTMLInputElement;
                      if (inputEl) {
                        inputEl.focus();
                        if (!postOpData.novalginTime || postOpData.novalginTime === "Immediately" || postOpData.novalginTime === "Contraindicated") {
                          const updated = { ...postOpData, novalginTime: "" };
                          setPostOpData(updated);
                        }
                      }
                    }}
                    disabled={!anesthesiaRecordId}
                    data-testid="radio-novalgin-custom"
                  />
                  <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                </label>
                <Input
                  type="text"
                  className="w-32"
                  placeholder={t('anesthesia.op.hhMM')}
                  value={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" ? (postOpData.novalginTime || "") : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPostOpData({ ...postOpData, novalginTime: value });
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    let formatted = value;

                    if (value && value !== "Immediately" && value !== "Contraindicated") {
                      const digitsOnly = value.replace(/\D/g, '');

                      if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                        const hours = parseInt(digitsOnly, 10);
                        if (hours >= 0 && hours <= 23) {
                          formatted = `${hours.toString().padStart(2, '0')}:00`;
                        }
                      } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                        const hours = parseInt(digitsOnly.slice(0, -2), 10);
                        const minutes = parseInt(digitsOnly.slice(-2), 10);
                        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                          formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                        }
                      }
                    }

                    const updated = { ...postOpData, novalginTime: formatted };
                    setPostOpData(updated);
                    if (formatted) {
                      postOpAutoSave.mutate(updated);
                    }
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid="input-novalgin-time"
                />
              </div>
            </div>
          </div>
        </div>

        {/* PONV Prophylaxis */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">{t('anesthesia.op.ponvProphylaxis')}</h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'ondansetron', label: t('anesthesia.op.ondansetron') },
              { id: 'droperidol', label: t('anesthesia.op.droperidol') },
              { id: 'haloperidol', label: t('anesthesia.op.haloperidol') },
              { id: 'dexamethasone', label: t('anesthesia.op.dexamethasone') },
            ].map((med) => (
              <div key={med.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`ponv-${med.id}`}
                  checked={postOpData.ponvProphylaxis?.[med.id as keyof typeof postOpData.ponvProphylaxis] ?? false}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...postOpData,
                      ponvProphylaxis: {
                        ...postOpData.ponvProphylaxis,
                        [med.id]: checked === true
                      }
                    };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid={`checkbox-ponv-${med.id}`}
                />
                <Label htmlFor={`ponv-${med.id}`} className="text-sm">{med.label}</Label>
              </div>
            ))}
          </div>
        </div>

        {/* Ambulatory Care Instructions */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">{t('anesthesia.op.ambulatoryCareInstructions')}</h4>
          <div className="space-y-3">
            {([
              { id: 'repeatAntibioticAfter4h' as const, label: t('anesthesia.op.repeatAntibioticAfter4h') },
              { id: 'osasObservation' as const, label: t('anesthesia.op.osasObservation') },
              { id: 'escortRequired' as const, label: t('anesthesia.op.escortRequired') },
              { id: 'postBlockMotorCheck' as const, label: t('anesthesia.op.postBlockMotorCheck') },
              { id: 'extendedObservation' as const, label: t('anesthesia.op.extendedObservation') },
              { id: 'noOralAnticoagulants24h' as const, label: t('anesthesia.op.noOralAnticoagulants24h') },
            ] as const).map((item) => (
              <div key={item.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`ambulatory-${item.id}`}
                  checked={postOpData.ambulatoryCare?.[item.id] === true}
                  onCheckedChange={(checked) => {
                    const updated = {
                      ...postOpData,
                      ambulatoryCare: {
                        ...postOpData.ambulatoryCare,
                        [item.id]: checked === true
                      }
                    };
                    setPostOpData(updated);
                    postOpAutoSave.mutate(updated);
                  }}
                  disabled={!anesthesiaRecordId}
                  data-testid={`checkbox-ambulatory-${item.id}`}
                />
                <Label htmlFor={`ambulatory-${item.id}`} className="text-sm">{item.label}</Label>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ambulatory-notes">{t('anesthesia.op.ambulatoryCareNotes')}</Label>
            <Textarea
              id="ambulatory-notes"
              rows={2}
              placeholder=""
              value={postOpData.ambulatoryCare?.notes || ""}
              onChange={(e) => {
                const updated = {
                  ...postOpData,
                  ambulatoryCare: {
                    ...postOpData.ambulatoryCare,
                    notes: e.target.value
                  }
                };
                setPostOpData(updated);
                postOpAutoSave.mutate(updated);
              }}
              disabled={!anesthesiaRecordId}
              data-testid="textarea-ambulatory-notes"
            />
          </div>
        </div>

        {/* Intraoperative Complications - moved to end */}
        <div className="space-y-2">
          <Label htmlFor="complications">{t('anesthesia.op.intraoperativeComplications')}</Label>
          <Textarea
            id="complications"
            rows={3}
            placeholder=""
            value={postOpData.complications || ""}
            onChange={(e) => {
              const updated = { ...postOpData, complications: e.target.value };
              setPostOpData(updated);
              postOpAutoSave.mutate(updated);
            }}
            disabled={!anesthesiaRecordId}
            data-testid="textarea-postop-complications"
          />
        </div>
      </CardContent>
    </Card>
  );
}
