import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Fecha inválida");
const id = z.uuid();
const sort = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const recurrenceSchema = z.object({
  frequency: z.enum(["day", "week", "month"]),
  interval: z.number().int().min(1).max(365),
  anchor: z.enum(["calendar", "completion"]),
  anchorDay: z.number().int().min(1).max(31).optional(),
});
export const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).default(""),
    projectId: id,
    sectionId: id.nullable().default(null),
    parentId: id.nullable().default(null),
    priority: z.number().int().min(1).max(4).default(4),
    labelIds: z.array(id).max(50).default([]),
    scheduledDate: dateSchema.nullable().default(null),
    deadline: dateSchema.nullable().default(null),
    recurrence: recurrenceSchema.nullable().default(null),
    completedAt: z.iso.datetime().nullable().default(null),
    reminderAt: z.iso.datetime().nullable().default(null),
    sortOrder: sort.default(0),
  })
  .refine(
    (t) => !t.recurrence || !!t.scheduledDate,
    "La repetición necesita una fecha",
  );
export const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: color.default("#64748b"),
  isInbox: z.boolean().default(false),
  archived: z.boolean().default(false),
  sortOrder: sort.default(0),
});
export const sectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  projectId: id,
  sortOrder: sort.default(0),
});
export const labelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: color.default("#64748b"),
});
export const filterSchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(300),
});
export const entityTypes = [
  "task",
  "project",
  "section",
  "label",
  "filter",
] as const;
export type EntityType = (typeof entityTypes)[number];
export const schemas = {
  task: taskSchema,
  project: projectSchema,
  section: sectionSchema,
  label: labelSchema,
  filter: filterSchema,
};
export type Task = z.infer<typeof taskSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Label = z.infer<typeof labelSchema>;
export type SavedFilter = z.infer<typeof filterSchema>;
export type Data = Task | Project | Section | Label | SavedFilter;
export interface Entity<T = Data> {
  id: string;
  type: EntityType;
  data: T;
  version: number;
  deletedAt: string | null;
  updatedAt: string;
}
export const operationSchema = z.object({
  id,
  entityId: id,
  type: z.enum(entityTypes),
  action: z.enum(["put", "delete", "complete", "restore"]),
  baseVersion: z.number().int().nonnegative(),
  base: z.record(z.string(), z.unknown()),
  patch: z.record(z.string(), z.unknown()),
  occurrence: dateSchema.nullable().optional(),
});
export type Operation = z.infer<typeof operationSchema>;
export type Pending = Operation & {
  localOrder: number;
  conflict?: { server: Entity; fields: string[] };
  rejected?: string;
};
export function today(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function addDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function nextOccurrence(
  date: string,
  rule: NonNullable<Task["recurrence"]>,
  completedDate: string,
): string {
  let current = rule.anchor === "completion" ? completedDate : date;
  const anchorDay =
    rule.anchor === "completion"
      ? Number(completedDate.slice(-2))
      : (rule.anchorDay ?? Number(date.slice(-2)));
  for (let i = 0; i < 10000; i++) {
    if (rule.frequency === "month") {
      const d = new Date(current + "T12:00:00Z");
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + rule.interval);
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate();
      d.setUTCDate(Math.min(anchorDay, last));
      current = d.toISOString().slice(0, 10);
    } else
      current = addDays(
        current,
        rule.interval * (rule.frequency === "week" ? 7 : 1),
      );
    if (current > completedDate) return current;
  }
  throw new Error("Regla fuera de rango");
}
export function completionPatch(
  task: Task,
  completedDate: string,
  now = new Date().toISOString(),
): Partial<Task> {
  if (task.recurrence && task.scheduledDate)
    return {
      scheduledDate: nextOccurrence(
        task.scheduledDate,
        task.recurrence,
        completedDate,
      ),
      completedAt: null,
      reminderAt: null,
      recurrence: {
        ...task.recurrence,
        anchorDay:
          task.recurrence.anchorDay ?? Number(task.scheduledDate.slice(-2)),
      },
    };
  return { completedAt: task.completedAt ? null : now };
}
export function conflictingFields(
  current: Record<string, unknown>,
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): string[] {
  return Object.keys(patch).filter(
    (k) =>
      JSON.stringify(current[k]) !== JSON.stringify(base[k]) &&
      JSON.stringify(current[k]) !== JSON.stringify(patch[k]),
  );
}
// Deliberately small, documented query language. Unknown tokens fail instead of matching everything.
export function matchesFilter(
  task: Task,
  query: string,
  date = today(),
): boolean {
  return query
    .toLowerCase()
    .split("|")
    .some((group) =>
      group.split("&").every((raw) => {
        const token = raw.trim();
        const negate = token.startsWith("!");
        const q = negate ? token.slice(1).trim() : token;
        let match: boolean;
        if (q === "hoy" || q === "today") match = task.scheduledDate === date;
        else if (q === "vencidas" || q === "overdue")
          match = !!task.scheduledDate && task.scheduledDate < date;
        else if (q === "sin fecha") match = !task.scheduledDate;
        else if (/^p[1-4]$/.test(q)) match = task.priority === Number(q[1]);
        else if (q.startsWith("texto:"))
          match = task.title.toLowerCase().includes(q.slice(6).trim());
        else if (q.startsWith("proyecto:"))
          match = task.projectId === q.slice(9).trim();
        else if (q.startsWith("etiqueta:"))
          match = task.labelIds.includes(q.slice(9).trim());
        else return false;
        return negate ? !match : match;
      }),
    );
}
