/**
 * SurgeryRequestForm
 * In-portal form for submitting an external surgery request. Designed for
 * the surgeon-portal session use case (surgeon resolved server-side).
 *
 * Structure:
 *   - Single-open accordion with per-section Continue button
 *   - Sections: Operating surgeon → Surgery details → Patient details → Documents
 *   - Step 1 shows a read-only surgeon summary card when no picker is needed
 *   - Step 2 carries the "reservation only" scope toggle and is split into
 *     three labeled sub-groups: Schedule / Procedure / Coverage
 *   - CHOP procedure picker collapses to one entry point with a "+ Use custom
 *     name" toggle for free-text fallback
 *   - Required fields show inline validation (red border + Pflichtfeld helper)
 *     once touched; an amber "missing fields" callout appears above each
 *     Continue / Submit button when the section / form is invalid
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

  /**
   * Read-only summary of the authenticated surgeon. When provided AND
   * `showSurgeonPicker` is false, renders an identification card on Step 1
   * in place of the (hidden) picker. The form does not use this for any
   * mutable state — submission still uses `selectedSurgeonId`.
   */
  currentSurgeon?: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };

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

function surgeonInitials(firstName: string | null, lastName: string | null): string {
  const last = (lastName ?? "").trim()[0] ?? "";
  const first = (firstName ?? "").trim()[0] ?? "";
  return (last + first).toUpperCase() || "—";
}

function FieldError({ t }: { t: (k: string) => string }) {
  return <p className="text-xs text-destructive">{t("validation.required")}</p>;
}

function MissingFieldsCallout({
  testId,
  label,
  names,
}: {
  testId: string;
  label: string;
  names: string[];
}) {
  return (
    <div
      className="rounded-md border border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
      data-testid={testId}
    >
      <span className="font-medium">{label}:</span> {names.join(", ")}
    </div>
  );
}

type SectionKey = "surgeon" | "surgery" | "patient" | "documents";

type SectionTitleKey =
  | "accordion.surgeon"
  | "accordion.surgery"
  | "accordion.patient"
  | "accordion.documents";

const SECTION_TITLE_KEY: Record<SectionKey, SectionTitleKey> = {
  surgeon: "accordion.surgeon",
  surgery: "accordion.surgery",
  patient: "accordion.patient",
  documents: "accordion.documents",
};

