import { db } from "../db";
import { eq, and, desc, asc, sql, inArray, or, isNull } from "drizzle-orm";
import logger from "../logger";
import {
  users,
  checklistTemplates,
  checklistTemplateAssignments,
  checklistCompletions,
  checklistDismissals,
  type ChecklistTemplate,
  type InsertChecklistTemplate,
  type ChecklistTemplateAssignment,
  type ChecklistCompletion,
  type InsertChecklistCompletion,
  type ChecklistDismissal,
  type InsertChecklistDismissal,
  type User,
} from "@shared/schema";

function skipWeekends(date: Date): Date {
  const day = date.getDay();
  if (day === 0) { // Sunday -> Monday
    date.setDate(date.getDate() + 1);
  } else if (day === 6) { // Saturday -> Monday
    date.setDate(date.getDate() + 2);
  }
  return date;
}

function calculateNextDueDate(startDate: Date, recurrency: string, lastDueDate?: Date, excludeWeekends: boolean = false): Date {
  if (!lastDueDate) {
    const start = new Date(startDate);
    if (excludeWeekends) {
      return skipWeekends(start);
    }
    return start;
  }
  
  const date = new Date(lastDueDate);

  switch (recurrency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'bimonthly':
      date.setMonth(date.getMonth() + 2);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'triannual':
      date.setMonth(date.getMonth() + 4);
      break;
    case 'biannual':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  if (excludeWeekends) {
    return skipWeekends(date);
  }
  return date;
}

export async function createChecklistTemplate(template: InsertChecklistTemplate, assignments?: { unitId: string | null; role: string | null }[]): Promise<ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }> {
  const [created] = await db.insert(checklistTemplates).values(template).returning();
  
  let createdAssignments: ChecklistTemplateAssignment[] = [];
  if (assignments && assignments.length > 0) {
    createdAssignments = await db.insert(checklistTemplateAssignments).values(
      assignments.map(a => ({ templateId: created.id, unitId: a.unitId, role: a.role }))
    ).returning();
  }
  
  return { ...created, assignments: createdAssignments };
}

export async function getChecklistTemplates(hospitalId: string, unitId?: string, active: boolean = true): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] })[]> {
  const conditions: any[] = [eq(checklistTemplates.hospitalId, hospitalId)];
  if (active !== undefined) conditions.push(eq(checklistTemplates.active, active));

  if (unitId) {
    const matchingAssignments = await db
      .select({ templateId: checklistTemplateAssignments.templateId })
      .from(checklistTemplateAssignments)
      .where(or(
        eq(checklistTemplateAssignments.unitId, unitId),
        isNull(checklistTemplateAssignments.unitId)
      ));
    const assignedIds = matchingAssignments.map(a => a.templateId);

    conditions.push(or(
      ...(assignedIds.length > 0 ? [inArray(checklistTemplates.id, assignedIds)] : []),
      eq(checklistTemplates.unitId, unitId)
    ));
  }

  const templates = await db
    .select()
    .from(checklistTemplates)
    .where(and(...conditions))
    .orderBy(asc(checklistTemplates.name));
  
  const templateIds = templates.map(t => t.id);
  const allAssignments = templateIds.length > 0
    ? await db
        .select()
        .from(checklistTemplateAssignments)
        .where(inArray(checklistTemplateAssignments.templateId, templateIds))
    : [];
  
  const assignmentsByTemplate = new Map<string, ChecklistTemplateAssignment[]>();
  for (const a of allAssignments) {
    const list = assignmentsByTemplate.get(a.templateId) || [];
    list.push(a);
    assignmentsByTemplate.set(a.templateId, list);
  }
  
  return templates.map(t => ({
    ...t,
    assignments: assignmentsByTemplate.get(t.id) || [],
  }));
}

export async function getChecklistTemplate(id: string): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }) | undefined> {
  const [template] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id));
  if (!template) return undefined;
  
  const assignments = await db
    .select()
    .from(checklistTemplateAssignments)
    .where(eq(checklistTemplateAssignments.templateId, id));
  
  return { ...template, assignments };
}

