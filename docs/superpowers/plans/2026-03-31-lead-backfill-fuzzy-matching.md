# Lead Backfill Fuzzy Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant lead backfill with a fuzzy matching + side-by-side confirmation UI so the user can visually review Excel data vs in-app patient data before approving each match.

**Architecture:** New server endpoint `/fuzzy-match` computes similarity scores using existing dedup functions, returns ranked candidates per lead. Modified backfill endpoint accepts explicit approved pairs. New UI section in LeadConversion shows match cards with approve/decline buttons.

**Tech Stack:** React, shadcn/ui, Drizzle ORM, existing `calculateNameSimilarity` + `normalizePhoneForMatching` utilities.

---

### Task 1: Server — New fuzzy-match endpoint

**Files:**
- Modify: `server/routes/business.ts` (add new route after line ~2325, before the existing backfill route)

- [ ] **Step 1: Add import for dedup functions**

At top of `server/routes/business.ts`, add import:

```typescript
import { calculateNameSimilarity, normalizeName } from "../services/patientDeduplication";
```

- [ ] **Step 2: Add the fuzzy-match schema and endpoint**

Insert before the existing `backfill-referrals` route (line ~2325):

```typescript
// Fuzzy match leads to patients (preview before backfill)
const fuzzyMatchSchema = z.object({
  leads: z.array(z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    leadDate: z.string().optional(),
    adSource: z.string().optional(),
    metaLeadId: z.string().optional(),
    metaFormId: z.string().optional(),
    operation: z.string().optional(),
    status: z.string().optional(),
  })).min(1).max(5000),
});

router.post('/api/business/:hospitalId/lead-conversion/fuzzy-match', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { leads } = fuzzyMatchSchema.parse(req.body);

    // 1. Fetch all non-archived patients
    const allPatients = await db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        surname: patients.surname,
        email: patients.email,
        phone: patients.phone,
        dateOfBirth: patients.dateOfBirth,
      })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
      ));

    // 2. Fetch appointment dates for all patients (most recent non-cancelled)
    const allPatientIds = allPatients.map(p => p.id);
    const appointmentData = allPatientIds.length > 0
      ? await db
          .select({
            patientId: clinicAppointments.patientId,
            date: clinicAppointments.date,
          })
          .from(clinicAppointments)
          .where(and(
            eq(clinicAppointments.hospitalId, hospitalId),
            inArray(clinicAppointments.patientId, allPatientIds),
            sql`${clinicAppointments.status} != 'cancelled'`,
          ))
      : [];

    // Build latest appointment date per patient
    const latestApptByPatient = new Map<string, string>();
    for (const a of appointmentData) {
      if (a.patientId && a.date) {
        const dateStr = typeof a.date === 'string' ? a.date : new Date(a.date).toISOString().slice(0, 10);
        const existing = latestApptByPatient.get(a.patientId);
        if (!existing || dateStr > existing) {
          latestApptByPatient.set(a.patientId, dateStr);
        }
      }
    }

    // 3. For each lead with adSource, find fuzzy candidates
    const MIN_CONFIDENCE = 0.50;
    const results: Array<{
      leadIndex: number;
      lead: typeof leads[0];
      candidates: Array<{
        patientId: string;
        firstName: string;
        surname: string;
        phone: string | null;
        email: string | null;
        dateOfBirth: string | null;
        nextAppointmentDate: string | null;
        confidence: number;
        reasons: string[];
        missingFields: string[];
      }>;
    }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead.adSource) continue;

      const leadFullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      const leadPhone = lead.phone ? normalizePhoneForMatching(lead.phone) : null;
      const leadEmail = lead.email ? lead.email.trim().toLowerCase() : null;

      const candidates: typeof results[0]['candidates'] = [];

      for (const p of allPatients) {
        let confidence = 0;
        const reasons: string[] = [];

        // Name similarity
        const patientFullName = [p.firstName, p.surname].filter(Boolean).join(' ');
        if (leadFullName && patientFullName) {
          const nameSim = calculateNameSimilarity(leadFullName, patientFullName);
          // Also try swapped name order
          const swappedName = [lead.lastName, lead.firstName].filter(Boolean).join(' ');
          const swappedSim = swappedName ? calculateNameSimilarity(swappedName, patientFullName) : 0;
          const bestNameSim = Math.max(nameSim, swappedSim);

          if (bestNameSim >= 0.5) {
            confidence = bestNameSim;
            if (bestNameSim >= 0.95) {
              reasons.push('Exact name match');
            } else if (swappedSim > nameSim) {
              reasons.push(`Name match ${Math.round(bestNameSim * 100)}% (swapped)`);
            } else {
              reasons.push(`Name similarity ${Math.round(bestNameSim * 100)}%`);
            }
          }
        }

        // Phone match
        if (leadPhone && leadPhone.length >= 8 && p.phone) {
          const patientPhone = normalizePhoneForMatching(p.phone);
          if (patientPhone.length >= 8 && leadPhone === patientPhone) {
            confidence = Math.min(1.0, confidence + 0.15);
            reasons.push('Phone match');
          }
        }

        // Email match
        if (leadEmail && p.email) {
          const patientEmail = p.email.trim().toLowerCase();
          if (leadEmail === patientEmail) {
            confidence = Math.min(1.0, confidence + 0.15);
            reasons.push('Email match');
          }
        }

        if (confidence >= MIN_CONFIDENCE) {
          // Determine missing fields
          const missingFields: string[] = [];
          if (lead.phone && !p.phone) missingFields.push('phone');
          if (lead.email && !p.email) missingFields.push('email');

          candidates.push({
            patientId: p.id,
            firstName: p.firstName,
            surname: p.surname,
            phone: p.phone,
            email: p.email,
            dateOfBirth: p.dateOfBirth ? (typeof p.dateOfBirth === 'string' ? p.dateOfBirth : new Date(p.dateOfBirth).toISOString().slice(0, 10)) : null,
            nextAppointmentDate: latestApptByPatient.get(p.id) || null,
            confidence: Math.round(confidence * 100) / 100,
            reasons,
            missingFields,
          });
        }
      }

      if (candidates.length > 0) {
        // Sort by confidence descending
        candidates.sort((a, b) => b.confidence - a.confidence);
        // Limit to top 5 candidates per lead
        results.push({ leadIndex: i, lead, candidates: candidates.slice(0, 5) });
      }
    }

    res.json({ matches: results });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid lead data', details: error.errors });
    }
    logger.error('[Business] Error in fuzzy match:', error);
    res.status(500).json({ message: 'Failed to fuzzy match leads' });
  }
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No errors related to the new endpoint.

- [ ] **Step 4: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat(leads): add fuzzy-match endpoint for lead backfill preview"
```

