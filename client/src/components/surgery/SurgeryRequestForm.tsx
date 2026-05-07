/**
 * SurgeryRequestForm
 * In-portal form for submitting an external surgery request. Designed for
 * the surgeon-portal session use case (surgeon resolved server-side).
 *
 * Structure:
 *   - Single-open accordion with per-section Continue button
 *   - Sections: Operating surgeon → Surgery details → Patient details → Documents
 *   - Documents section is optional; submit becomes available once
 *     surgeon/surgery/patient sections are valid
 *
 * The form is presentation-only:
 *   - Translations come in via the t() prop (no i18next dependency in this file
 *     beyond the embedded PatientPositionFields child)
 *   - Submission, query invalidation, toasts owned by the parent
 *   - File upload behavior owned by the parent (passed in via uploadFile prop)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { DateInput } from "@/components/ui/date-input";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CheckCircle2,
  Circle,
  ChevronsUpDown,
  Loader2,
  Mail,
  Phone,
  Trash2,
  Upload,
} from "lucide-react";
import {
  PatientPositionFields,
  type PatientPositionType,
  type ArmPositionType,
} from "@/components/surgery/PatientPositionFields";

export type AvailableSurgeon = {
  id: string;
  firstName: string | null;
  lastName: string | null;
};

export type SurgerySideValue = "" | "left" | "right" | "both";

export interface AttachedFile {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  key?: string;
  isUploading?: boolean;
}

export interface SurgeryRequestFormValues {
  surgeonFirstName: string;
  surgeonLastName: string;
  surgeonEmail: string;
  surgeonPhone: string;

  surgeryName: string;
  chopCode: string;
  surgerySide: SurgerySideValue;
  patientPosition: PatientPositionType;
  leftArmPosition: ArmPositionType;
  rightArmPosition: ArmPositionType;
  antibioseProphylaxe: boolean;

  surgeryDurationMinutes: number;
  withAnesthesia: boolean;
  anesthesiaNotes: string;
  surgeryNotes: string;
  diagnosis: string;
  coverageType: string;
  stayType: "" | "ambulant" | "overnight";
  wishedDate: string;
  wishedTimeFrom: number | null;
  wishedTimeTo: number | null;

  isReservationOnly: boolean;

  patientFirstName: string;
  patientLastName: string;
  patientBirthday: string;
  patientEmail: string;
  patientPhone: string;
  patientStreet: string;
  patientPostalCode: string;
  patientCity: string;

  attachedFiles: AttachedFile[];
}

export interface SurgeryRequestFormProps {
  availableSurgeons: AvailableSurgeon[];
  selectedSurgeonId: string;
  onSelectedSurgeonIdChange: (id: string) => void;

  /**
   * Whether to render the "Operating surgeon" picker. Decoupled from
   * availableSurgeons.length so the parent can show a picker even when
   * there's only one option (a praxis with a single linked child still
   * needs to see *which* child the request goes to).
   */
  showSurgeonPicker: boolean;

  /**
   * Whether to render the legacy surgeon-details block (firstName/lastName/
   * email/phone). The in-portal form passes false because the surgeon is
   * resolved from the session.
   */
  showSurgeonDetailsBlock: boolean;

  t: (key: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  locale: "de" | "en";

  onSubmit: (values: SurgeryRequestFormValues) => void | Promise<void>;
  isSubmitting: boolean;

  initialValues?: Partial<SurgeryRequestFormValues>;

  /**
   * Uploads one file to S3 and returns its persisted metadata. Owned by the
   * parent so the form stays decoupled from the route shape.
   * Resolves with `null` on failure (parent shows the toast).
   */
  uploadFile?: (file: File) => Promise<Omit<AttachedFile, "id" | "isUploading"> | null>;
}

