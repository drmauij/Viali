import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { isAuthenticated } from "../auth/google";
import { patients, surgeries, items, users, userHospitalRoles } from "@shared/schema";
import { ilike, or, and, eq } from "drizzle-orm";
import { requireStrictHospitalAccess } from "../utils";
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

      const [patientResults, surgeryResults, itemResults, userResults] =
        await Promise.all([
          // Patients
          db
            .select({
              id: patients.id,
              firstName: patients.firstName,
              surname: patients.surname,
              birthday: patients.birthday,
              patientNumber: patients.patientNumber,
            })
            .from(patients)
            .where(
              and(
                eq(patients.hospitalId, hospitalId),
                or(
                  ilike(patients.firstName, term),
                  ilike(patients.surname, term),
                  ilike(patients.patientNumber, term),
                ),
              ),
            )
            .limit(limit),

          // Surgeries (join with patients for name search)
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
