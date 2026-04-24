import { Router, type Response } from "express";
import { db } from "../db";
import {
  hospitals,
  treatments,
  treatmentLines,
  surgeries,
  leads,
  clinicAppointments,
  clinicServices,
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import logger from "../logger";

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