---

### Task 2: Server — Modify backfill endpoint to accept approved pairs + fill missing patient data

**Files:**
- Modify: `server/routes/business.ts` (existing backfill-referrals route, lines ~2325-2606)

- [ ] **Step 1: Add a new schema for approved-pair backfill**

Add above the existing backfill route:

```typescript
const approvedBackfillSchema = z.object({
  approvedMatches: z.array(z.object({
    leadIndex: z.number(),
    patientId: z.string(),
    lead: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      leadDate: z.string().optional(),
      adSource: z.string().optional(),
      metaLeadId: z.string().optional(),
      metaFormId: z.string().optional(),
    }),
    fillMissingData: z.boolean().default(true),
  })).min(1).max(5000),
});
```

- [ ] **Step 2: Replace the backfill-referrals route body**

Replace the entire route handler for `POST /api/business/:hospitalId/lead-conversion/backfill-referrals` with the following. The key changes are:
1. Accept `approvedMatches` instead of `leads`
2. Use provided `patientId` directly instead of re-matching
3. Fill missing patient data (phone, email) when `fillMissingData` is true

```typescript
router.post('/api/business/:hospitalId/lead-conversion/backfill-referrals', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { approvedMatches } = approvedBackfillSchema.parse(req.body);

    logger.warn(`[AUDIT] Referral backfill by user=${req.user.id} email=${req.user.email} hospital=${hospitalId} approved=${approvedMatches.length}`);

    // 1. Fill missing patient data
    let patientUpdates = 0;
    for (const match of approvedMatches) {
      if (!match.fillMissingData) continue;

      const [patient] = await db
        .select({ phone: patients.phone, email: patients.email })
        .from(patients)
        .where(and(eq(patients.id, match.patientId), eq(patients.hospitalId, hospitalId)))
        .limit(1);

      if (!patient) continue;

      const updates: Record<string, string> = {};
      if (match.lead.phone && !patient.phone) updates.phone = match.lead.phone;
      if (match.lead.email && !patient.email) updates.email = match.lead.email;

      if (Object.keys(updates).length > 0) {
        await db.update(patients).set(updates).where(eq(patients.id, match.patientId));
        patientUpdates++;
      }
    }

    // 2. Get appointments for all matched patients
    const patientIds = [...new Set(approvedMatches.map(m => m.patientId))];
    const appointmentData = patientIds.length > 0
      ? await db
          .select({
            id: clinicAppointments.id,
            patientId: clinicAppointments.patientId,
          })
          .from(clinicAppointments)
          .where(and(
            eq(clinicAppointments.hospitalId, hospitalId),
            inArray(clinicAppointments.patientId, patientIds),
            sql`${clinicAppointments.status} != 'cancelled'`,
          ))
      : [];

    const appointmentIdsByPatient = new Map<string, string[]>();
    const allAppointmentIds: string[] = [];
    for (const a of appointmentData) {
      if (a.patientId) {
        if (!appointmentIdsByPatient.has(a.patientId)) appointmentIdsByPatient.set(a.patientId, []);
        appointmentIdsByPatient.get(a.patientId)!.push(a.id);
        allAppointmentIds.push(a.id);
      }
    }

    // 3. Find existing referral events
    const existingReferrals = allAppointmentIds.length > 0
      ? await db
          .select({
            id: referralEvents.id,
            appointmentId: referralEvents.appointmentId,
            captureMethod: referralEvents.captureMethod,
            createdAt: referralEvents.createdAt,
          })
          .from(referralEvents)
          .where(and(
            eq(referralEvents.hospitalId, hospitalId),
            inArray(referralEvents.appointmentId, allAppointmentIds),
          ))
      : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const referralByAppointment = new Map<string, { id: string; captureMethod: string; isToday: boolean }>();
    for (const r of existingReferrals) {
      if (r.appointmentId) {
        const createdDate = r.createdAt ? new Date(r.createdAt) : null;
        const isToday = createdDate ? createdDate >= today : false;
        referralByAppointment.set(r.appointmentId, { id: r.id, captureMethod: r.captureMethod, isToday });
      }
    }

    // 3b. Patient-level referrals (no appointment)
    const existingPatientReferrals = patientIds.length > 0
      ? await db
          .select({
            id: referralEvents.id,
            patientId: referralEvents.patientId,
            captureMethod: referralEvents.captureMethod,
            createdAt: referralEvents.createdAt,
          })
          .from(referralEvents)
          .where(and(
            eq(referralEvents.hospitalId, hospitalId),
            inArray(referralEvents.patientId, patientIds),
            sql`${referralEvents.appointmentId} IS NULL`,
            eq(referralEvents.captureMethod, 'staff'),
          ))
      : [];
    const patientLevelReferral = new Map<string, { id: string; isToday: boolean }>();
    for (const r of existingPatientReferrals) {
      if (r.patientId) {
        const createdDate = r.createdAt ? new Date(r.createdAt) : null;
        const isToday = createdDate ? createdDate >= today : false;
        patientLevelReferral.set(r.patientId, { id: r.id, isToday });
      }
    }

    // 4. Parse lead date helper
    const parseLeadDate = (dateStr?: string): Date | null => {
      if (!dateStr) return null;
      const v = dateStr.trim();
      const dotMatch = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (dotMatch) return new Date(parseInt(dotMatch[3]), parseInt(dotMatch[2]) - 1, parseInt(dotMatch[1]));
      const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      return null;
    };

    // 5. Build referral inserts/updates
    const toInsert: {
      hospitalId: string;
      patientId: string;
      appointmentId?: string;
      source: "social" | "search_engine";
      sourceDetail: string;
      captureMethod: "staff";
      createdAt: Date;
      metaLeadId?: string;
      metaFormId?: string;
    }[] = [];
    const toUpdate: { id: string; source: "social" | "search_engine"; sourceDetail: string; createdAt: Date; metaLeadId?: string; metaFormId?: string }[] = [];
    const handledAppointments = new Set<string>();
    const handledPatients = new Set<string>();

    for (const match of approvedMatches) {
      const lead = match.lead;
      const isGoogle = lead.adSource === 'gg';
      const source = isGoogle ? 'search_engine' as const : 'social' as const;
      const sourceDetail = isGoogle ? 'Google Ads' : lead.adSource === 'ig' ? 'Instagram' : 'Facebook';
      const leadDate = parseLeadDate(lead.leadDate) || new Date();
      const patientId = match.patientId;

      const apptIds = appointmentIdsByPatient.get(patientId) || [];

      if (apptIds.length > 0) {
        for (const apptId of apptIds) {
          if (handledAppointments.has(apptId)) continue;
          handledAppointments.add(apptId);

          const existing = referralByAppointment.get(apptId);
          if (!existing) {
            toInsert.push({
              hospitalId,
              patientId,
              appointmentId: apptId,
              source,
              sourceDetail,
              captureMethod: "staff",
              createdAt: leadDate,
              ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}),
              ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}),
            });
          } else if (existing.captureMethod === 'staff' && existing.isToday) {
            toUpdate.push({ id: existing.id, source, sourceDetail, createdAt: leadDate, ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}), ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}) });
          }
        }
      } else {
        if (handledPatients.has(patientId)) continue;
        handledPatients.add(patientId);

        const existing = patientLevelReferral.get(patientId);
        if (!existing) {
          toInsert.push({
            hospitalId,
            patientId,
            source,
            sourceDetail,
            captureMethod: "staff",
            createdAt: leadDate,
            ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}),
            ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}),
          });
        } else if (existing.isToday) {
          toUpdate.push({ id: existing.id, source, sourceDetail, createdAt: leadDate, ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}), ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}) });
        }
      }
    }

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        await db.insert(referralEvents).values(batch);
      }
    }

    if (toUpdate.length > 0) {
      for (const upd of toUpdate) {
        await db.update(referralEvents)
          .set({
            source: upd.source,
            sourceDetail: upd.sourceDetail,
            createdAt: upd.createdAt,
            ...(upd.metaLeadId ? { metaLeadId: upd.metaLeadId } : {}),
            ...(upd.metaFormId ? { metaFormId: upd.metaFormId } : {}),
          })
          .where(eq(referralEvents.id, upd.id));
      }
    }

    logger.info(`[Business] Referral backfill: created ${toInsert.length}, updated ${toUpdate.length}, patient data filled ${patientUpdates} for hospital=${hospitalId}`);

    res.json({ created: toInsert.length, updated: toUpdate.length, patientUpdates });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid data', details: error.errors });
    }
    logger.error('[Business] Error in referral backfill:', error);
    res.status(500).json({ message: 'Failed to backfill referrals' });
  }
});
```

