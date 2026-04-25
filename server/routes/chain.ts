import { Router, type Response } from "express";
import { db } from "../db";
import {
  hospitals,
  hospitalGroups,
  treatments,
  treatmentLines,
  surgeries,
  leads,
  clinicAppointments,
  clinicServices,
  flows,
  flowHospitals,
} from "@shared/schema";
import { eq, sql, inArray, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import logger from "../logger";
import { z } from "zod";

export const chainRouter = Router();

/**
 * Chain-admin gate for /api/chain/:groupId/*
 *   Platform admins bypass.
 *   Otherwise: user must have a group_admin role row on a hospital in the group.
 */
async function isChainAdminForGroup(req: any, res: Response, next: any) {
  try {
    const userId = req.user?.id;
    const { groupId } = req.params;

    const user = await storage.getUser(userId);
    if ((user as any)?.isPlatformAdmin) return next();

    const groupHospitals = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));
    if (groupHospitals.length === 0) {
      return res.status(404).json({ message: "Group not found or empty" });
    }
    const groupHospitalIds = groupHospitals.map(h => h.id);

    const userRoles = await storage.getUserHospitals(userId);
    const hasGroupAdmin = userRoles.some(r =>
      r.role === "group_admin" && groupHospitalIds.includes(r.id)
    );
    if (!hasGroupAdmin) {
      return res.status(403).json({ message: "Chain admin access required" });
    }
    next();
  } catch (error) {
    logger.error("Error checking chain admin access:", error);
    res.status(500).json({ message: "Failed to verify chain access" });
  }
}

chainRouter.get('/api/chain/:groupId/marketing', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const rangeDays = parseInt((req.query.range as string)?.replace('d', '') || '30', 10);
    const start = new Date();
    start.setDate(start.getDate() - rangeDays);
    const startIso = start.toISOString();

    // Hospitals in the group
    const groupHospitals = await db
      .select({ id: hospitals.id, name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));
    const hospitalIds = groupHospitals.map(h => h.id);
    if (hospitalIds.length === 0) {
      return res.json({ sources: [], locations: [], alerts: [] });
    }
    const idList = sql.join(hospitalIds.map(id => sql`${id}`), sql`, `);

    // Source × Location cells + conversion (first-visit = appointment with status completed|confirmed)
    const cells = await db.execute<{
      hospital_id: string;
      source: string;
      leads: string;
      first_visits: string;
    }>(sql`
      SELECT
        l.hospital_id,
        COALESCE(l.source, 'unknown') AS source,
        COUNT(*) AS leads,
        COUNT(*) FILTER (
          WHERE l.appointment_id IN (
            SELECT id FROM clinic_appointments WHERE status IN ('completed', 'confirmed')
          )
        ) AS first_visits
      FROM leads l
      WHERE l.hospital_id IN (${idList})
        AND l.created_at >= ${startIso}
      GROUP BY l.hospital_id, source
    `);

    // Reshape: sources[].byLocation[] with per-source totals
    type Cell = { hospitalId: string; hospitalName: string; leads: number; firstVisits: number };
    const sourceMap = new Map<string, { name: string; byLocation: Cell[]; totals: { leads: number; firstVisits: number; conversionPct: number } }>();
    const hospitalById = new Map(groupHospitals.map(h => [h.id, h.name]));

    for (const r of cells.rows as any[]) {
      const source = r.source as string;
      const cell: Cell = {
        hospitalId: r.hospital_id,
        hospitalName: hospitalById.get(r.hospital_id) ?? "Unknown",
        leads: parseInt(r.leads) || 0,
        firstVisits: parseInt(r.first_visits) || 0,
      };
      if (!sourceMap.has(source)) {
        sourceMap.set(source, { name: source, byLocation: [], totals: { leads: 0, firstVisits: 0, conversionPct: 0 } });
      }
      const entry = sourceMap.get(source)!;
      entry.byLocation.push(cell);
      entry.totals.leads += cell.leads;
      entry.totals.firstVisits += cell.firstVisits;
    }

    // Compute conversion per source
    for (const entry of sourceMap.values()) {
      entry.totals.conversionPct = entry.totals.leads > 0
        ? Number(((entry.totals.firstVisits / entry.totals.leads) * 100).toFixed(1))
        : 0;
    }

    // Alerts: flag sources with lead volume dropping ≥ 20% vs prior period
    const prevStart = new Date();
    prevStart.setDate(prevStart.getDate() - rangeDays * 2);
    const prevStartIso = prevStart.toISOString();
    const prevCells = await db.execute<{ source: string; leads: string }>(sql`
      SELECT COALESCE(l.source, 'unknown') AS source, COUNT(*) AS leads
      FROM leads l
      WHERE l.hospital_id IN (${idList})
        AND l.created_at >= ${prevStartIso}
        AND l.created_at < ${startIso}
      GROUP BY source
    `);
    const prevBySource = new Map((prevCells.rows as any[]).map(r => [r.source, parseInt(r.leads) || 0]));
    const alerts: Array<{ kind: "source_drop"; source: string; currentLeads: number; prevLeads: number; deltaPct: number }> = [];
    for (const entry of sourceMap.values()) {
      const prev = prevBySource.get(entry.name) || 0;
      if (prev === 0) continue;
      const deltaPct = ((entry.totals.leads - prev) / prev) * 100;
      if (deltaPct <= -20) {
        alerts.push({
          kind: "source_drop",
          source: entry.name,
          currentLeads: entry.totals.leads,
          prevLeads: prev,
          deltaPct: Number(deltaPct.toFixed(1)),
        });
      }
    }

    res.json({
      sources: Array.from(sourceMap.values()).sort((a, b) => b.totals.leads - a.totals.leads),
      locations: groupHospitals.map(h => ({ hospitalId: h.id, hospitalName: h.name })),
      alerts,
    });
  } catch (error) {
    logger.error("Error fetching chain marketing:", error);
    res.status(500).json({ message: "Failed to fetch chain marketing" });
  }
});

