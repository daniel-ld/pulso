import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionPatch,
  conflictingFields,
  dateSchema,
  matchesFilter,
  nextOccurrence,
  taskSchema,
} from "../packages/shared/src/index.ts";
const projectId = "d901bc92-325b-463d-a7f5-77970889623a";
test("valida fechas reales, incluidos años bisiestos", () => {
  assert.equal(dateSchema.safeParse("2024-02-29").success, true);
  assert.equal(dateSchema.safeParse("2025-02-29").success, false);
  assert.equal(dateSchema.safeParse("2026-13-01").success, false);
});
test("repetición mensual conserva el día 31 tras febrero", () => {
  const rule = {
    frequency: "month" as const,
    interval: 1,
    anchor: "calendar" as const,
    anchorDay: 31,
  };
  const feb = nextOccurrence("2026-01-31", rule, "2026-01-31");
  assert.equal(feb, "2026-02-28");
  assert.equal(nextOccurrence(feb, rule, feb), "2026-03-31");
});
test("distingue calendario de fecha de finalización y omite ocurrencias atrasadas", () => {
  assert.equal(
    nextOccurrence(
      "2026-11-02",
      { frequency: "week", interval: 1, anchor: "calendar" },
      "2026-11-26",
    ),
    "2026-11-30",
  );
  assert.equal(
    nextOccurrence(
      "2026-11-02",
      { frequency: "week", interval: 1, anchor: "completion" },
      "2026-11-26",
    ),
    "2026-12-03",
  );
});
test("completar recurrente avanza fecha; una tarea normal se puede reabrir", () => {
  const task = taskSchema.parse({
    title: "Leer",
    projectId,
    scheduledDate: "2026-11-26",
    recurrence: { frequency: "day", interval: 1, anchor: "calendar" },
  });
  assert.equal(completionPatch(task, "2026-11-26").scheduledDate, "2026-11-27");
  assert.equal(
    completionPatch(
      { ...task, recurrence: null, completedAt: "2026-11-26T10:00:00.000Z" },
      "2026-11-26",
    ).completedAt,
    null,
  );
});
test("fusiona campos independientes y detecta conflictos del mismo campo", () => {
  assert.deepEqual(
    conflictingFields(
      { title: "Servidor", priority: 4 },
      { title: "Original", priority: 4 },
      { priority: 1 },
    ),
    [],
  );
  assert.deepEqual(
    conflictingFields(
      { title: "Servidor" },
      { title: "Original" },
      { title: "Local" },
    ),
    ["title"],
  );
});
test("filtros combinan AND, OR y negación; un token desconocido no muestra todo", () => {
  const task = taskSchema.parse({
    title: "Leer",
    projectId,
    scheduledDate: "2026-11-26",
    priority: 1,
  });
  assert.equal(matchesFilter(task, "hoy & p1", "2026-11-26"), true);
  assert.equal(
    matchesFilter(task, "vencidas | texto:leer", "2026-11-26"),
    true,
  );
  assert.equal(matchesFilter(task, "!p1", "2026-11-26"), false);
  assert.equal(matchesFilter(task, "desconocido", "2026-11-26"), false);
});
