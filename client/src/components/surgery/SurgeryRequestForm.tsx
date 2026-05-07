/**
 * SurgeryRequestForm
 * Shared form for submitting an external/portal surgery request.
 *
 * Designed primarily for the in-portal surgeon-portal use case (where the
 * authenticated surgeon's identity is resolved server-side from the session).
 * The legacy public form at /pages/ExternalSurgeryRequest.tsx is intentionally
 * NOT migrated here in this task — its multi-step wizard, S3 file upload flow,
 * i18next-based translations and CHOP search popover are tightly coupled to the
 * page's state machine. Forcing them into a shared component would risk
 * regressing the public form. Task 9 will retire the public page anyway.
 *
 * The component is presentation-only:
 *   - All translations are passed in via the t() prop (no i18next dependency).
 *   - Submission, queryClient invalidation and toast are owned by the parent.
 *   - The optional "Operating surgeon" picker is rendered only when
 *     availableSurgeons.length > 1 (i.e. the caller is a praxis with at least
 *     one linked child surgeon).
 *   - Setting showSurgeonDetailsBlock=true also renders the legacy
 *     firstName/lastName/email/phone block — kept as a hook for the public
 *     form if/when it is migrated.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, Mail, Phone } from "lucide-react";

export type AvailableSurgeon = {
  id: string;
  firstName: string | null;
  lastName: string | null;
};

export interface SurgeryRequestFormValues {
  surgeonFirstName: string;
  surgeonLastName: string;
  surgeonEmail: string;
  surgeonPhone: string;

  surgeryName: string;
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
}

export interface SurgeryRequestFormProps {
  /**
   * List of surgeons the authenticated portal user can submit on behalf of.
   * The parent decides what goes in this list (e.g. children-only for praxes).
   */
  availableSurgeons: AvailableSurgeon[];
  selectedSurgeonId: string;
  onSelectedSurgeonIdChange: (id: string) => void;

  /**
   * Whether to render the "Operating surgeon" picker. Decoupled from
   * availableSurgeons.length so the parent can show a picker even when
   * there's only one option (e.g. a praxis with a single linked child still
   * needs to see *which* child the request goes to).
   */
  showSurgeonPicker: boolean;

  /**
   * Whether to render the legacy "your details" block (firstName, lastName,
   * email, phone). The in-portal form passes false because the surgeon is
   * resolved from the session. Kept as a prop so the public form could be
   * migrated to this component without losing the block.
   */
  showSurgeonDetailsBlock: boolean;

  /** Translations + locale (locale is currently informational; reserved for future date formatting). */
  t: (key: string) => string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  locale: "de" | "en";

  onSubmit: (values: SurgeryRequestFormValues) => void | Promise<void>;
  isSubmitting: boolean;

  /** Optional initial values (e.g. patient name pre-fill). */
  initialValues?: Partial<SurgeryRequestFormValues>;
}

const DEFAULT_VALUES: SurgeryRequestFormValues = {
  surgeonFirstName: "",
  surgeonLastName: "",
  surgeonEmail: "",
  surgeonPhone: "",
  surgeryName: "",
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
};

function formatTimeMins(mins: number | null): string {
  if (mins == null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function parseTimeInput(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
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
}: SurgeryRequestFormProps) {
  const [values, setValues] = useState<SurgeryRequestFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
  }));

  // Apply initialValues if they arrive after first render (e.g. async pre-fill).
  useEffect(() => {
    if (!initialValues) return;
    setValues((prev) => ({ ...prev, ...initialValues }));
    // We intentionally only re-apply when the *reference* changes — mirror
    // controlled-component conventions; callers should memoize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues]);

  const update = <K extends keyof SurgeryRequestFormValues>(
    field: K,
    value: SurgeryRequestFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const isValid = (): boolean => {
    if (!values.wishedDate) return false;
    if (
      values.surgeryDurationMinutes < 5 ||
      values.surgeryDurationMinutes > 720
    ) {
      return false;
    }
    if (!values.coverageType) return false;
    if (!values.stayType) return false;

    if (!values.isReservationOnly) {
      if (!values.surgeryName) return false;
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
      if (values.coverageType === "Krankenkasse" && !values.diagnosis) {
        return false;
      }
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

    if (showSurgeonPicker && !selectedSurgeonId) return false;

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid() || isSubmitting) return;
    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Operating surgeon picker (praxis with linked children) */}
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

      {/* Legacy surgeon-details block (public form path) */}
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

      {/* Reservation-only toggle */}
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

      {/* Surgery details */}
      {!values.isReservationOnly && (
        <div className="space-y-2">
          <Label htmlFor="surgeryName">{t("surgeryName")} *</Label>
          <Input
            id="surgeryName"
            value={values.surgeryName}
            onChange={(e) => update("surgeryName", e.target.value)}
            data-testid="input-surgery-name"
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
              update(
                "surgeryDurationMinutes",
                parseInt(e.target.value) || 60,
              )
            }
            data-testid="input-surgery-duration"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wishedTimeFrom">{t("preferredTimeFrom")}</Label>
          <Input
            id="wishedTimeFrom"
            type="time"
            value={formatTimeMins(values.wishedTimeFrom)}
            onChange={(e) =>
              update("wishedTimeFrom", parseTimeInput(e.target.value))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wishedTimeTo">{t("preferredTimeTo")}</Label>
          <Input
            id="wishedTimeTo"
            type="time"
            value={formatTimeMins(values.wishedTimeTo)}
            onChange={(e) =>
              update("wishedTimeTo", parseTimeInput(e.target.value))
            }
          />
        </div>
      </div>

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

      <div className="space-y-2">
        <Label htmlFor="stayType">{t("stayType")} *</Label>
        <Select
          value={values.stayType || undefined}
          onValueChange={(v) =>
            update("stayType", v as "ambulant" | "overnight")
          }
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

      {/* Patient block — required only for non-reservation submissions */}
      {!values.isReservationOnly && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h3 className="font-medium text-sm">{t("patientInformation")}</h3>
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
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={!isValid() || isSubmitting}
          data-testid="button-submit-surgery-request"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