chainRouter.get(
  "/api/chain/:groupId/overview",
  isAuthenticated,
  isChainAdminForGroup,
  async (req: any, res) => {
    try {
      const { groupId } = req.params;
      const rangeDays = parseInt(
        (req.query.range as string)?.replace("d", "") || "30",
        10
      );
      const start = new Date();
      start.setDate(start.getDate() - rangeDays);
      const startIso = start.toISOString();
      const prevStart = new Date();
      prevStart.setDate(prevStart.getDate() - rangeDays * 2);
      const prevStartIso = prevStart.toISOString();

      const groupHospitalsList = await db
        .select({
          id: hospitals.id,
          name: hospitals.name,
          clinicKind: hospitals.clinicKind,
        })
        .from(hospitals)
        .where(eq(hospitals.groupId, groupId));
      const hospitalIds = groupHospitalsList.map(h => h.id);

      if (hospitalIds.length === 0) {
        return res.status(404).json({ message: "Group not found or empty" });
      }

      // Build an IN (...) list from hospitalIds using sql.join + placeholders
      // (safe, parameterized). Passing a JS array directly to ANY() in raw SQL
      // requires an explicit cast that is awkward across drivers — IN is simpler.
      const idList = sql.join(
        hospitalIds.map(id => sql`${id}`),
        sql`, `
      );

      const treatmentsByHospital = await db.execute<{
        hospital_id: string;
        count: string;
        revenue: string;
      }>(sql`
        SELECT
          t.hospital_id,
          COUNT(DISTINCT t.id) AS count,
          COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue
        FROM treatments t
        LEFT JOIN treatment_lines tl ON tl.treatment_id = t.id
        WHERE t.hospital_id IN (${idList})
          AND t.performed_at >= ${startIso}
          AND t.status IN ('signed', 'invoiced')
        GROUP BY t.hospital_id
      `);

      const surgeriesByHospital = await db.execute<{
        hospital_id: string;
        count: string;
        revenue: string;
      }>(sql`
        SELECT
          s.hospital_id,
          COUNT(*) AS count,
          COALESCE(SUM(CAST(s.price AS numeric)), 0) AS revenue
        FROM surgeries s
        WHERE s.hospital_id IN (${idList})
          AND s.planned_date >= ${startIso}
          AND s.is_archived = false
        GROUP BY s.hospital_id
      `);

      const leadsByHospital = await db.execute<{
        hospital_id: string;
        leads: string;
        first_visit: string;
        no_shows: string;
        appointments: string;
      }>(sql`
        SELECT
          l.hospital_id,
          COUNT(*) AS leads,
          COUNT(*) FILTER (
            WHERE l.appointment_id IN (
              SELECT id FROM clinic_appointments WHERE status IN ('completed', 'confirmed')
            )
          ) AS first_visit,
          COUNT(*) FILTER (
            WHERE l.appointment_id IN (
              SELECT id FROM clinic_appointments WHERE status = 'no_show'
            )
          ) AS no_shows,
          COUNT(*) FILTER (WHERE l.appointment_id IS NOT NULL) AS appointments
        FROM leads l
        WHERE l.hospital_id IN (${idList})
          AND l.created_at >= ${startIso}
        GROUP BY l.hospital_id
      `);

      const prevRevByHospital = await db.execute<{
        hospital_id: string;
        revenue: string;
      }>(sql`
        WITH combined AS (
          SELECT t.hospital_id, COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue
          FROM treatments t
          LEFT JOIN treatment_lines tl ON tl.treatment_id = t.id
          WHERE t.hospital_id IN (${idList})
            AND t.performed_at >= ${prevStartIso}
            AND t.performed_at < ${startIso}
            AND t.status IN ('signed', 'invoiced')
          GROUP BY t.hospital_id
          UNION ALL
          SELECT s.hospital_id, COALESCE(SUM(CAST(s.price AS numeric)), 0) AS revenue
          FROM surgeries s
          WHERE s.hospital_id IN (${idList})
            AND s.planned_date >= ${prevStartIso}
            AND s.planned_date < ${startIso}
            AND s.is_archived = false
          GROUP BY s.hospital_id
        )
        SELECT hospital_id, SUM(revenue) AS revenue FROM combined GROUP BY hospital_id
      `);

      const txMap = new Map(
        (treatmentsByHospital.rows as any[]).map(r => [r.hospital_id, r])
      );
      const sxMap = new Map(
        (surgeriesByHospital.rows as any[]).map(r => [r.hospital_id, r])
      );
      const leadsMap = new Map(
        (leadsByHospital.rows as any[]).map(r => [r.hospital_id, r])
      );
      const prevMap = new Map(
        (prevRevByHospital.rows as any[]).map(r => [
          r.hospital_id,
          parseFloat(r.revenue) || 0,
        ])
      );

      const perLocation = groupHospitalsList
        .map(h => {
          const tx = txMap.get(h.id);
          const sx = sxMap.get(h.id);
          const l = leadsMap.get(h.id);
          const txRev = tx ? parseFloat(tx.revenue) : 0;
          const sxRev = sx ? parseFloat(sx.revenue) : 0;
          const revenue = txRev + sxRev;
          const prev = prevMap.get(h.id) || 0;
          const trendPct =
            prev > 0
              ? Number((((revenue - prev) / prev) * 100).toFixed(1))
              : 0;
          const leadsCount = l ? parseInt(l.leads) : 0;
          const firstVisit = l ? parseInt(l.first_visit) : 0;
          const noShowsCount = l ? parseInt(l.no_shows) : 0;
          const appointments = l ? parseInt(l.appointments) : 0;
          return {
            hospitalId: h.id,
            hospitalName: h.name,
            clinicKind: h.clinicKind,
            revenue,
            treatments: tx ? parseInt(tx.count) : 0,
            surgeries: sx ? parseInt(sx.count) : 0,
            leads: leadsCount,
            conversionPct:
              leadsCount > 0
                ? Number(((firstVisit / leadsCount) * 100).toFixed(1))
                : 0,
            noShowPct:
              appointments > 0
                ? Number(((noShowsCount / appointments) * 100).toFixed(1))
                : 0,
            trendPct,
          };
        })
        .sort((a, b) => b.revenue - a.revenue);

      const totalsRevenue = perLocation.reduce((s, l) => s + l.revenue, 0);
      const totalsTreatments = perLocation.reduce(
        (s, l) => s + l.treatments,
        0
      );
      const totalsSurgeries = perLocation.reduce((s, l) => s + l.surgeries, 0);
      const totalsLeads = perLocation.reduce((s, l) => s + l.leads, 0);
      const totalsFirstVisits = (leadsByHospital.rows as any[]).reduce(
        (s, r) => s + parseInt(r.first_visit || "0"),
        0
      );
      const totalsAppointments = (leadsByHospital.rows as any[]).reduce(
        (s, r) => s + parseInt(r.appointments || "0"),
        0
      );
      const totalsNoShows = (leadsByHospital.rows as any[]).reduce(
        (s, r) => s + parseInt(r.no_shows || "0"),
        0
      );

      const topTreatments = await db.execute<{
        name: string;
        revenue: string;
        count: string;
      }>(sql`
        SELECT
          COALESCE(cs.name, 'Other') AS name,
          COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue,
          COUNT(*) AS count
        FROM treatment_lines tl
        JOIN treatments t ON t.id = tl.treatment_id
        LEFT JOIN clinic_services cs ON cs.id = tl.service_id
        WHERE t.hospital_id IN (${idList})
          AND t.performed_at >= ${startIso}
          AND t.status IN ('signed', 'invoiced')
        GROUP BY cs.name
        ORDER BY revenue DESC
        LIMIT 5
      `);

      const topSurgeries = await db.execute<{
        name: string;
        revenue: string;
        count: string;
      }>(sql`
        SELECT
          COALESCE(s.planned_surgery, 'Other') AS name,
          COALESCE(SUM(CAST(s.price AS numeric)), 0) AS revenue,
          COUNT(*) AS count
        FROM surgeries s
        WHERE s.hospital_id IN (${idList})
          AND s.planned_date >= ${startIso}
          AND s.is_archived = false
        GROUP BY s.planned_surgery
        ORDER BY revenue DESC
        LIMIT 5
      `);

      const avgNoShow =
        totalsAppointments > 0
          ? (totalsNoShows / totalsAppointments) * 100
          : 0;
      const anomalies = perLocation
        .filter(l => l.trendPct < -5 || l.noShowPct > avgNoShow + 5)
        .map(l => {
          const reasons: string[] = [];
          if (l.trendPct < -5)
            reasons.push(`revenue ${l.trendPct}% vs prev period`);
          if (l.noShowPct > avgNoShow + 5)
            reasons.push(
              `no-show ${l.noShowPct}% vs chain avg ${avgNoShow.toFixed(1)}%`
            );
          return {
            hospitalId: l.hospitalId,
            hospitalName: l.hospitalName,
            reasons,
          };
        });

      res.json({
        totals: {
          revenue: totalsRevenue,
          treatments: totalsTreatments,
          surgeries: totalsSurgeries,
          leads: totalsLeads,
          conversionPct:
            totalsLeads > 0
              ? Number(((totalsFirstVisits / totalsLeads) * 100).toFixed(1))
              : 0,
          noShowPct: Number(avgNoShow.toFixed(1)),
        },
        perLocation,
        topItems: {
          treatments: (topTreatments.rows as any[]).map(r => ({
            name: r.name,
            revenue: parseFloat(r.revenue) || 0,
            count: parseInt(r.count) || 0,
          })),
          surgeries: (topSurgeries.rows as any[]).map(r => ({
            name: r.name,
            revenue: parseFloat(r.revenue) || 0,
            count: parseInt(r.count) || 0,
          })),
        },
        anomalies,
      });
    } catch (error) {
      logger.error("Error fetching chain overview:", error);
      res.status(500).json({ message: "Failed to fetch chain overview" });
    }
  }
);