const DEFAULT_VALUES: SurgeryRequestFormValues = {
  surgeonFirstName: "",
  surgeonLastName: "",
  surgeonEmail: "",
  surgeonPhone: "",
  surgeryName: "",
  chopCode: "",
  surgerySide: "",
  patientPosition: "",
  leftArmPosition: "",
  rightArmPosition: "",
  antibioseProphylaxe: false,
  surgeryDurationMinutes: 60,
  withAnesthesia: true,
  anesthesiaNotes: "",
  surgeryNotes: "",
  diagnosis: "",
  coverageType: "",
  stayType: "",
  wishedDate: "",
  wishedTimeFrom: null,
  wishedTimeTo: null,
  isReservationOnly: false,
  patientFirstName: "",
  patientLastName: "",
  patientBirthday: "",
  patientEmail: "",
  patientPhone: "",
  patientStreet: "",
  patientPostalCode: "",
  patientCity: "",
  attachedFiles: [],
};

const TIME_SLIDER_MIN = 480;  // 08:00
const TIME_SLIDER_MAX = 960;  // 16:00
const TIME_SLIDER_STEP = 30;

function formatTimeMins(mins: number | null | undefined): string {
  if (mins == null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

type SectionKey = "surgeon" | "surgery" | "patient" | "documents";

interface ChopProcedure {
  id: string;
  code: string;
  descriptionDe: string;
}

export function SurgeryRequestForm({
  availableSurgeons,
  selectedSurgeonId,
  onSelectedSurgeonIdChange,
  showSurgeonPicker,
  showSurgeonDetailsBlock,
  t,
  onSubmit,
  isSubmitting,
  initialValues,
  uploadFile,
}: SurgeryRequestFormProps) {
  const [values, setValues] = useState<SurgeryRequestFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
  }));

  useEffect(() => {
    if (!initialValues) return;
    setValues((prev) => ({ ...prev, ...initialValues }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const update = <K extends keyof SurgeryRequestFormValues>(
    field: K,
    value: SurgeryRequestFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  // ─── Section validity ───────────────────────────────────────────────
  const sectionValidity = useMemo(() => {
    const surgeon = !showSurgeonPicker || !!selectedSurgeonId;

    const surgery = (() => {
      if (!values.wishedDate) return false;
      if (values.surgeryDurationMinutes < 5 || values.surgeryDurationMinutes > 720) return false;
      // Coverage / stay type / surgery name / diagnosis are only relevant for
      // full requests — pure slot reservations skip them entirely.
      if (!values.isReservationOnly) {
        if (!values.surgeryName) return false;
        if (!values.coverageType) return false;
        if (!values.stayType) return false;
        if (values.coverageType === "Krankenkasse" && !values.diagnosis) return false;
      }
      return true;
    })();

    const patient = (() => {
      if (values.isReservationOnly) return true;
      if (
        !values.patientFirstName ||
        !values.patientLastName ||
        !values.patientBirthday ||
        !values.patientPhone ||
        !values.patientStreet ||
        !values.patientPostalCode ||
        !values.patientCity
      ) {
        return false;
      }
      if (showSurgeonDetailsBlock) {
        if (
          !values.surgeonFirstName ||
          !values.surgeonLastName ||
          !values.surgeonEmail ||
          !values.surgeonPhone
        ) {
          return false;
        }
      }
      return true;
    })();

    const documents = true; // optional

    return { surgeon, surgery, patient, documents };
  }, [values, selectedSurgeonId, showSurgeonPicker, showSurgeonDetailsBlock]);

  const canSubmit = sectionValidity.surgeon && sectionValidity.surgery && sectionValidity.patient;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    await onSubmit(values);
  };

  // ─── Accordion open-state ───────────────────────────────────────────
  const [openSection, setOpenSection] = useState<SectionKey>("surgeon");

  // If the user toggles reservation-only while a now-hidden section is open
  // (patient/documents), fall back to the surgery section.
  useEffect(() => {
    if (values.isReservationOnly && (openSection === "patient" || openSection === "documents")) {
      setOpenSection("surgery");
    }
  }, [values.isReservationOnly, openSection]);

  // Sections visible in the current mode. Reservation-only collapses the form
  // down to surgeon + surgery — there's no patient and no documents to attach
  // since this is just a placeholder slot.
  const visibleSections: SectionKey[] = values.isReservationOnly
    ? ["surgeon", "surgery"]
    : ["surgeon", "surgery", "patient", "documents"];

  const advanceFrom = (current: SectionKey) => {
    const i = visibleSections.indexOf(current);
    for (let j = i + 1; j < visibleSections.length; j++) {
      const k = visibleSections[j];
      if (!sectionValidity[k]) {
        setOpenSection(k);
        return;
      }
    }
    if (i + 1 < visibleSections.length) setOpenSection(visibleSections[i + 1]);
  };

  // ─── CHOP search ────────────────────────────────────────────────────
  const [chopOpen, setChopOpen] = useState(false);
  const [chopQuery, setChopQuery] = useState("");
  const { data: chopResults = [] } = useQuery<ChopProcedure[]>({
    queryKey: ["/api/chop-procedures", chopQuery],
    enabled: chopQuery.trim().length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(
        `/api/chop-procedures?search=${encodeURIComponent(chopQuery)}&limit=30`,
      );
      if (!res.ok) return [];
      return (await res.json()) as ChopProcedure[];
    },
  });

  // ─── File upload ────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !uploadFile) return;
    const files = Array.from(fileList);
    for (const file of files) {
      const tempId = crypto.randomUUID();
      setValues((prev) => ({
        ...prev,
        attachedFiles: [
          ...prev.attachedFiles,
          { id: tempId, fileName: file.name, fileUrl: "", isUploading: true },
        ],
      }));
      const result = await uploadFile(file);
      setValues((prev) => ({
        ...prev,
        attachedFiles: result
          ? prev.attachedFiles.map((f) =>
              f.id === tempId ? { ...result, id: tempId, isUploading: false } : f,
            )
          : prev.attachedFiles.filter((f) => f.id !== tempId),
      }));
    }
  };

  const removeFile = (id: string) => {
    setValues((prev) => ({
      ...prev,
      attachedFiles: prev.attachedFiles.filter((f) => f.id !== id),
    }));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFiles(e.dataTransfer.files);
  };

  // ─── Render helper: section header indicator ────────────────────────
  const sectionIcon = (key: SectionKey) =>
    sectionValidity[key] ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : (
      <Circle className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Accordion
        type="single"
        value={openSection}
        onValueChange={(v) => v && setOpenSection(v as SectionKey)}
        collapsible={false}
      >
        {/* ─── Section 1: Operating surgeon ────────────────────────── */}
        <AccordionItem value="surgeon">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {sectionIcon("surgeon")}
              {t("accordion.surgeon")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {showSurgeonPicker && (
                <div className="space-y-2">
                  <Label htmlFor="operating-surgeon">{t("operatingSurgeon")}</Label>
                  <Select
                    value={selectedSurgeonId}
                    onValueChange={onSelectedSurgeonIdChange}
                  >
                    <SelectTrigger id="operating-surgeon" data-testid="select-operating-surgeon">
                      <SelectValue placeholder={t("selectSurgeon")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSurgeons.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {(s.lastName ?? "").trim()}, {(s.firstName ?? "").trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showSurgeonDetailsBlock && (
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <h3 className="font-medium text-sm">{t("surgeonDetails")}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="surgeonFirstName">{t("firstName")} *</Label>
                      <Input
                        id="surgeonFirstName"
                        value={values.surgeonFirstName}
                        onChange={(e) => update("surgeonFirstName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="surgeonLastName">{t("lastName")} *</Label>
                      <Input
                        id="surgeonLastName"
                        value={values.surgeonLastName}
                        onChange={(e) => update("surgeonLastName", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surgeonEmail">
                      <Mail className="h-4 w-4 inline mr-1" />
                      {t("email")} *
                    </Label>
                    <Input
                      id="surgeonEmail"
                      type="email"
                      value={values.surgeonEmail}
                      onChange={(e) => update("surgeonEmail", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="surgeonPhone">
                      <Phone className="h-4 w-4 inline mr-1" />
                      {t("phone")} *
                    </Label>
                    <PhoneInputWithCountry
                      id="surgeonPhone"
                      value={values.surgeonPhone}
                      onChange={(value) => update("surgeonPhone", value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div>
                  <Label htmlFor="reservationOnly" className="cursor-pointer">
                    {t("reservationOnly")}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("reservationOnlyDesc")}
                  </p>
                </div>
                <Switch
                  id="reservationOnly"
                  checked={values.isReservationOnly}
                  onCheckedChange={(checked) => update("isReservationOnly", checked)}
                  data-testid="switch-reservation-only"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => advanceFrom("surgeon")}
                  disabled={!sectionValidity.surgeon}
                  data-testid="button-continue-surgeon"
                >
                  {t("accordion.continue")}
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 2: Surgery details ──────────────────────────── */}
        <AccordionItem value="surgery">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {sectionIcon("surgery")}
              {t("accordion.surgery")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {!values.isReservationOnly && (
                <div className="space-y-2">
                  <Label>{t("surgeryName")} *</Label>
                  <Popover open={chopOpen} onOpenChange={setChopOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                        data-testid="button-chop-search"
                      >
                        <span className="truncate text-left">
                          {values.surgeryName || t("chopSearch.placeholder")}
                          {values.chopCode && (
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {values.chopCode}
                            </span>
                          )}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[420px]" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t("chopSearch.placeholder")}
                          value={chopQuery}
                          onValueChange={setChopQuery}
                        />
                        <CommandList className="max-h-[300px] overflow-auto">
                          <CommandEmpty>
                            {chopQuery.trim().length < 2
                              ? t("chopSearch.typeMore")
                              : t("chopSearch.empty")}
                          </CommandEmpty>
                          <CommandGroup>
                            {chopResults.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={c.id}
                                onSelect={() => {
                                  update("surgeryName", c.descriptionDe);
                                  update("chopCode", c.code);
                                  setChopOpen(false);
                                }}
                                data-testid={`chop-option-${c.code}`}
                              >
                                <span className="font-mono text-xs mr-2 text-muted-foreground">
                                  {c.code}
                                </span>
                                <span>{c.descriptionDe}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Input
                    placeholder={t("chopSearch.useCustom")}
                    value={values.surgeryName}
                    onChange={(e) => {
                      update("surgeryName", e.target.value);
                      update("chopCode", "");
                    }}
                    data-testid="input-surgery-name"
                  />
                </div>
              )}

              {!values.isReservationOnly && (
                <div className="space-y-2">
                  <Label htmlFor="surgerySide">{t("surgerySide.label")}</Label>
                  <Select
                    value={values.surgerySide || undefined}
                    onValueChange={(v) => update("surgerySide", v as SurgerySideValue)}
                  >
                    <SelectTrigger id="surgerySide" data-testid="select-surgery-side">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">{t("surgerySide.left")}</SelectItem>
                      <SelectItem value="right">{t("surgerySide.right")}</SelectItem>
                      <SelectItem value="both">{t("surgerySide.both")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!values.isReservationOnly && (
                <PatientPositionFields
                  patientPosition={values.patientPosition}
                  leftArmPosition={values.leftArmPosition}
                  rightArmPosition={values.rightArmPosition}
                  onPatientPositionChange={(v) => update("patientPosition", v)}
                  onLeftArmPositionChange={(v) => update("leftArmPosition", v)}
                  onRightArmPositionChange={(v) => update("rightArmPosition", v)}
                  testIdPrefix="request-"
                />
              )}

              {!values.isReservationOnly && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div>
                    <Label htmlFor="antibioseProphylaxe" className="cursor-pointer">
                      {t("antibioticProphylaxis.label")}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("antibioticProphylaxis.description")}
                    </p>
                  </div>
                  <Switch
                    id="antibioseProphylaxe"
                    checked={values.antibioseProphylaxe}
                    onCheckedChange={(c) => update("antibioseProphylaxe", c)}
                    data-testid="switch-antibiose-prophylaxe"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wishedDate">{t("wishedDate")} *</Label>
                  <DateInput
                    value={values.wishedDate}
                    onChange={(v) => update("wishedDate", v)}
                    data-testid="input-wished-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="surgeryDuration">{t("durationMinutes")} *</Label>
                  <Input
                    id="surgeryDuration"
                    type="number"
                    min={5}
                    max={720}
                    value={values.surgeryDurationMinutes}
                    onChange={(e) =>
                      update("surgeryDurationMinutes", parseInt(e.target.value) || 60)
                    }
                    data-testid="input-surgery-duration"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>{t("preferredTimeRange")}</Label>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeMins(values.wishedTimeFrom ?? TIME_SLIDER_MIN)} –{" "}
                    {formatTimeMins(values.wishedTimeTo ?? TIME_SLIDER_MAX)}
                  </span>
                </div>
                <Slider
                  min={TIME_SLIDER_MIN}
                  max={TIME_SLIDER_MAX}
                  step={TIME_SLIDER_STEP}
                  value={[
                    values.wishedTimeFrom ?? TIME_SLIDER_MIN,
                    values.wishedTimeTo ?? TIME_SLIDER_MAX,
                  ]}
                  onValueChange={([from, to]) => {
                    update("wishedTimeFrom", from);
                    update("wishedTimeTo", to);
                  }}
                  data-testid="slider-time-range"
                />
              </div>

              {!values.isReservationOnly && (
                <div className="space-y-2">
                  <Label htmlFor="coverageType">{t("coverageType")} *</Label>
                  <Select
                    value={values.coverageType || undefined}
                    onValueChange={(v) => update("coverageType", v)}
                  >
                    <SelectTrigger id="coverageType" data-testid="select-coverage-type">
                      <SelectValue placeholder={t("coverageTypePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Selbstzahler">{t("coverageSelbstzahler")}</SelectItem>
                      <SelectItem value="Krankenkasse">{t("coverageKrankenkasse")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!values.isReservationOnly && (
                <div className="space-y-2">
                  <Label htmlFor="stayType">{t("stayType")} *</Label>
                  <Select
                    value={values.stayType || undefined}
                    onValueChange={(v) => update("stayType", v as "ambulant" | "overnight")}
                  >
                    <SelectTrigger id="stayType" data-testid="select-stay-type">
                      <SelectValue placeholder={t("stayTypePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ambulant">{t("stayAmbulant")}</SelectItem>
                      <SelectItem value="overnight">{t("stayOvernight")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!values.isReservationOnly && (
                <div className="space-y-2">
                  <Label htmlFor="diagnosis">
                    {t("diagnosis")}
                    {values.coverageType === "Krankenkasse" ? " *" : ""}
                  </Label>
                  <Input
                    id="diagnosis"
                    value={values.diagnosis}
                    onChange={(e) => update("diagnosis", e.target.value)}
                  />
                </div>
              )}

              {!values.isReservationOnly && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <Label htmlFor="withAnesthesia" className="cursor-pointer">
                    {t("withAnesthesia")}
                  </Label>
                  <Switch
                    id="withAnesthesia"
                    checked={values.withAnesthesia}
                    onCheckedChange={(c) => update("withAnesthesia", c)}
                  />
                </div>
              )}

              {!values.isReservationOnly && values.withAnesthesia && (
                <div className="space-y-2">
                  <Label htmlFor="anesthesiaNotes">{t("anesthesiaNotes")}</Label>
                  <Textarea
                    id="anesthesiaNotes"
                    rows={3}
                    value={values.anesthesiaNotes}
                    onChange={(e) => update("anesthesiaNotes", e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="surgeryNotes">{t("surgeryNotes")}</Label>
                <Textarea
                  id="surgeryNotes"
                  rows={3}
                  value={values.surgeryNotes}
                  onChange={(e) => update("surgeryNotes", e.target.value)}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => advanceFrom("surgery")}
                  disabled={!sectionValidity.surgery}
                  data-testid="button-continue-surgery"
                >
                  {t("accordion.continue")}
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 3: Patient details (hidden in reservation-only mode) ── */}
        {!values.isReservationOnly && (
        <AccordionItem value="patient">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {sectionIcon("patient")}
              {t("accordion.patient")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="patientFirstName">{t("firstName")} *</Label>
                      <Input
                        id="patientFirstName"
                        value={values.patientFirstName}
                        onChange={(e) => update("patientFirstName", e.target.value)}
                        data-testid="input-patient-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patientLastName">{t("lastName")} *</Label>
                      <Input
                        id="patientLastName"
                        value={values.patientLastName}
                        onChange={(e) => update("patientLastName", e.target.value)}
                        data-testid="input-patient-last-name"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientBirthday">{t("birthday")} *</Label>
                    <FlexibleDateInput
                      value={values.patientBirthday}
                      onChange={(v) => update("patientBirthday", v)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientPhone">
                      <Phone className="h-4 w-4 inline mr-1" />
                      {t("phone")} *
                    </Label>
                    <PhoneInputWithCountry
                      id="patientPhone"
                      value={values.patientPhone}
                      onChange={(v) => update("patientPhone", v)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientEmail">
                      <Mail className="h-4 w-4 inline mr-1" />
                      {t("email")} ({t("optional")})
                    </Label>
                    <Input
                      id="patientEmail"
                      type="email"
                      value={values.patientEmail}
                      onChange={(e) => update("patientEmail", e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 sm:col-span-3">
                      <Label htmlFor="patientStreet">{t("street")} *</Label>
                      <Input
                        id="patientStreet"
                        value={values.patientStreet}
                        onChange={(e) => update("patientStreet", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patientPostalCode">{t("postalCode")} *</Label>
                      <Input
                        id="patientPostalCode"
                        value={values.patientPostalCode}
                        onChange={(e) => update("patientPostalCode", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="patientCity">{t("city")} *</Label>
                      <Input
                        id="patientCity"
                        value={values.patientCity}
                        onChange={(e) => update("patientCity", e.target.value)}
                      />
                    </div>
                  </div>
                </>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => advanceFrom("patient")}
                  disabled={!sectionValidity.patient}
                  data-testid="button-continue-patient"
                >
                  {t("accordion.continue")}
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        )}

        {/* ─── Section 4: Documents (hidden in reservation-only mode) ──── */}
        {!values.isReservationOnly && (
        <AccordionItem value="documents">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              {sectionIcon("documents")}
              {t("accordion.documents")}
              <span className="text-xs text-muted-foreground">({t("optional")})</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2">
              {uploadFile ? (
                <>
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    data-testid="documents-dropzone"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.heic,.docx"
                      onChange={(e) => handleFiles(e.target.files)}
                    />
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm">{t("documents.dropHint")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-select-files"
                    >
                      {t("documents.selectFiles")}
                    </Button>
                  </div>
                  {values.attachedFiles.length > 0 && (
                    <ul className="space-y-1 border rounded-md p-2">
                      {values.attachedFiles.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between text-sm py-1"
                        >
                          <span className="truncate">
                            {f.fileName}
                            {f.isUploading && (
                              <span className="ml-2 text-muted-foreground">
                                ({t("documents.uploading")}…)
                              </span>
                            )}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFile(f.id)}
                            disabled={f.isUploading}
                            data-testid={`button-remove-file-${f.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("documents.uploadDisabled")}
                </p>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
        )}
      </Accordion>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          data-testid="button-submit-surgery-request"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