export async function updateChecklistTemplate(id: string, updates: Partial<ChecklistTemplate>, assignments?: { unitId: string | null; role: string | null }[]): Promise<ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }> {
  const [updated] = await db
    .update(checklistTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(checklistTemplates.id, id))
    .returning();
  
  let updatedAssignments: ChecklistTemplateAssignment[] = [];
  if (assignments !== undefined) {
    await db.delete(checklistTemplateAssignments).where(eq(checklistTemplateAssignments.templateId, id));
    if (assignments.length > 0) {
      updatedAssignments = await db.insert(checklistTemplateAssignments).values(
        assignments.map(a => ({ templateId: id, unitId: a.unitId, role: a.role }))
      ).returning();
    }
  } else {
    updatedAssignments = await db
      .select()
      .from(checklistTemplateAssignments)
      .where(eq(checklistTemplateAssignments.templateId, id));
  }
  
  return { ...updated, assignments: updatedAssignments };
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  await db.delete(checklistCompletions).where(eq(checklistCompletions.templateId, id));
  await db.delete(checklistDismissals).where(eq(checklistDismissals.templateId, id));
  await db.delete(checklistTemplateAssignments).where(eq(checklistTemplateAssignments.templateId, id));
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
}

export async function getPendingChecklists(hospitalId: string, unitId: string, role?: string): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[]; lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean })[]> {
  const matchingAssignments = await db
    .select({ templateId: checklistTemplateAssignments.templateId })
    .from(checklistTemplateAssignments)
    .where(and(
      or(
        eq(checklistTemplateAssignments.unitId, unitId),
        isNull(checklistTemplateAssignments.unitId)
      ),
      role
        ? or(isNull(checklistTemplateAssignments.role), eq(checklistTemplateAssignments.role, role))
        : isNull(checklistTemplateAssignments.role)
    ));
  
  const assignedIds = Array.from(new Set(matchingAssignments.map(a => a.templateId)));

  const unitMatchCondition = or(
    ...(assignedIds.length > 0 ? [inArray(checklistTemplates.id, assignedIds)] : []),
    eq(checklistTemplates.unitId, unitId)
  );

  const templates = await db
    .select()
    .from(checklistTemplates)
    .where(and(
      eq(checklistTemplates.hospitalId, hospitalId),
      eq(checklistTemplates.active, true),
      unitMatchCondition,
      or(
        isNull(checklistTemplates.roomIds),
        sql`${checklistTemplates.roomIds} = '{}'`
      )
    ));

  const pendingTemplateIds = templates.map(t => t.id);
  const allAssignments = pendingTemplateIds.length > 0
    ? await db
        .select()
        .from(checklistTemplateAssignments)
        .where(inArray(checklistTemplateAssignments.templateId, pendingTemplateIds))
    : [];
  
  const assignmentsByTemplate = new Map<string, ChecklistTemplateAssignment[]>();
  for (const a of allAssignments) {
    const list = assignmentsByTemplate.get(a.templateId) || [];
    list.push(a);
    assignmentsByTemplate.set(a.templateId, list);
  }

  const result = [];
  const now = new Date();

  for (const template of templates) {
    const completions = await db
      .select()
      .from(checklistCompletions)
      .where(eq(checklistCompletions.templateId, template.id))
      .orderBy(desc(checklistCompletions.dueDate))
      .limit(1);

    const dismissals = await db
      .select()
      .from(checklistDismissals)
      .where(and(
        eq(checklistDismissals.templateId, template.id),
        eq(checklistDismissals.hospitalId, hospitalId),
        eq(checklistDismissals.unitId, unitId)
      ))
      .orderBy(desc(checklistDismissals.dueDate))
      .limit(1);

    const lastCompletion = completions[0];
    const lastDismissal = dismissals[0];
    
    let lastHandledDueDate: Date | undefined;
    if (lastCompletion && lastDismissal) {
      lastHandledDueDate = new Date(lastCompletion.dueDate) > new Date(lastDismissal.dueDate) 
        ? lastCompletion.dueDate 
        : lastDismissal.dueDate;
    } else if (lastCompletion) {
      lastHandledDueDate = lastCompletion.dueDate;
    } else if (lastDismissal) {
      lastHandledDueDate = lastDismissal.dueDate;
    }
    
    let nextDueDate = calculateNextDueDate(template.startDate, template.recurrency, lastHandledDueDate, template.excludeWeekends ?? false);
    
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    if (nextDueDate < todayStart) {
      nextDueDate = new Date(todayStart);
    }
    
    const isOverdue = nextDueDate <= now;

    if (isOverdue || nextDueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      result.push({
        ...template,
        assignments: assignmentsByTemplate.get(template.id) || [],
        lastCompletion,
        nextDueDate,
        isOverdue,
      });
    }
  }

  return result.sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
}