// GET /api/chain/:groupId/flows — list chain-wide flows + audience arrays
chainRouter.get('/api/chain/:groupId/flows', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;

    const groupHospitals = await db
      .select({ id: hospitals.id, name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));
    const hospitalIds = groupHospitals.map(h => h.id);
    if (hospitalIds.length === 0) {
      return res.json({ flows: [] });
    }
    const hospitalNameById = new Map(groupHospitals.map(h => [h.id, h.name]));

    // Distinct flow IDs that touch any hospital in the group
    const flowIdsRes = await db
      .selectDistinct({ flowId: flowHospitals.flowId })
      .from(flowHospitals)
      .where(inArray(flowHospitals.hospitalId, hospitalIds));
    const flowIds = flowIdsRes.map(r => r.flowId);
    if (flowIds.length === 0) {
      return res.json({ flows: [] });
    }

    const [flowRows, audienceRows] = await Promise.all([
      db.select().from(flows).where(inArray(flows.id, flowIds)).orderBy(desc(flows.createdAt)),
      db.select().from(flowHospitals).where(inArray(flowHospitals.flowId, flowIds)),
    ]);

    const audienceByFlow = new Map<string, Array<{ hospitalId: string; hospitalName: string }>>();
    for (const r of audienceRows) {
      const arr = audienceByFlow.get(r.flowId) ?? [];
      arr.push({ hospitalId: r.hospitalId, hospitalName: hospitalNameById.get(r.hospitalId) ?? "Unknown" });
      audienceByFlow.set(r.flowId, arr);
    }

    res.json({
      flows: flowRows.map(f => ({
        ...f,
        audienceHospitals: audienceByFlow.get(f.id) ?? [],
      })),
    });
  } catch (error) {
    logger.error("Error fetching chain flows:", error);
    res.status(500).json({ message: "Failed to fetch chain flows" });
  }
});

