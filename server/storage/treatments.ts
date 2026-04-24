import { db } from "../db";
import {
  treatments,
  treatmentLines,
  clinicInvoices,
  clinicInvoiceItems,
  patients,
  type Treatment,
  type TreatmentLine,
  type InsertTreatment,
  type InsertTreatmentLine,
} from "@shared/schema";
import { eq, desc, inArray, max } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface TreatmentWithLines extends Treatment {
  lines: TreatmentLine[];
}

export interface CreateTreatmentInput extends Omit<InsertTreatment, "id" | "createdAt" | "updatedAt" | "signedAt" | "amendedAt"> {
  lines: Omit<InsertTreatmentLine, "treatmentId" | "id" | "createdAt">[];
}

export const treatmentsStorage = {
  async create(input: CreateTreatmentInput): Promise<TreatmentWithLines> {
    const { lines, ...header } = input;
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(treatments).values(header as any).returning();
      const linesInserted = lines.length
        ? await tx
            .insert(treatmentLines)
            .values(
              lines.map((l, i) => ({
                ...l,
                treatmentId: created.id,
                lineOrder: l.lineOrder ?? i,
              })),
            )
            .returning()
        : [];
      return { ...created, lines: linesInserted };
    });
  },

  async getById(id: string): Promise<TreatmentWithLines | null> {
    const [t] = await db.select().from(treatments).where(eq(treatments.id, id));
    if (!t) return null;
    const lines = await db
      .select()
      .from(treatmentLines)
      .where(eq(treatmentLines.treatmentId, id))
      .orderBy(treatmentLines.lineOrder);
    return { ...t, lines };
  },

  async listByPatient(
    patientId: string,
    limit = 50,
  ): Promise<TreatmentWithLines[]> {
    const list = await db
      .select()
      .from(treatments)
      .where(eq(treatments.patientId, patientId))
      .orderBy(desc(treatments.performedAt))
      .limit(limit);
    if (!list.length) return [];
    const ids = list.map((t) => t.id);
    const allLines = await db
      .select()
      .from(treatmentLines)
      .where(inArray(treatmentLines.treatmentId, ids))
      .orderBy(treatmentLines.lineOrder);
    const linesByTreatment = new Map<string, TreatmentLine[]>();
    for (const l of allLines) {
      const arr = linesByTreatment.get(l.treatmentId) ?? [];
      arr.push(l);
      linesByTreatment.set(l.treatmentId, arr);
    }
    return list.map((t) => ({ ...t, lines: linesByTreatment.get(t.id) ?? [] }));
  },

  async update(
    id: string,
    header: Partial<InsertTreatment>,
    lines?: Omit<InsertTreatmentLine, "treatmentId" | "id" | "createdAt">[],
  ): Promise<TreatmentWithLines> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(treatments)
        .where(eq(treatments.id, id));
      if (!existing) throw new Error("Treatment not found");
      if (existing.status === "signed" || existing.status === "invoiced") {
        throw new Error("Cannot edit a signed treatment without amend");
      }
      const [updated] = await tx
        .update(treatments)
        .set({ ...header, updatedAt: new Date() })
        .where(eq(treatments.id, id))
        .returning();
      if (lines !== undefined) {
        await tx
          .delete(treatmentLines)
          .where(eq(treatmentLines.treatmentId, id));
        if (lines.length) {
          await tx.insert(treatmentLines).values(
            lines.map((l, i) => ({
              ...l,
              treatmentId: id,
              lineOrder: l.lineOrder ?? i,
            })),
          );
        }
      }
      const finalLines = await tx
        .select()
        .from(treatmentLines)
        .where(eq(treatmentLines.treatmentId, id))
        .orderBy(treatmentLines.lineOrder);
      return { ...updated, lines: finalLines };
    });
  },

  async listUniqueZones(hospitalId: string): Promise<string[]> {
    const rows = await db.execute<{ zone: string }>(sql`
      SELECT DISTINCT jsonb_array_elements_text(tl.zones) AS zone
      FROM treatment_lines tl
      JOIN treatments t ON tl.treatment_id = t.id
      WHERE t.hospital_id = ${hospitalId}
      ORDER BY zone
    `);
    return (rows.rows as { zone: string }[])
      .map((r) => r.zone)
      .filter((z) => !!z && z.trim().length > 0);
  },

  async remove(id: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(treatments)
      .where(eq(treatments.id, id));
    if (!existing) return;
    if (existing.status !== "draft")
      throw new Error("Only draft treatments can be deleted");
    await db.delete(treatments).where(eq(treatments.id, id));
  },

  async sign(
    id: string,
    signedBy: string,
    signature: string,
  ): Promise<TreatmentWithLines> {
    return await db.transaction(async (tx) => {
      const [t] = await tx
        .select()
        .from(treatments)
        .where(eq(treatments.id, id));
      if (!t) throw new Error("Treatment not found");
      if (t.status === "signed" || t.status === "invoiced")
        throw new Error("Already signed");
      const [updated] = await tx
        .update(treatments)
        .set({
          status: "signed",
          signedBy,
          signature,
          signedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(treatments.id, id))
        .returning();
      const lines = await tx
        .select()
        .from(treatmentLines)
        .where(eq(treatmentLines.treatmentId, id))
        .orderBy(treatmentLines.lineOrder);

      // Trigger inventory commit for lines that have an itemId + dose
      const { commitUsage } = await import("./inventoryCommit");
      const entries = lines
        .filter((l) => l.itemId && l.dose)
        .map((l) => ({
          itemId: l.itemId!,
          lotId: l.lotId ?? null,
          quantity: parseFloat(l.dose ?? "0") || 0,
        }))
        .filter((e) => e.quantity > 0);
      if (entries.length && t.unitId) {
        await commitUsage({
          hospitalId: t.hospitalId,
          unitId: t.unitId,
          entries,
        });
      }

      return { ...updated, lines };
    });
  },

  async amend(id: string, amendedBy: string): Promise<TreatmentWithLines> {
    const [t] = await db
      .select()
      .from(treatments)
      .where(eq(treatments.id, id));
    if (!t) throw new Error("Treatment not found");
    if (t.status === "draft") throw new Error("Treatment is not signed");
    const [updated] = await db
      .update(treatments)
      .set({
        status: "amended",
        amendedBy,
        amendedAt: new Date(),
        signature: null,
        updatedAt: new Date(),
      })
      .where(eq(treatments.id, id))
      .returning();
    const lines = await db
      .select()
      .from(treatmentLines)
      .where(eq(treatmentLines.treatmentId, id))
      .orderBy(treatmentLines.lineOrder);
    return { ...updated, lines };
  },

  async createInvoiceDraft(id: string): Promise<{ invoiceId: string }> {
    return await db.transaction(async (tx) => {
      const [t] = await tx
        .select()
        .from(treatments)
        .where(eq(treatments.id, id));
      if (!t) throw new Error("Treatment not found");
      if (t.status !== "signed")
        throw new Error("Treatment must be signed before invoicing");
      // Idempotent: if already invoiced, return existing invoiceId
      if (t.invoiceId) return { invoiceId: t.invoiceId };

      const lines = await tx
        .select()
        .from(treatmentLines)
        .where(eq(treatmentLines.treatmentId, id))
        .orderBy(treatmentLines.lineOrder);

      const [patient] = await tx
        .select()
        .from(patients)
        .where(eq(patients.id, t.patientId));
      const customerName =
        `${patient?.firstName ?? ""} ${patient?.surname ?? ""}`.trim();

      const subtotal = lines.reduce(
        (s, l) => s + parseFloat(l.total ?? "0"),
        0,
      );

      // Get next invoice number (max + 1 per hospital)
      const [numResult] = await tx
        .select({ maxNum: max(clinicInvoices.invoiceNumber) })
        .from(clinicInvoices)
        .where(eq(clinicInvoices.hospitalId, t.hospitalId));
      const invoiceNumber = (numResult?.maxNum ?? 0) + 1;

      const [invoice] = await tx
        .insert(clinicInvoices)
        .values({
          hospitalId: t.hospitalId,
          invoiceNumber,
          date: new Date(),
          patientId: t.patientId,
          customerName: customerName || "Unknown",
          subtotal: subtotal.toFixed(2),
          vatRate: "0.00",
          vatAmount: "0.00",
          total: subtotal.toFixed(2),
          status: "draft",
        })
        .returning();

      if (lines.length) {
        await tx.insert(clinicInvoiceItems).values(
          lines.map((l) => {
            const useService = !!l.serviceId;
            const doseNum = parseFloat(l.dose ?? "");
            const qty =
              Number.isFinite(doseNum) && doseNum > 0
                ? Math.round(doseNum)
                : 1;
            const zonesArr = Array.isArray(l.zones) ? l.zones : [];
            const zonesSuffix =
              zonesArr.length > 0 ? ` — ${zonesArr.join(", ")}` : "";
            return {
              invoiceId: invoice.id,
              lineType: useService ? ("service" as const) : ("item" as const),
              serviceId: useService ? l.serviceId : null,
              itemId: useService ? null : l.itemId,
              description: zonesSuffix.trim() || "-",
              quantity: qty,
              unitPrice: l.unitPrice ?? "0",
              taxRate: "0",
              taxAmount: "0",
              total: l.total ?? "0",
            };
          }),
        );
      }

      await tx
        .update(treatments)
        .set({
          status: "invoiced",
          invoiceId: invoice.id,
          updatedAt: new Date(),
        })
        .where(eq(treatments.id, id));

      return { invoiceId: invoice.id };
    });
  },
};
