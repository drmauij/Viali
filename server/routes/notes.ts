import { Router } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { notes, insertNoteSchema, insertPersonalTodoSchema } from "@shared/schema";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  getUserRole,
  verifyUserHospitalUnitAccess,
  requireWriteAccess,
  requireStrictHospitalAccess,
  ENCRYPTION_KEY,
  decryptPatientData,
} from "../utils";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";
import logger from "../logger";

const router = Router();

const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

function encryptNote(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + encrypted + ":" + authTag.toString("hex");
}

function decryptNote(text: string): string {
  if (!text.includes(":")) {
    return text;
  }
  const parts = text.split(":");
  if (parts.length === 3) {
    if (!parts[0] || !parts[1] || !parts[2]) {
      throw new Error("Invalid encrypted data format");
    }
    if (parts[0].length !== 24) {
      throw new Error("Invalid IV length for GCM");
    }
    if (parts[2].length !== 32) {
      throw new Error("Invalid authentication tag length");
    }
    try {
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      logger.error("Failed to decrypt note with GCM - authentication failed or data corrupted:", error);
      throw new Error("Failed to decrypt note: authentication verification failed");
    }
  } else if (parts.length === 2) {
    logger.warn("Note uses old CBC encryption - will be upgraded to GCM on next update");
    return decryptPatientData(text);
  } else {
    throw new Error("Invalid encrypted note format");
  }
}

router.get('/api/notes/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const { scope } = req.query;
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "No access to this hospital" });
    }

    let allNotes;
    if (scope === 'personal') {
      allNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.hospitalId, hospitalId),
            eq(notes.unitId, unitId),
            eq(notes.userId, userId),
            eq(notes.scope, 'personal')
          )
        )
        .orderBy(sql`${notes.createdAt} DESC`);
    } else if (scope === 'unit') {
      allNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.hospitalId, hospitalId),
            eq(notes.unitId, unitId),
            eq(notes.scope, 'unit')
          )
        )
        .orderBy(sql`${notes.createdAt} DESC`);
    } else if (scope === 'hospital') {
      allNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.hospitalId, hospitalId),
            eq(notes.scope, 'hospital')
          )
        )
        .orderBy(sql`${notes.createdAt} DESC`);
    } else {
      allNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.hospitalId, hospitalId),
            eq(notes.unitId, unitId)
          )
        )
        .orderBy(sql`${notes.createdAt} DESC`);
    }

    const decryptedNotes = allNotes.map(note => {
      try {
        return {
          ...note,
          content: decryptNote(note.content)
        };
      } catch (error) {
        logger.error(`Failed to decrypt note ${note.id}:`, error);
        return {
          ...note,
          content: "[Error: Unable to decrypt note - data may be corrupted]"
        };
      }
    });

    res.json(decryptedNotes);
  } catch (error) {
    logger.error("Error fetching notes:", error);
    res.status(500).json({ message: "Failed to fetch notes" });
  }
});

router.post('/api/notes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const noteData = insertNoteSchema.parse(req.body);
    const { hasAccess } = await verifyUserHospitalUnitAccess(userId, noteData.hospitalId, noteData.unitId);
    if (!hasAccess) {
      return res.status(403).json({ message: "No access to this hospital/unit" });
    }

    const encryptedContent = encryptNote(noteData.content);
    const [note] = await db
      .insert(notes)
      .values({
        ...noteData,
        content: encryptedContent,
        userId,
      })
      .returning();

    const decryptedNote = {
      ...note,
      content: decryptNote(note.content)
    };
    res.status(201).json(decryptedNote);
  } catch (error) {
    logger.error("Error creating note:", error);
    res.status(500).json({ message: "Failed to create note" });
  }
});