// POST /api/chain/:groupId/flows — create a chain flow with explicit audience
chainRouter.post('/api/chain/:groupId/flows', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const bodySchema = z.object({
      hospitalId: z.string(),
      audienceHospitalIds: z.array(z.string()).min(1),
      name: z.string().min(1),
      status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
      channel: z.string().optional(),
      messageSubject: z.string().optional(),
      messageTemplate: z.string().optional(),
      triggerType: z.string().default("manual"),
      segmentFilters: z.any().optional(),
      campaignTreatmentId: z.string().optional(),
      promoCodeId: z.string().optional(),
    });
    const body = bodySchema.parse(req.body);

    // Validate every audience hospital belongs to the group
    const groupHospitals = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));
    const groupHospitalIds = new Set(groupHospitals.map(h => h.id));
    const invalid = body.audienceHospitalIds.filter(h => !groupHospitalIds.has(h));
    if (invalid.length > 0) {
      return res.status(400).json({ message: "audience includes hospital(s) outside this group", invalid });
    }
    if (!groupHospitalIds.has(body.hospitalId)) {
      return res.status(400).json({ message: "owning hospitalId must belong to this group" });
    }

    const [created] = await db.insert(flows).values({
      hospitalId: body.hospitalId,
      name: body.name,
      status: body.status,
      channel: body.channel ?? null,
      messageSubject: body.messageSubject ?? null,
      messageTemplate: body.messageTemplate ?? null,
      triggerType: body.triggerType,
      segmentFilters: body.segmentFilters ?? null,
      campaignTreatmentId: body.campaignTreatmentId ?? null,
      promoCodeId: body.promoCodeId ?? null,
      createdBy: req.user.id,
    } as any).returning();

    await db.insert(flowHospitals).values(
      body.audienceHospitalIds.map(hid => ({ flowId: created.id, hospitalId: hid }))
    );

    res.status(201).json({ ...created, audienceHospitalIds: body.audienceHospitalIds });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    logger.error("Error creating chain flow:", error);
    res.status(500).json({ message: "Failed to create chain flow" });
  }
});

