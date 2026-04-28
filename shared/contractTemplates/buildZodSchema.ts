import { z, ZodTypeAny } from "zod";
import type { VariablesSchema, SimpleVariable, VariableType } from "./types";

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/i;

function leafSchemaForType(t: VariableType): ZodTypeAny {
  switch (t) {
    case "text":   return z.string().min(1);
    case "number": return z.coerce.number();
    case "date":   return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case "money":  return z.string().min(1);
    case "iban":   return z.string().regex(IBAN_RE, "Invalid IBAN");
    case "email":  return z.string().email();
    case "phone":  return z.string().min(5);
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ZodRawShape extends Record<string, ZodTypeAny | ZodRawShape> {}

function setByPath(target: ZodRawShape, key: string, leaf: ZodTypeAny) {
  const parts = key.split(".");
  let cursor: ZodRawShape = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in cursor)) cursor[p] = {};
    cursor = cursor[p] as ZodRawShape;
  }
  (cursor as Record<string, ZodTypeAny>)[parts[parts.length - 1]] = leaf;
}

function hasRequiredLeaf(shape: ZodRawShape): boolean {
  for (const v of Object.values(shape)) {
    if (v && typeof v === "object" && !("_def" in (v as object))) {
      if (hasRequiredLeaf(v as ZodRawShape)) return true;
    } else {
      // It's a ZodTypeAny — required if it is NOT optional/nullable
      const zv = v as ZodTypeAny;
      const typeName = (zv as { _def?: { typeName?: string } })._def?.typeName;
      if (typeName !== "ZodOptional" && typeName !== "ZodNullable") return true;
    }
  }
  return false;
}

function shapeToZod(shape: ZodRawShape): ZodTypeAny {
  const out: Record<string, ZodTypeAny> = {};
  for (const [k, v] of Object.entries(shape)) {
    if (v && typeof v === "object" && !("_def" in (v as object))) {
      const nested = shapeToZod(v as ZodRawShape);
      // Make the container optional when none of its descendants are required
      out[k] = hasRequiredLeaf(v as ZodRawShape) ? nested : nested.optional();
    } else {
      out[k] = v as ZodTypeAny;
    }
  }
  return z.object(out);
}

export function buildZodSchema(schema: VariablesSchema): ZodTypeAny {
  const shape: ZodRawShape = {};

  for (const v of schema.simple as SimpleVariable[]) {
    if (v.source) continue; // auto-injected server-side
    let leaf = leafSchemaForType(v.type);
    if (!v.required) leaf = leaf.optional();
    setByPath(shape, v.key, leaf);
  }

  for (const list of schema.selectableLists) {
    const allowedIds = list.options.map((o) => o.id);
    const leaf = z.object({ id: z.enum(allowedIds as [string, ...string[]]) }).passthrough();
    setByPath(shape, list.key, leaf);
  }

  return shapeToZod(shape);
}