- [ ] **Step 3: Run TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/business.ts
git commit -m "feat(leads): modify backfill endpoint to accept approved pairs + fill missing patient data"
```

---

### Task 3: Client — Add fuzzy match types and API calls

**Files:**
- Modify: `client/src/pages/business/LeadConversion.tsx`

- [ ] **Step 1: Add types for fuzzy match response**

After the existing `ConversionResult` type (line ~41), add:

```typescript
type FuzzyCandidate = {
  patientId: string;
  firstName: string;
  surname: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  nextAppointmentDate: string | null;
  confidence: number;
  reasons: string[];
  missingFields: string[];
};

type FuzzyMatchResult = {
  leadIndex: number;
  lead: ParsedLead;
  candidates: FuzzyCandidate[];
};

type ApprovedMatch = {
  leadIndex: number;
  patientId: string;
  lead: ParsedLead;
  fillMissingData: boolean;
};
```

- [ ] **Step 2: Add state variables for the fuzzy match flow**

Inside `LeadConversionTab`, after the existing state variables (line ~178), add:

```typescript
const [fuzzyMatches, setFuzzyMatches] = useState<FuzzyMatchResult[]>([]);
const [isFuzzyLoading, setIsFuzzyLoading] = useState(false);
// Map of leadIndex -> selected patientId (or 'declined')
const [matchDecisions, setMatchDecisions] = useState<Map<number, string>>(new Map());
```

- [ ] **Step 3: Add the fuzzy match handler**

After `handleAnalyze`, add:

```typescript
const handleFuzzyMatch = async () => {
  if (!hospitalId || !rawText.trim()) return;

  const leads = parseLeads(rawText);
  if (leads.length === 0) return;

  setIsFuzzyLoading(true);
  try {
    const res = await apiRequest("POST", `/api/business/${hospitalId}/lead-conversion/fuzzy-match`, { leads });
    const data = await res.json();
    setFuzzyMatches(data.matches || []);
    setMatchDecisions(new Map());
  } catch (error: any) {
    toast({ title: "Fuzzy match failed", description: error.message || "Could not match leads", variant: "destructive" });
  } finally {
    setIsFuzzyLoading(false);
  }
};
```

- [ ] **Step 4: Replace handleBackfillReferrals to use approved matches**

Replace the existing `handleBackfillReferrals` function with:

```typescript
const handleBackfillReferrals = async () => {
  if (!hospitalId) return;

  // Build approved matches from decisions
  const approvedMatches: ApprovedMatch[] = [];
  for (const match of fuzzyMatches) {
    const decision = matchDecisions.get(match.leadIndex);
    if (decision && decision !== 'declined') {
      approvedMatches.push({
        leadIndex: match.leadIndex,
        patientId: decision,
        lead: match.lead,
        fillMissingData: true,
      });
    }
  }

  if (approvedMatches.length === 0) {
    toast({ title: "No matches approved", description: "Approve at least one match before backfilling.", variant: "destructive" });
    return;
  }

  setIsBackfilling(true);
  try {
    const res = await apiRequest("POST", `/api/business/${hospitalId}/lead-conversion/backfill-referrals`, { approvedMatches });
    const data = await res.json();
    setBackfillDone(true);
    setFuzzyMatches([]);
    toast({
      title: t("business.leads.referralsBackfilled", "Referrals Backfilled"),
      description: `${data.created} created, ${data.updated} updated, ${data.patientUpdates || 0} patient records enriched.`,
    });
    if (result) {
      setResult({ ...result, backfillEligibleCount: 0 });
    }
  } catch (error: any) {
    toast({ title: "Backfill failed", description: error.message || "Could not backfill referrals", variant: "destructive" });
  } finally {
    setIsBackfilling(false);
  }
};
```

- [ ] **Step 5: Add helper for approving/declining and bulk approve**

```typescript
const handleMatchDecision = (leadIndex: number, patientId: string | 'declined') => {
  setMatchDecisions(prev => {
    const next = new Map(prev);
    next.set(leadIndex, patientId);
    return next;
  });
};