// PATCH /api/chain/:groupId/flows/:flowId — update a chain flow (audience + fields)
chainRouter.patch('/api/chain/:groupId/flows/:flowId', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId, flowId } = req.params;
    const bodySchema = z.object({
      audienceHospitalIds: z.array(z.string()).min(1).optional(),
      name: z.string().optional(),
      status: z.enum(["draft", "active", "paused", "archived"]).optional(),
      channel: z.string().optional(),
      messageSubject: z.string().optional(),
      messageTemplate: z.string().optional(),
      segmentFilters: z.any().optional(),
    });
    const body = bodySchema.parse(req.body);

    // Verify flow exists and belongs to this group
    const groupHospitalIds = (await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId))
    ).map(h => h.id);
    const groupHospitalIdsSet = new Set(groupHospitalIds);

    const existingAudience = await db
      .select()
      .from(flowHospitals)
      .where(eq(flowHospitals.flowId, flowId));
    if (existingAudience.length === 0 || !existingAudience.some(r => groupHospitalIdsSet.has(r.hospitalId))) {
      return res.status(404).json({ message: "Flow not found in this group" });
    }

    if (body.audienceHospitalIds) {
      const invalid = body.audienceHospitalIds.filter(h => !groupHospitalIdsSet.has(h));
      if (invalid.length > 0) {
        return res.status(400).json({ message: "audience includes hospital(s) outside this group", invalid });
      }
      await db.transaction(async tx => {
        await tx.delete(flowHospitals).where(eq(flowHospitals.flowId, flowId));
        if (body.audienceHospitalIds!.length > 0) {
          await tx.insert(flowHospitals).values(
            body.audienceHospitalIds!.map(hid => ({ flowId, hospitalId: hid }))
          );
        }
      });
    }

    const updateFields: any = { updatedAt: new Date() };
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.status !== undefined) updateFields.status = body.status;
    if (body.channel !== undefined) updateFields.channel = body.channel;
    if (body.messageSubject !== undefined) updateFields.messageSubject = body.messageSubject;
    if (body.messageTemplate !== undefined) updateFields.messageTemplate = body.messageTemplate;
    if (body.segmentFilters !== undefined) updateFields.segmentFilters = body.segmentFilters;

    await db.update(flows).set(updateFields).where(eq(flows.id, flowId));

    res.json({ success: true, flowId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    logger.error("Error updating chain flow:", error);
    res.status(500).json({ message: "Failed to update chain flow" });
  }
});

