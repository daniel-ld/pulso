import { randomUUID } from "node:crypto";
const origin = process.env.APP_ORIGIN;
if (origin !== "http://localhost:4173")
  throw new Error("La demostración solo se permite en http://localhost:4173");
async function api(path, body, cookie) {
  const response = await fetch(origin + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return { data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
if (!(await api("/auth/status")).data.needsSetup) {
  console.log("Ya existe una cuenta local; se conservó sin cambios.");
  process.exit(0);
}
const { data, cookie } = await api("/auth/setup", {
  name: "Daniel",
  email: "demo@pulso.local",
  password: "Pulso-local-demo-2026!",
  setupKey: process.env.SETUP_KEY,
});
const snapshot = (await api("/sync/snapshot", undefined, cookie)).data;
const inbox = snapshot.entities.find((e) => e.data.isInbox).id;
const operations = [];
const put = (type, patch) => {
  const id = randomUUID();
  operations.push({
    id: randomUUID(),
    entityId: id,
    type,
    action: "put",
    baseVersion: 0,
    base: {},
    patch,
  });
  return id;
};
const personal = put("project", {
  name: "Personal",
  color: "#e28c3d",
  isInbox: false,
  archived: false,
  sortOrder: 1,
});
const work = put("project", {
  name: "Trabajo",
  color: "#6c48e5",
  isInbox: false,
  archived: false,
  sortOrder: 2,
});
const ideas = put("project", {
  name: "Ideas y proyectos",
  color: "#29a17c",
  isInbox: false,
  archived: false,
  sortOrder: 3,
});
const label = put("label", { name: "Enfoque", color: "#6c48e5" });
put("filter", { name: "Lo importante", query: "p1 | p2" });
const section = put("section", {
  name: "En marcha",
  projectId: work,
  sortOrder: 1,
});
const tz = "America/Mexico_City";
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: tz,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const date = ["year", "month", "day"]
  .map((k) => parts.find((p) => p.type === k).value)
  .join("-");
const yesterday = new Date(date + "T12:00:00Z");
yesterday.setUTCDate(yesterday.getUTCDate() - 1);
const tomorrow = new Date(date + "T12:00:00Z");
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
let order = 0;
function task(title, projectId, extra = {}) {
  return put("task", {
    title,
    description: "",
    projectId,
    sectionId: null,
    parentId: null,
    priority: 4,
    labelIds: [],
    scheduledDate: date,
    deadline: null,
    recurrence: null,
    completedAt: null,
    sortOrder: ++order * 1000,
    ...extra,
  });
}
task("Revisar la propuesta del proyecto", work, {
  sectionId: section,
  description: "Dar una última lectura y anotar los siguientes pasos.",
  priority: 1,
  scheduledDate: yesterday.toISOString().slice(0, 10),
  labelIds: [label],
});
task("Planear las tres prioridades de hoy", work, {
  sectionId: section,
  priority: 2,
  labelIds: [label],
});
task("Salir a caminar, sin prisa", personal, {
  recurrence: { frequency: "day", interval: 1, anchor: "calendar" },
});
task("Leer un capítulo del libro pendiente", personal, {
  description: "Veinte minutos también hacen la diferencia.",
  priority: 3,
});
task("Una idea para mi próxima app", ideas, {
  description: "Un lugar para guardar lo que todavía está tomando forma.",
});
task("Ordenar las ideas que tengo en la cabeza", inbox, {
  scheduledDate: tomorrow.toISOString().slice(0, 10),
});
task("Preparar mi espacio de trabajo", work, {
  completedAt: new Date().toISOString(),
});
await api("/sync/push", { operations, timeZone: tz }, cookie);
console.log(
  "Demostración local creada. Credenciales de prueba documentadas en README.md; nunca usarlas en producción.",
);