function ProgressHeader({
  visibleSections,
  openSection,
  isComplete,
  t,
}: {
  visibleSections: SectionKey[];
  openSection: SectionKey;
  isComplete: (key: SectionKey) => boolean;
  t: (key: string) => string;
}) {
  const total = visibleSections.length;
  const currentIdx = Math.max(0, visibleSections.indexOf(openSection));
  const stepNumber = currentIdx + 1;

  const stepOfTotalText = t("progress.stepOfTotal")
    .replace("{step}", String(stepNumber))
    .replace("{total}", String(total));

  const currentTitle = t(SECTION_TITLE_KEY[openSection] ?? "accordion.surgeon");

  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      data-testid="form-progress-header"
    >
      <div className="flex items-center gap-1.5">
        {visibleSections.map((key) => {
          const complete = isComplete(key);
          const active = key === openSection;
          const dotClass = active
            ? "h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/30"
            : complete
              ? "h-2.5 w-2.5 rounded-full bg-emerald-600"
              : "h-2.5 w-2.5 rounded-full border border-muted-foreground/40";
          return <div key={key} className={dotClass} data-progress-dot data-key={key} />;
        })}
      </div>
      <div className="flex-1 truncate text-xs text-muted-foreground">
        {stepOfTotalText} — <span className="font-medium text-foreground">{currentTitle}</span>
      </div>
    </div>
  );
}

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
  currentSurgeon,
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
    if (!canSubmit) {
      touchAllVisible();
      return;
    }
    if (isSubmitting) return;
    await onSubmit(values);
  };

  // ─── Per-field touched tracking + inline validation ─────────────────
  type FieldKey =
    | "selectedSurgeonId"
    | "wishedDate"
    | "surgeryDurationMinutes"
    | "surgeryName"
    | "coverageType"
    | "stayType"
    | "diagnosis"
    | "patientFirstName"
    | "patientLastName"
    | "patientBirthday"
    | "patientPhone"
    | "patientStreet"
    | "patientPostalCode"
    | "patientCity";

  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const markTouched = (k: FieldKey) =>
    setTouched((prev) => (prev.has(k) ? prev : new Set(prev).add(k)));

  const fieldValid = useMemo<Record<FieldKey, boolean>>(() => {
    const reservation = values.isReservationOnly;
    return {
      selectedSurgeonId: !showSurgeonPicker || !!selectedSurgeonId,
      wishedDate: !!values.wishedDate,
      surgeryDurationMinutes:
        values.surgeryDurationMinutes >= 5 && values.surgeryDurationMinutes <= 720,
      surgeryName: reservation ? true : !!values.surgeryName,
      coverageType: reservation ? true : !!values.coverageType,
      stayType: reservation ? true : !!values.stayType,
      diagnosis:
        reservation || values.coverageType !== "Krankenkasse"
          ? true
          : !!values.diagnosis,
      patientFirstName: reservation ? true : !!values.patientFirstName,
      patientLastName: reservation ? true : !!values.patientLastName,
      patientBirthday: reservation ? true : !!values.patientBirthday,
      patientPhone: reservation ? true : !!values.patientPhone,
      patientStreet: reservation ? true : !!values.patientStreet,
      patientPostalCode: reservation ? true : !!values.patientPostalCode,
      patientCity: reservation ? true : !!values.patientCity,
    };
  }, [values, selectedSurgeonId, showSurgeonPicker]);

  const showError = (k: FieldKey) => touched.has(k) && !fieldValid[k];

  const FIELD_LABEL_KEY: Record<FieldKey, string> = {
    selectedSurgeonId: "operatingSurgeon",
    wishedDate: "wishedDate",
    surgeryDurationMinutes: "durationMinutes",
    surgeryName: "surgeryName",
    coverageType: "coverageType",
    stayType: "stayType",
    diagnosis: "diagnosis",
    patientFirstName: "firstName",
    patientLastName: "lastName",
    patientBirthday: "birthday",
    patientPhone: "phone",
    patientStreet: "street",
    patientPostalCode: "postalCode",
    patientCity: "city",
  };

  const FIELDS_BY_SECTION: Record<SectionKey, FieldKey[]> = {
    surgeon: ["selectedSurgeonId"],
    surgery: [
      "wishedDate",
      "surgeryDurationMinutes",
      "surgeryName",
      "coverageType",
      "stayType",
      "diagnosis",
    ],
    patient: [
      "patientFirstName",
      "patientLastName",
      "patientBirthday",
      "patientPhone",
      "patientStreet",
      "patientPostalCode",
      "patientCity",
    ],
    documents: [],
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

  // Whether a section is the last visible one — used to hide the Continue
  // button on it (Submit at the bottom takes over).
  const isLastVisible = (key: SectionKey) =>
    visibleSections.indexOf(key) === visibleSections.length - 1;

  const missingFieldLabels = (section: SectionKey | "all"): string[] => {
    const keys =
      section === "all"
        ? visibleSections.flatMap((s) => FIELDS_BY_SECTION[s])
        : FIELDS_BY_SECTION[section];
    return keys.filter((k) => !fieldValid[k]).map((k) => t(FIELD_LABEL_KEY[k]));
  };

  const touchAllInSection = (section: SectionKey) => {
    setTouched((prev) => {
      const next = new Set(prev);
      for (const k of FIELDS_BY_SECTION[section]) next.add(k);
      return next;
    });
  };

  const touchAllVisible = () => {
    setTouched((prev) => {
      const next = new Set(prev);
      for (const s of visibleSections) for (const k of FIELDS_BY_SECTION[s]) next.add(k);
      return next;
    });
  };

  const advanceFrom = (current: SectionKey) => {
    if (!sectionValidity[current]) {
      touchAllInSection(current);
      return;
    }
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
  const [chopMode, setChopMode] = useState<"search" | "custom">("search");
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
  // Documents is optional, so sectionValidity.documents is always true.
  // Treat "complete" as "the user has actually done something" — for
  // documents that means at least one attached file. Otherwise the green
  // tick + bold title on an untouched optional section reads as misleading
  // affirmation.
  const isSectionComplete = (key: SectionKey): boolean =>
    key === "documents"
      ? values.attachedFiles.length > 0
      : sectionValidity[key];

  const sectionIcon = (key: SectionKey) =>
    isSectionComplete(key) ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : (
      <Circle className="h-4 w-4 text-muted-foreground" />
    );

  // Dim the title of upcoming sections so the active step stays prominent.
  // The currently-open section keeps full contrast even while it's still
  // incomplete — it's where the surgeon is actively working.
  const triggerLabelClass = (key: SectionKey): string => {
    const dim = !isSectionComplete(key) && openSection !== key;
    return `flex items-center gap-2${dim ? " text-muted-foreground" : ""}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ProgressHeader
        visibleSections={visibleSections}
        openSection={openSection}
        isComplete={isSectionComplete}
        t={t}
      />
      <Accordion
        type="single"
        value={openSection}
        onValueChange={(v) => v && setOpenSection(v as SectionKey)}
        collapsible={false}
      >
        {/* ─── Section 1: Operating surgeon ────────────────────────── */}
        <AccordionItem value="surgeon">
          <AccordionTrigger>
            <span className={triggerLabelClass("surgeon")}>
              {sectionIcon("surgeon")}
              {t("accordion.surgeon")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2" data-section="surgeon">
              {showSurgeonPicker && (
                <div className="space-y-2">
                  <Label htmlFor="operating-surgeon">{t("operatingSurgeon")}</Label>
                  <Select
                    value={selectedSurgeonId}
                    onValueChange={onSelectedSurgeonIdChange}
                  >
                    <SelectTrigger
                      id="operating-surgeon"
                      data-testid="select-operating-surgeon"
                      onBlur={() => markTouched("selectedSurgeonId")}
                      aria-invalid={showError("selectedSurgeonId") || undefined}
                      className={showError("selectedSurgeonId") ? "border-destructive" : undefined}
                    >
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
                  {showError("selectedSurgeonId") && (
                    <FieldError t={t} />
                  )}
                </div>
              )}

              {!showSurgeonPicker && currentSurgeon && (
                <div
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"
                  data-testid="surgeon-summary-card"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                    {surgeonInitials(currentSurgeon.firstName, currentSurgeon.lastName)}
                  </div>
                  <div className="min-w-0 flex-1 text-sm leading-snug">
                    <div className="truncate font-medium">
                      {[currentSurgeon.firstName, currentSurgeon.lastName].filter(Boolean).join(" ")}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[currentSurgeon.email, currentSurgeon.phone].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="hidden sm:block text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("surgeonCard.submittingAs")}
                  </div>
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

              {!isLastVisible("surgeon") && (
                <>
                  {!sectionValidity.surgeon && missingFieldLabels("surgeon").length > 0 && touched.size > 0 && (
                    <MissingFieldsCallout
                      testId="missing-fields-callout-surgeon"
                      label={t("missingFields")}
                      names={missingFieldLabels("surgeon")}
                    />
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => advanceFrom("surgeon")}
                      data-testid="button-continue-surgeon"
                    >
                      {t("accordion.continue")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 2: Surgery details ──────────────────────────── */}
        <AccordionItem value="surgery">
          <AccordionTrigger>
            <span className={triggerLabelClass("surgery")}>
              {sectionIcon("surgery")}
              {t("accordion.surgery")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2" data-section="surgery">
              {/* Reservation toggle — top of surgery section */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-primary/40 bg-primary/5">
                <div className="pr-3">
                  <Label htmlFor="reservationOnly" className="cursor-pointer font-medium">
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

              {/* Schedule */}
              <div data-subgroup="schedule" className="space-y-3 pt-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                  {t("subgroup.schedule")}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wishedDate">{t("wishedDate")} *</Label>
                    <DateInput
                      value={values.wishedDate}
                      onChange={(v) => update("wishedDate", v)}
                      onBlur={() => markTouched("wishedDate")}
                      aria-invalid={showError("wishedDate") || undefined}
                      className={showError("wishedDate") ? "border-destructive" : undefined}
                      data-testid="input-wished-date"
                    />
                    {showError("wishedDate") && <FieldError t={t} />}
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
                      onBlur={() => markTouched("surgeryDurationMinutes")}
                      aria-invalid={showError("surgeryDurationMinutes") || undefined}
                      className={showError("surgeryDurationMinutes") ? "border-destructive" : undefined}
                      data-testid="input-surgery-duration"
                    />
                    {showError("surgeryDurationMinutes") && (
                      <FieldError t={t} />
                    )}
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
              </div>

              {/* Procedure — entire group only renders for full requests */}
              {!values.isReservationOnly && (
                <div data-subgroup="procedure" className="space-y-3 pt-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {t("subgroup.procedure")}
                  </div>
                  <div className="space-y-2">
                    <Label>{t("surgeryName")} *</Label>

                    {chopMode === "search" ? (
                      <>
                        <Popover open={chopOpen} onOpenChange={setChopOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              role="combobox"
                              className={"w-full justify-between font-normal" + (showError("surgeryName") ? " border-destructive" : "")}
                              onBlur={() => markTouched("surgeryName")}
                              aria-invalid={showError("surgeryName") || undefined}
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
                        {showError("surgeryName") && (
                          <FieldError t={t} />
                        )}
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => setChopMode("custom")}
                        >
                          + {t("chopSearch.useFreeText")}
                        </button>
                      </>
                    ) : (
                      <>
                        <Input
                          placeholder={t("chopSearch.useCustom")}
                          value={values.surgeryName}
                          onChange={(e) => {
                            update("surgeryName", e.target.value);
                            update("chopCode", "");
                          }}
                          onBlur={() => markTouched("surgeryName")}
                          aria-invalid={showError("surgeryName") || undefined}
                          className={showError("surgeryName") ? "border-destructive" : undefined}
                          data-testid="input-surgery-name-custom"
                        />
                        {showError("surgeryName") && (
                          <FieldError t={t} />
                        )}
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            if (!values.chopCode) {
                              update("surgeryName", "");
                            }
                            setChopMode("search");
                          }}
                        >
                          ← {t("chopSearch.backToSearch")}
                        </button>
                      </>
                    )}
                  </div>
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
                  <PatientPositionFields
                    patientPosition={values.patientPosition}
                    leftArmPosition={values.leftArmPosition}
                    rightArmPosition={values.rightArmPosition}
                    onPatientPositionChange={(v) => update("patientPosition", v)}
                    onLeftArmPositionChange={(v) => update("leftArmPosition", v)}
                    onRightArmPositionChange={(v) => update("rightArmPosition", v)}
                    testIdPrefix="request-"
                  />
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
                </div>
              )}

              {/* Coverage — entire group only renders for full requests */}
              {!values.isReservationOnly && (
                <div data-subgroup="coverage" className="space-y-3 pt-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {t("subgroup.coverage")}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="coverageType">{t("coverageType")} *</Label>
                    <Select
                      value={values.coverageType || undefined}
                      onValueChange={(v) => update("coverageType", v)}
                    >
                      <SelectTrigger
                        id="coverageType"
                        data-testid="select-coverage-type"
                        onBlur={() => markTouched("coverageType")}
                        aria-invalid={showError("coverageType") || undefined}
                        className={showError("coverageType") ? "border-destructive" : undefined}
                      >
                        <SelectValue placeholder={t("coverageTypePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Selbstzahler">{t("coverageSelbstzahler")}</SelectItem>
                        <SelectItem value="Krankenkasse">{t("coverageKrankenkasse")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {showError("coverageType") && (
                      <FieldError t={t} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stayType">{t("stayType")} *</Label>
                    <Select
                      value={values.stayType || undefined}
                      onValueChange={(v) => update("stayType", v as "ambulant" | "overnight")}
                    >
                      <SelectTrigger
                        id="stayType"
                        data-testid="select-stay-type"
                        onBlur={() => markTouched("stayType")}
                        aria-invalid={showError("stayType") || undefined}
                        className={showError("stayType") ? "border-destructive" : undefined}
                      >
                        <SelectValue placeholder={t("stayTypePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ambulant">{t("stayAmbulant")}</SelectItem>
                        <SelectItem value="overnight">{t("stayOvernight")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {showError("stayType") && (
                      <FieldError t={t} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diagnosis">
                      {t("diagnosis")}
                      {values.coverageType === "Krankenkasse" ? " *" : ""}
                    </Label>
                    <Input
                      id="diagnosis"
                      value={values.diagnosis}
                      onChange={(e) => update("diagnosis", e.target.value)}
                      onBlur={() => markTouched("diagnosis")}
                      aria-invalid={showError("diagnosis") || undefined}
                      className={showError("diagnosis") ? "border-destructive" : undefined}
                    />
                    {showError("diagnosis") && (
                      <FieldError t={t} />
                    )}
                  </div>
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
                  {values.withAnesthesia && (
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
                </div>
              )}

              {/* surgeryNotes — outside any subgroup */}
              <div className="space-y-2">
                <Label htmlFor="surgeryNotes">{t("surgeryNotes")}</Label>
                <Textarea
                  id="surgeryNotes"
                  rows={3}
                  value={values.surgeryNotes}
                  onChange={(e) => update("surgeryNotes", e.target.value)}
                />
              </div>

              {!isLastVisible("surgery") && (
                <>
                  {!sectionValidity.surgery && missingFieldLabels("surgery").length > 0 && touched.size > 0 && (
                    <MissingFieldsCallout
                      testId="missing-fields-callout-surgery"
                      label={t("missingFields")}
                      names={missingFieldLabels("surgery")}
                    />
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => advanceFrom("surgery")}
                      data-testid="button-continue-surgery"
                    >
                      {t("accordion.continue")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* ─── Section 3: Patient details (hidden in reservation-only mode) ── */}
        {!values.isReservationOnly && (
        <AccordionItem value="patient">
          <AccordionTrigger>
            <span className={triggerLabelClass("patient")}>
              {sectionIcon("patient")}
              {t("accordion.patient")}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2" data-section="patient">
              <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="patientFirstName">{t("firstName")} *</Label>
                      <Input
                        id="patientFirstName"
                        value={values.patientFirstName}
                        onChange={(e) => update("patientFirstName", e.target.value)}
                        onBlur={() => markTouched("patientFirstName")}
                        aria-invalid={showError("patientFirstName") || undefined}
                        className={showError("patientFirstName") ? "border-destructive" : undefined}
                        data-testid="input-patient-first-name"
                      />
                      {showError("patientFirstName") && (
                        <FieldError t={t} />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patientLastName">{t("lastName")} *</Label>
                      <Input
                        id="patientLastName"
                        value={values.patientLastName}
                        onChange={(e) => update("patientLastName", e.target.value)}
                        onBlur={() => markTouched("patientLastName")}
                        aria-invalid={showError("patientLastName") || undefined}
                        className={showError("patientLastName") ? "border-destructive" : undefined}
                        data-testid="input-patient-last-name"
                      />
                      {showError("patientLastName") && (
                        <FieldError t={t} />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientBirthday">{t("birthday")} *</Label>
                    <FlexibleDateInput
                      value={values.patientBirthday}
                      onChange={(v) => update("patientBirthday", v)}
                      onBlur={() => markTouched("patientBirthday")}
                      aria-invalid={showError("patientBirthday") || undefined}
                      className={showError("patientBirthday") ? "border-destructive" : undefined}
                    />
                    {showError("patientBirthday") && (
                      <FieldError t={t} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="patientPhone">
                      <Phone className="h-4 w-4 inline mr-1" />
                      {t("phone")} *
                    </Label>
                    <div onBlur={() => markTouched("patientPhone")}>
                      <PhoneInputWithCountry
                        id="patientPhone"
                        value={values.patientPhone}
                        onChange={(v) => update("patientPhone", v)}
                        className={showError("patientPhone") ? "border-destructive" : undefined}
                      />
                    </div>
                    {showError("patientPhone") && (
                      <FieldError t={t} />
                    )}
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
                        onBlur={() => markTouched("patientStreet")}
                        aria-invalid={showError("patientStreet") || undefined}
                        className={showError("patientStreet") ? "border-destructive" : undefined}
                      />
                      {showError("patientStreet") && (
                        <FieldError t={t} />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="patientPostalCode">{t("postalCode")} *</Label>
                      <Input
                        id="patientPostalCode"
                        value={values.patientPostalCode}
                        onChange={(e) => update("patientPostalCode", e.target.value)}
                        onBlur={() => markTouched("patientPostalCode")}
                        aria-invalid={showError("patientPostalCode") || undefined}
                        className={showError("patientPostalCode") ? "border-destructive" : undefined}
                      />
                      {showError("patientPostalCode") && (
                        <FieldError t={t} />
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="patientCity">{t("city")} *</Label>
                      <Input
                        id="patientCity"
                        value={values.patientCity}
                        onChange={(e) => update("patientCity", e.target.value)}
                        onBlur={() => markTouched("patientCity")}
                        aria-invalid={showError("patientCity") || undefined}
                        className={showError("patientCity") ? "border-destructive" : undefined}
                      />
                      {showError("patientCity") && (
                        <FieldError t={t} />
                      )}
                    </div>
                  </div>

              {!isLastVisible("patient") && (
                <>
                  {!sectionValidity.patient && missingFieldLabels("patient").length > 0 && touched.size > 0 && (
                    <MissingFieldsCallout
                      testId="missing-fields-callout-patient"
                      label={t("missingFields")}
                      names={missingFieldLabels("patient")}
                    />
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={() => advanceFrom("patient")}
                      data-testid="button-continue-patient"
                    >
                      {t("accordion.continue")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
        )}

        {/* ─── Section 4: Documents (hidden in reservation-only mode) ──── */}
        {!values.isReservationOnly && (
        <AccordionItem value="documents">
          <AccordionTrigger>
            <span className={triggerLabelClass("documents")}>
              {sectionIcon("documents")}
              {t("accordion.documents")}
              <span className="text-xs text-muted-foreground">({t("optional")})</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 pt-2" data-section="documents">
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

      <div className="flex flex-col gap-2 pt-2">
        {!canSubmit && missingFieldLabels("all").length > 0 && touched.size > 0 && (
          <MissingFieldsCallout
            testId="missing-fields-callout-submit"
            label={t("missingFields")}
            names={missingFieldLabels("all")}
          />
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            data-testid="button-submit-surgery-request"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}
