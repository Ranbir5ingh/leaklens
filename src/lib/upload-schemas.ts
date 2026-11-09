import { z } from "zod";

const cell = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
export const rawRowSchema = z.record(z.string().max(120), cell);

export const mappingSchema = z.object({
  fields: z.record(z.string().max(40), z.string().max(120).nullable()),
  weightUnit: z.enum(["kg", "g"]).optional(),
});

export const suggestBody = z.object({
  sourceId: z.number().int().positive(),
  headers: z.array(z.string().max(120)).min(1).max(80),
  sample: z.array(rawRowSchema).max(20),
  forceAI: z.boolean().optional(),
});

export const createUploadBody = z.object({
  sourceId: z.number().int().positive(),
  fileName: z.string().trim().min(1).max(200),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  rowCount: z.number().int().min(1).max(500_000),
  headers: z.array(z.string().max(120)).min(1).max(80),
  mapping: mappingSchema,
  mappingChanged: z.boolean(),
  approvedPreview: z.literal(true, { message: "Preview must be approved before saving" }),
  engine: z.enum(["saved", "gemini+heuristic", "heuristic", "manual"]),
  model: z.string().max(60).optional(),
  note: z.string().trim().max(300).optional(),
});

export const chunkBody = z.object({
  startRow: z.number().int().min(2),
  rows: z.array(rawRowSchema).min(1).max(5000),
});

export const CHUNK_ROWS = 5000;