router.patch('/api/notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { noteId } = req.params;
    const { content, isShared } = req.body;

    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, noteId));

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    let canEditNote = false;
    if (note.userId === userId) {
      canEditNote = true;
    } else if (note.scope === 'unit' && note.unitId) {
      const { hasAccess } = await verifyUserHospitalUnitAccess(userId, note.hospitalId, note.unitId);
      canEditNote = hasAccess;
    } else if (note.scope === 'hospital') {
      const role = await getUserRole(userId, note.hospitalId);
      canEditNote = role === 'admin';
    }

    if (!canEditNote) {
      return res.status(403).json({ message: "You don't have permission to edit this note" });
    }

    const encryptedContent = content ? encryptNote(content) : note.content;
    const [updatedNote] = await db
      .update(notes)
      .set({
        content: encryptedContent,
        isShared,
        updatedAt: new Date(),
      })
      .where(eq(notes.id, noteId))
      .returning();

    const decryptedNote = {
      ...updatedNote,
      content: decryptNote(updatedNote.content)
    };
    res.json(decryptedNote);
  } catch (error) {
    logger.error("Error updating note:", error);
    res.status(500).json({ message: "Failed to update note" });
  }
});

router.delete('/api/notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { noteId } = req.params;

    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, noteId));

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    let canDeleteNote = false;
    if (note.userId === userId) {
      canDeleteNote = true;
    } else if (note.scope === 'unit' && note.unitId) {
      const { hasAccess } = await verifyUserHospitalUnitAccess(userId, note.hospitalId, note.unitId);
      canDeleteNote = hasAccess;
    } else if (note.scope === 'hospital') {
      const role = await getUserRole(userId, note.hospitalId);
      canDeleteNote = role === 'admin';
    }

    if (!canDeleteNote) {
      return res.status(403).json({ message: "You don't have permission to delete this note" });
    }

    await db.delete(notes).where(eq(notes.id, noteId));
    res.json({ message: "Note deleted successfully" });
  } catch (error) {
    logger.error("Error deleting note:", error);
    res.status(500).json({ message: "Failed to delete note" });
  }
});

router.get('/api/hospitals/:hospitalId/todos', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const todos = await storage.getPersonalTodos(userId, hospitalId);
    res.json(todos);
  } catch (error) {
    logger.error("Error fetching todos:", error);
    res.status(500).json({ message: "Failed to fetch todos" });
  }
});

router.post('/api/hospitals/:hospitalId/todos', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const parsed = insertPersonalTodoSchema.safeParse({
      ...req.body,
      userId,
      hospitalId
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid todo data", errors: parsed.error.errors });
    }
    const todo = await storage.createPersonalTodo(parsed.data);
    res.status(201).json(todo);
  } catch (error) {
    logger.error("Error creating todo:", error);
    res.status(500).json({ message: "Failed to create todo" });
  }
});

router.patch('/api/todos/:todoId', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { todoId } = req.params;
    const existing = await storage.getPersonalTodo(todoId);
    if (!existing) {
      return res.status(404).json({ message: "Todo not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { title, description, status } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    const updated = await storage.updatePersonalTodo(todoId, updates);
    res.json(updated);
  } catch (error) {
    logger.error("Error updating todo:", error);
    res.status(500).json({ message: "Failed to update todo" });
  }
});

router.delete('/api/todos/:todoId', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { todoId } = req.params;
    const existing = await storage.getPersonalTodo(todoId);
    if (!existing) {
      return res.status(404).json({ message: "Todo not found" });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    await storage.deletePersonalTodo(todoId);
    res.json({ message: "Todo deleted successfully" });
  } catch (error) {
    logger.error("Error deleting todo:", error);
    res.status(500).json({ message: "Failed to delete todo" });
  }
});

router.post('/api/hospitals/:hospitalId/todos/reorder', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const { todoIds, status } = req.body;
    if (!Array.isArray(todoIds) || !status) {
      return res.status(400).json({ message: "Invalid reorder data" });
    }
    for (const todoId of todoIds) {
      const todo = await storage.getPersonalTodo(todoId);
      if (!todo || todo.userId !== userId) {
        return res.status(403).json({ message: "Access denied to one or more todos" });
      }
    }
    await storage.reorderPersonalTodos(todoIds, status);
    res.json({ message: "Todos reordered successfully" });
  } catch (error) {
    logger.error("Error reordering todos:", error);
    res.status(500).json({ message: "Failed to reorder todos" });
  }
});

export default router;