const approvedCount = Array.from(matchDecisions.values()).filter(v => v !== 'declined').length;

const handleApproveAllHighConfidence = () => {
  setMatchDecisions(prev => {
    const next = new Map(prev);
    for (const match of fuzzyMatches) {
      if (!next.has(match.leadIndex) && match.candidates[0]?.confidence >= 0.90) {
        next.set(match.leadIndex, match.candidates[0].patientId);
      }
    }
    return next;
  });
};
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/business/LeadConversion.tsx
git commit -m "feat(leads): add fuzzy match types, state, and handlers"
```

---

### Task 4: Client — Build the Review Matches UI

**Files:**
- Modify: `client/src/pages/business/LeadConversion.tsx`

- [ ] **Step 1: Add new icon imports**

Update the lucide-react import to add `UserCheck`, `UserX`, `Search`, `Zap`:

```typescript
import { Loader2, Upload, Users, Calendar, Scissors, CheckCircle2, XCircle, ArrowRight, AlertTriangle, Download, LinkIcon, UserCheck, UserX, Search, Zap } from "lucide-react";
```

Also add RadioGroup imports:

```typescript
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
```

- [ ] **Step 2: Replace the old backfill card with the new Review Matches section**

Replace the entire referral backfill section (the block starting with `{result.backfillEligibleCount > 0 && !backfillDone && (` through its closing `)}` — lines ~371-401) with:

```typescript
{/* Fuzzy match review */}
{result.backfillEligibleCount > 0 && !backfillDone && fuzzyMatches.length === 0 && (
  <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
    <CardContent className="py-4 flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <Search className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">
            {t("business.leads.backfillTitle", "{{count}} leads eligible for referral backfill", { count: result.backfillEligibleCount })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("business.leads.fuzzyMatchDesc", "Find matching patients using fuzzy name, phone, and email matching. Review each match before backfilling.")}
          </p>
        </div>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={handleFuzzyMatch}
        disabled={isFuzzyLoading}
        className="shrink-0"
      >
        {isFuzzyLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Search className="h-4 w-4 mr-1" />
            {t("business.leads.findMatches", "Find Matches")}
          </>
        )}
      </Button>
    </CardContent>
  </Card>
)}