// DELETE /api/chain/:groupId/flows/:flowId — remove a chain flow + its
// flow_hospitals rows (cascade) + any execution/event rows that reference it.
chainRouter.delete('/api/chain/:groupId/flows/:flowId', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId, flowId } = req.params;

    // Verify the flow belongs to this group via flow_hospitals intersection
    const groupHospitalIds = (await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId))
    ).map(h => h.id);

    const audience = await db
      .select()
      .from(flowHospitals)
      .where(eq(flowHospitals.flowId, flowId));
    if (audience.length === 0 || !audience.some(r => groupHospitalIds.includes(r.hospitalId))) {
      return res.status(404).json({ message: "Flow not found in this group" });
    }

    // Refuse delete on already-sent flows so we don't lose attribution.
    const [flow] = await db.select().from(flows).where(eq(flows.id, flowId));
    if (flow?.sentAt) {
      return res.status(400).json({ message: "Cannot delete a flow that has already been sent" });
    }

    // Delete the flow row. flow_hospitals cascades; flow_variants and any
    // referencing rows that have ON DELETE CASCADE go with it.
    await db.delete(flows).where(eq(flows.id, flowId));

    res.json({ success: true, flowId });
  } catch (error) {
    logger.error("Error deleting chain flow:", error);
    res.status(500).json({ message: "Failed to delete chain flow" });
  }
});

// GET /api/chain/:groupId/locations — hospitals in the group + plan info + group defaults
chainRouter.get('/api/chain/:groupId/locations', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const [group] = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.id, groupId));
    if (!group) return res.status(404).json({ message: "Group not found" });

    const groupHospitals = await db
      .select({
        id: hospitals.id,
        name: hospitals.name,
        address: hospitals.address,
        timezone: hospitals.timezone,
        currency: hospitals.currency,
        licenseType: hospitals.licenseType,
        pricePerRecord: hospitals.pricePerRecord,
        clinicKind: hospitals.clinicKind,
      })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));

    res.json({
      locations: groupHospitals.map(h => ({
        hospitalId: h.id,
        hospitalName: h.name,
        address: h.address,
        timezone: h.timezone,
        currency: h.currency,
        licenseType: h.licenseType,
        pricePerRecord: h.pricePerRecord,
        clinicKind: h.clinicKind,
      })),
      groupDefaults: {
        defaultLicenseType: group.defaultLicenseType,
        defaultPricePerRecord: group.defaultPricePerRecord,
      },
    });
  } catch (error) {
    logger.error("Error fetching chain locations:", error);
    res.status(500).json({ message: "Failed to fetch chain locations" });
  }
});

