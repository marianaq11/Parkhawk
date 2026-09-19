import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[<>\x00-\x08]/.test(s),
      "Use plain text without angle brackets.",
    );
const base = {
  parking_location_id: z.uuid(),
  note: text(180).default(""),
  zone_or_floor: text(30).default(""),
};
export const reportSchema = z.discriminatedUnion("report_type", [
  z.object({
    ...base,
    report_type: z.literal("OPEN_SPOT"),
    quantity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.object({
    ...base,
    report_type: z.literal("LEAVING_SOON"),
    leaving_eta_minutes: z.union([z.literal(0), z.literal(10), z.literal(30)]),
  }),
  z.object({ ...base, report_type: z.literal("SEARCHING") }),
  z.object({
    ...base,
    report_type: z.literal("TRAFFIC"),
    traffic_level: z.enum(["LIGHT", "MODERATE", "HEAVY"]),
  }),
]);
export type ReportInput = z.infer<typeof reportSchema>;
export const loginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(128),
});
export const feedbackSchema = z.object({
  report_id: z.uuid(),
  feedback_type: z.enum(["STILL_OPEN", "TAKEN"]),
});
export const locationSchema = z.object({
  id: z.uuid().optional(),
  name: text(60).pipe(z.string().min(2)),
  description: text(240),
  location_type: z.enum(["GARAGE", "SURFACE_LOT", "DECK"]),
  active: z.boolean(),
});
export const adminSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("location"), location: locationSchema }),
  z.object({
    action: z.literal("suspend"),
    user_id: z.uuid(),
    hours: z.union([z.literal(0), z.literal(1), z.literal(24), z.literal(168)]),
  }),
  z.object({ action: z.literal("remove"), report_id: z.uuid() }),
]);
export type AdminInput = z.infer<typeof adminSchema>;