export async function getRoomPendingChecklists(hospitalId: string, date?: Date): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[]; lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean; roomId: string; completedToday?: boolean; todayCompletion?: { completedBy: string; completedByName?: string; completedAt: Date | null; comment: string | null; signature: string } })[]> {
  const templates = await db
    .select()
    .from(checklistTemplates)
    .where(and(
      eq(checklistTemplates.hospitalId, hospitalId),
      eq(checklistTemplates.active, true),
      sql`${checklistTemplates.roomIds} IS NOT NULL AND ${checklistTemplates.roomIds} != '{}'`
    ));

  if (templates.length === 0) return [];

  const allAssignments = await db
    .select()
    .from(checklistTemplateAssignments)
    .where(inArray(checklistTemplateAssignments.templateId, templates.map(t => t.id)));

  const assignmentsByTemplate = new Map<string, ChecklistTemplateAssignment[]>();
  for (const a of allAssignments) {
    const list = assignmentsByTemplate.get(a.templateId) || [];
    list.push(a);
    assignmentsByTemplate.set(a.templateId, list);
  }

  const result: (ChecklistTemplate & { assignments: ChecklistTemplateAssignment[]; lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean; roomId: string; completedToday?: boolean; todayCompletion?: { completedBy: string; completedByName?: string; completedAt: Date | null; comment: string | null; signature: string } })[] = [];
  const now = date || new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  for (const template of templates) {
    const roomIds = (template.roomIds || []) as string[];
    
    for (const roomId of roomIds) {
      const completions = await db
        .select()
        .from(checklistCompletions)
        .where(and(
          eq(checklistCompletions.templateId, template.id),
          eq(checklistCompletions.roomId, roomId)
        ))
        .orderBy(desc(checklistCompletions.dueDate))
        .limit(1);
      
      const dismissals = await db
        .select()
        .from(checklistDismissals)
        .where(and(
          eq(checklistDismissals.templateId, template.id),
          eq(checklistDismissals.hospitalId, hospitalId),
          eq(checklistDismissals.roomId, roomId)
        ))
        .orderBy(desc(checklistDismissals.dueDate))
        .limit(1);

      const lastCompletion = completions[0];
      const lastDismissal = dismissals[0];

      let lastHandledDueDate: Date | undefined;
      if (lastCompletion && lastDismissal) {
        lastHandledDueDate = new Date(lastCompletion.dueDate) > new Date(lastDismissal.dueDate)
          ? lastCompletion.dueDate
          : lastDismissal.dueDate;
      } else if (lastCompletion) {
        lastHandledDueDate = lastCompletion.dueDate;
      } else if (lastDismissal) {
        lastHandledDueDate = lastDismissal.dueDate;
      }

      let nextDueDate = calculateNextDueDate(template.startDate, template.recurrency, lastHandledDueDate, template.excludeWeekends ?? false);
      
      if (nextDueDate < dayStart) {
        nextDueDate = new Date(dayStart);
      }
      
      const isOverdue = nextDueDate <= now;
      const isDueToday = nextDueDate >= dayStart && nextDueDate <= dayEnd;

      if (isOverdue || isDueToday) {
        result.push({
          ...template,
          assignments: assignmentsByTemplate.get(template.id) || [],
          lastCompletion,
          nextDueDate,
          isOverdue,
          roomId,
        });
      } else if (lastCompletion && new Date(lastCompletion.dueDate) >= dayStart && new Date(lastCompletion.dueDate) <= dayEnd) {
        const completedByUser = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, lastCompletion.completedBy))
          .limit(1);

        const userName = completedByUser[0]
          ? [completedByUser[0].firstName, completedByUser[0].lastName].filter(Boolean).join(' ')
          : undefined;

        result.push({
          ...template,
          assignments: assignmentsByTemplate.get(template.id) || [],
          lastCompletion,
          nextDueDate,
          isOverdue: false,
          roomId,
          completedToday: true,
          todayCompletion: {
            completedBy: lastCompletion.completedBy,
            completedByName: userName || undefined,
            completedAt: lastCompletion.completedAt,
            comment: lastCompletion.comment,
            signature: lastCompletion.signature,
          },
        });
      }
    }
  }

  return result.sort((a, b) => {
    if (a.completedToday && !b.completedToday) return 1;
    if (!a.completedToday && b.completedToday) return -1;
    return a.nextDueDate.getTime() - b.nextDueDate.getTime();
  });
}