// POST /api/chain/:groupId/locations — create a new clinic in the group.
// The URL groupId is authoritative; body.groupId is ignored.
// Note: no auto-provisioning of userHospitalRoles for the creating user because
// userHospitalRoles.unitId is NOT NULL — the new hospital has no units yet.
// The chain admin retains access via their group_admin role on existing group hospitals.
chainRouter.post('/api/chain/:groupId/locations', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const bodySchema = z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      clinicKind: z.enum(["aesthetic", "surgical", "mixed"]).optional(),
    });
    const body = bodySchema.parse(req.body);

    const [created] = await db.insert(hospitals).values({
      name: body.name,
      address: body.address ?? null,
      timezone: body.timezone ?? "Europe/Zurich",
      currency: body.currency ?? "CHF",
      clinicKind: body.clinicKind ?? "mixed",
      groupId,
    } as any).returning();

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    logger.error("Error creating chain location:", error);
    res.status(500).json({ message: "Failed to create chain location" });
  }
});

// PATCH /api/chain/:groupId/locations/:hospitalId — edit clinic fields
chainRouter.patch('/api/chain/:groupId/locations/:hospitalId', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId, hospitalId } = req.params;
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      address: z.string().nullable().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      clinicKind: z.enum(["aesthetic", "surgical", "mixed"]).optional(),
      licenseType: z.enum(["free", "basic", "test"]).optional(),
      pricePerRecord: z.string().nullable().optional(),
    });
    const body = bodySchema.parse(req.body);

    // Defence-in-depth: verify the hospital belongs to this group
    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
    if (!h || h.groupId !== groupId) {
      return res.status(404).json({ message: "Hospital not found in this group" });
    }

    const updates: any = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.address !== undefined) updates.address = body.address;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.currency !== undefined) updates.currency = body.currency;
    if (body.clinicKind !== undefined) updates.clinicKind = body.clinicKind;
    if (body.licenseType !== undefined) updates.licenseType = body.licenseType;
    if (body.pricePerRecord !== undefined) updates.pricePerRecord = body.pricePerRecord;

    await db.update(hospitals).set(updates).where(eq(hospitals.id, hospitalId));
    res.json({ success: true, hospitalId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    logger.error("Error updating chain location:", error);
    res.status(500).json({ message: "Failed to update chain location" });
  }
});

// DELETE /api/chain/:groupId/locations/:hospitalId — archive by detaching from the group.
// There is no hospitals.archived column in the schema. Detaching (groupId = null) removes
// the clinic from the chain admin's view while keeping all its data intact at platform level.
chainRouter.delete('/api/chain/:groupId/locations/:hospitalId', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId, hospitalId } = req.params;
    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
    if (!h || h.groupId !== groupId) {
      return res.status(404).json({ message: "Hospital not found in this group" });
    }
    await db.update(hospitals).set({ groupId: null }).where(eq(hospitals.id, hospitalId));
    res.status(204).end();
  } catch (error) {
    logger.error("Error archiving chain location:", error);
    res.status(500).json({ message: "Failed to archive chain location" });
  }
});

// PATCH /api/chain/:groupId/billing — update group plan defaults.
// If cascade=true, also overwrites licenseType/pricePerRecord on every current member.
chainRouter.patch('/api/chain/:groupId/billing', isAuthenticated, isChainAdminForGroup, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const bodySchema = z.object({
      defaultLicenseType: z.enum(["free", "basic", "test"]).optional(),
      defaultPricePerRecord: z.string().nullable().optional(),
      cascade: z.boolean().optional(),
    });
    const body = bodySchema.parse(req.body);

    const groupUpdates: any = { updatedAt: new Date() };
    if (body.defaultLicenseType !== undefined) groupUpdates.defaultLicenseType = body.defaultLicenseType;
    if (body.defaultPricePerRecord !== undefined) groupUpdates.defaultPricePerRecord = body.defaultPricePerRecord;
    await db.update(hospitalGroups).set(groupUpdates).where(eq(hospitalGroups.id, groupId));

    if (body.cascade) {
      const memberUpdates: any = { updatedAt: new Date() };
      if (body.defaultLicenseType !== undefined) memberUpdates.licenseType = body.defaultLicenseType;
      if (body.defaultPricePerRecord !== undefined) memberUpdates.pricePerRecord = body.defaultPricePerRecord;
      await db.update(hospitals).set(memberUpdates).where(eq(hospitals.groupId, groupId));
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid payload", issues: error.issues });
    }
    logger.error("Error updating chain billing:", error);
    res.status(500).json({ message: "Failed to update chain billing" });
  }
});
