import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  postopDeviationAcknowledgments,
  type PostopDeviationAcknowledgment,
  type NewPostopDeviationAcknowledgment,
} from '@shared/schema';

export async function listAcks(anesthesiaRecordId: string): Promise<PostopDeviationAcknowledgment[]> {
  return db.select().from(postopDeviationAcknowledgments)
    .where(eq(postopDeviationAcknowledgments.anesthesiaRecordId, anesthesiaRecordId));
}

export async function createAck(input: NewPostopDeviationAcknowledgment): Promise<PostopDeviationAcknowledgment> {
  const [row] = await db.insert(postopDeviationAcknowledgments).values(input).returning();
  return row;
}