export async function completeChecklist(completion: InsertChecklistCompletion): Promise<ChecklistCompletion> {
  const [created] = await db.insert(checklistCompletions).values(completion).returning();
  return created;
}

export async function dismissChecklist(dismissal: InsertChecklistDismissal): Promise<ChecklistDismissal> {
  const [created] = await db.insert(checklistDismissals).values(dismissal).returning();
  return created;
}

export async function getChecklistCompletions(hospitalId: string, unitId?: string, templateId?: string, limit: number = 50): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[]> {
  const conditions = [eq(checklistCompletions.hospitalId, hospitalId)];
  if (unitId) conditions.push(eq(checklistCompletions.unitId, unitId));
  if (templateId) conditions.push(eq(checklistCompletions.templateId, templateId));

  const completions = await db
    .select({
      ...checklistCompletions,
      template: checklistTemplates,
      completedByUser: users,
    })
    .from(checklistCompletions)
    .leftJoin(checklistTemplates, eq(checklistCompletions.templateId, checklistTemplates.id))
    .leftJoin(users, eq(checklistCompletions.completedBy, users.id))
    .where(and(...conditions))
    .orderBy(desc(checklistCompletions.completedAt))
    .limit(limit);

  return completions as (ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[];
}

export async function getChecklistCompletion(id: string): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined> {
  const [completion] = await db
    .select({
      ...checklistCompletions,
      template: checklistTemplates,
      completedByUser: users,
    })
    .from(checklistCompletions)
    .leftJoin(checklistTemplates, eq(checklistCompletions.templateId, checklistTemplates.id))
    .leftJoin(users, eq(checklistCompletions.completedBy, users.id))
    .where(eq(checklistCompletions.id, id));

  return completion as (ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined;
}

export async function getPendingChecklistCount(hospitalId: string, unitId: string, role?: string): Promise<number> {
  const pending = await getPendingChecklists(hospitalId, unitId, role);
  return pending.filter(c => c.isOverdue).length;
}

export async function backfillChecklistTemplateAssignments(): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO checklist_template_assignments (id, template_id, unit_id, role)
    SELECT gen_random_uuid(), t.id, t.unit_id, t.role
    FROM checklist_templates t
    WHERE t.unit_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM checklist_template_assignments a WHERE a.template_id = t.id
      )
  `);

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info(`Backfilled ${count} checklist template assignment(s) from legacy unitId/role fields`);
  }
  return count;
}
