import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { isAuthenticated } from "../auth/google";
import {
  patients,
  surgeries,
  items,
  users,
  userHospitalRoles,
  hospitals,
} from "@shared/schema";
import { ilike, or, and, eq, inArray, sql } from "drizzle-orm";
import {
  requireStrictHospitalAccess,
  getHospitalGroupIdCached,
  getGroupHospitalIdsCached,
} from "../utils";
import logger from "../logger";

const router = Router();

router.get(
  "/api/search/:hospitalId",
  isAuthenticated,
  requireStrictHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const q = (req.query.q as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 5, 20);

      if (!q || q.length < 2) {
        return res.json({
          patients: [],
          surgeries: [],
          inventoryItems: [],
          users: [],
        });
      }

      const term = `%${q}%`;

      // Patient SEARCH is ALWAYS group-wide when the active hospital belongs
      // to a group (independent of the patient-list scope toggle, which only
      // governs the roster page). Rationale: search answers "does this human
      // exist?" and cross-location walk-ins must not silently create a
      // duplicate at every sibling clinic. For un-grouped hospitals the scope
      // collapses to the single active hospital — identical to the legacy
      // behaviour.
      const activeGroupId = await getHospitalGroupIdCached(hospitalId, req);
      const patientHospitalScope = activeGroupId
        ? inArray(
            patients.hospitalId,
            await getGroupHospitalIdsCached(activeGroupId, req),
          )
        : eq(patients.hospitalId, hospitalId);

      const [patientResults, surgeryResults, itemResults, userResults] =
        await Promise.all([
          // Patients — group-wide when the active hospital has a group, with
          // two derived fields: `seenAtCurrentLocation` (is this patient
          // already on the current location's roster?) and
          // `originHospitalName` (the home-hospital name) so the UI can mark
          // cross-location matches.
          db
            .selectDistinctOn([patients.id], {
              id: patients.id,
              firstName: patients.firstName,
              surname: patients.surname,
              birthday: patients.birthday,
              patientNumber: patients.patientNumber,
              hospitalId: patients.hospitalId,
              originHospitalName: hospitals.name,
              seenAtCurrentLocation: sql<boolean>`EXISTS (
                SELECT 1 FROM patient_hospitals
                WHERE patient_hospitals.patient_id = ${patients.id}
                  AND patient_hospitals.hospital_id = ${hospitalId}
              )`.as("seen_at_current_location"),
            })
            .from(patients)
            .innerJoin(hospitals, eq(hospitals.id, patients.hospitalId))
            .where(
              and(
                patientHospitalScope,
                or(
                  ilike(patients.firstName, term),
                  ilike(patients.surname, term),
                  ilike(patients.patientNumber, term),
                  ilike(patients.phone, term),
                  ilike(patients.email, term),
                ),
              ),
            )
            .limit(limit),

          // Surgeries (join with patients for name search) — kept hospital-
          // local; cross-location surgery discovery is not part of Task 6.
          db
            .select({
              id: surgeries.id,
              patientFirstName: patients.firstName,
              patientSurname: patients.surname,
              plannedDate: surgeries.plannedDate,
              plannedSurgery: surgeries.plannedSurgery,
            })
            .from(surgeries)
            .leftJoin(patients, eq(surgeries.patientId, patients.id))
            .where(
              and(
                eq(surgeries.hospitalId, hospitalId),
                or(
                  ilike(surgeries.plannedSurgery, term),
                  ilike(patients.firstName, term),
                  ilike(patients.surname, term),
                ),
              ),
            )
            .limit(limit),

          // Inventory items
          db
            .select({
              id: items.id,
              name: items.name,
            })
            .from(items)
            .where(
              and(
                eq(items.hospitalId, hospitalId),
                ilike(items.name, term),
              ),
            )
            .limit(limit),

          // Users (join with userHospitalRoles to filter by hospital)
          db
            .selectDistinctOn([users.id], {
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              email: users.email,
              role: userHospitalRoles.role,
            })
            .from(users)
            .innerJoin(
              userHospitalRoles,
              eq(users.id, userHospitalRoles.userId),
            )
            .where(
              and(
                eq(userHospitalRoles.hospitalId, hospitalId),
                or(
                  ilike(users.firstName, term),
                  ilike(users.lastName, term),
                  ilike(users.email, term),
                ),
              ),
            )
            .limit(limit),
        ]);

      return res.json({
        patients: patientResults.map((p) => ({
          id: p.id,
          name: [p.firstName, p.surname].filter(Boolean).join(" "),
          dob: p.birthday,
          patientNumber: p.patientNumber,
          seenAtCurrentLocation: Boolean(p.seenAtCurrentLocation),
          originHospitalName: p.originHospitalName,
        })),
        surgeries: surgeryResults.map((s) => ({
          id: s.id,
          patientName: [s.patientFirstName, s.patientSurname]
            .filter(Boolean)
            .join(" "),
          date: s.plannedDate,
          procedure: s.plannedSurgery,
        })),
        inventoryItems: itemResults.map((i) => ({
          id: i.id,
          name: i.name,
        })),
        users: userResults.map((u) => ({
          id: u.id,
          name: [u.firstName, u.lastName].filter(Boolean).join(" "),
          email: u.email,
          role: u.role,
        })),
      });
    } catch (error) {
      logger.error("Search error:", error);
      return res.status(500).json({ error: "Search failed" });
    }
  },
);

export default router;