{/* Review matches */}
{fuzzyMatches.length > 0 && !backfillDone && (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t("business.leads.reviewMatches", "Review Matches")} ({fuzzyMatches.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApproveAllHighConfidence}
          >
            <Zap className="h-3 w-3 mr-1" />
            {t("business.leads.approveHighConfidence", "Auto-approve >=90%")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleBackfillReferrals}
            disabled={isBackfilling || approvedCount === 0}
          >
            {isBackfilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserCheck className="h-4 w-4 mr-1" />
                {t("business.leads.backfillApproved", "Backfill Approved ({{count}})", { count: approvedCount })}
              </>
            )}
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <ScrollArea className="max-h-[600px]">
        <div className="space-y-3">
          {fuzzyMatches.map((match, idx) => {
            const decision = matchDecisions.get(match.leadIndex);
            const isDeclined = decision === 'declined';
            const selectedPatientId = decision && decision !== 'declined' ? decision : null;

            return (
              <div
                key={match.leadIndex}
                className={`border rounded-lg p-4 transition-colors ${
                  isDeclined
                    ? 'opacity-50 bg-muted/30'
                    : selectedPatientId
                    ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20'
                    : 'border-border'
                }`}
              >
                {/* Header with lead info */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                    <span className="font-medium text-sm">
                      {[match.lead.firstName, match.lead.lastName].filter(Boolean).join(' ') || 'Unknown'}
                    </span>
                    {match.lead.adSource && (
                      <Badge variant="outline" className="text-xs">
                        {match.lead.adSource === 'fb' ? 'Facebook' : match.lead.adSource === 'ig' ? 'Instagram' : match.lead.adSource === 'gg' ? 'Google Ads' : match.lead.adSource}
                      </Badge>
                    )}
                    {match.lead.leadDate && (
                      <span className="text-xs text-muted-foreground">{match.lead.leadDate}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMatchDecision(match.leadIndex, isDeclined ? '' : 'declined')}
                    className={isDeclined ? 'text-muted-foreground' : 'text-destructive hover:text-destructive'}
                  >
                    <UserX className="h-3 w-3 mr-1" />
                    {isDeclined ? 'Undo' : 'Decline all'}
                  </Button>
                </div>

                {/* Candidates */}
                {!isDeclined && (
                  <RadioGroup
                    value={selectedPatientId || ''}
                    onValueChange={(val) => handleMatchDecision(match.leadIndex, val)}
                  >
                    <div className="space-y-2">
                      {match.candidates.map((c) => {
                        const confidencePct = Math.round(c.confidence * 100);
                        const badgeColor = confidencePct >= 90
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : confidencePct >= 70
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';

                        return (
                          <Label
                            key={c.patientId}
                            htmlFor={`match-${match.leadIndex}-${c.patientId}`}
                            className={`flex items-start gap-3 border rounded-md p-3 cursor-pointer transition-colors hover:bg-accent/50 ${
                              selectedPatientId === c.patientId ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/30' : ''
                            }`}
                          >
                            <RadioGroupItem
                              value={c.patientId}
                              id={`match-${match.leadIndex}-${c.patientId}`}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor}`}>
                                  {confidencePct}%
                                </span>
                                {c.reasons.map((r, ri) => (
                                  <span key={ri} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                    {r}
                                  </span>
                                ))}
                              </div>
                              {/* Side-by-side comparison */}
                              <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">From Excel</p>
                                  <p className="font-medium">{[match.lead.firstName, match.lead.lastName].filter(Boolean).join(' ')}</p>
                                  <p className="text-muted-foreground">{match.lead.phone || '\u2014'}</p>
                                  <p className="text-muted-foreground">{match.lead.email || '\u2014'}</p>
                                  {match.lead.leadDate && (
                                    <p className="text-muted-foreground text-xs mt-1">Lead: {match.lead.leadDate}</p>
                                  )}
                                  {match.lead.metaLeadId && (
                                    <p className="text-muted-foreground text-xs">ID: {match.lead.metaLeadId.slice(0, 10)}...</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Patient in App</p>
                                  <p className="font-medium">{c.firstName} {c.surname}</p>
                                  <p className="text-muted-foreground">{c.phone || '\u2014'}</p>
                                  <p className="text-muted-foreground">{c.email || '\u2014'}</p>
                                  {c.dateOfBirth && (
                                    <p className="text-muted-foreground text-xs mt-1">DOB: {c.dateOfBirth}</p>
                                  )}
                                  {c.nextAppointmentDate && (
                                    <p className="text-muted-foreground text-xs">Appt: {c.nextAppointmentDate}</p>
                                  )}
                                </div>
                              </div>
                              {/* Missing fields note */}
                              {c.missingFields.length > 0 && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                  Will add from Excel: {c.missingFields.join(', ')}
                                </p>
                              )}
                            </div>
                          </Label>
                        );
                      })}
                    </div>
                  </RadioGroup>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Also reset fuzzy state when re-analyzing**

In `handleAnalyze`, after `setBackfillDone(false);` (line ~190), add:

```typescript
setFuzzyMatches([]);
setMatchDecisions(new Map());
```

- [ ] **Step 4: Run TypeScript check**

Run: `npm run check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/business/LeadConversion.tsx
git commit -m "feat(leads): add fuzzy match review UI with side-by-side comparison and approve/decline"
```

---

### Task 5: Manual smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to Lead Conversion tab**

Go to the Marketing/Business section, Lead Conversion tab. Paste test data including bare phone numbers like:

```
41793990917	Raquel	Andrade da costa	fb	12.01.2026
41788466451	Aida	ciciarelli	fb	15.01.2026
Helena	Pelizzatti	ig	20.02.2026
```

- [ ] **Step 3: Test the flow**

1. Click "Analyze Leads" — verify funnel shows, "Find Matches" button appears
2. Click "Find Matches" — verify match cards appear with side-by-side data
3. Verify confidence badges show correct colors (green/blue/amber)
4. Verify "Will add from Excel: email/phone" notes appear where patient is missing data
5. Approve some matches, decline others
6. Click "Auto-approve >=90%" — verify high-confidence matches get selected
7. Click "Backfill Approved (N)" — verify success toast with counts
8. Verify backfilled referrals appear in Referrals tab

- [ ] **Step 4: Run lint + typecheck**

```bash
npm run check
```

- [ ] **Step 5: Commit any fixes**

If any issues found, fix and commit.
