import Dexie, { type Table } from "dexie";
import {
  schemas,
  completionPatch,
  today,
  type Entity,
  type EntityType,
  type Operation,
  type Pending,
  type Task,
} from "@pulso/shared";

export interface User {
  id: string;
  email: string;
  name: string;
}
export class LocalDatabase extends Dexie {
  entities!: Table<Entity, string>;
  outbox!: Table<Pending, string>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor(userId: string) {
    super(`pulso-${userId}`);
    this.version(1).stores({
      entities: "id,type",
      outbox: "id,localOrder,entityId",
      meta: "key",
    });
  }
}
export let db: LocalDatabase;
export let currentUser: User | null = null;
let synchronization: Promise<void> | null = null;
let rerun = false;
let channel: BroadcastChannel | null = null;
export type SyncState = {
  mode: "syncing" | "online" | "offline" | "error" | "expired";
  message: string;
};
let state: SyncState = {
  mode: navigator.onLine ? "online" : "offline",
  message: "",
};
const listeners = new Set<(s: SyncState) => void>();
const publish = (next: SyncState) => {
  state = next;
  listeners.forEach((l) => l(next));
};
export function subscribe(fn: (s: SyncState) => void) {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}
export function closeLocal() {
  channel?.close();
  channel = null;
  db?.close();
  currentUser = null;
}
export async function api(path: string, body?: unknown) {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(payload.error ?? "No se pudo conectar"), {
      status: response.status,
      details: payload.details,
    });
  return payload;
}
export async function openUser(user: User) {
  channel?.close();
  db?.close();
  currentUser = user;
  db = new LocalDatabase(user.id);
  await db.open();
  localStorage.setItem("pulso-user", JSON.stringify(user));
  channel = new BroadcastChannel(`pulso-${user.id}`);
  channel.onmessage = () => {
    void synchronize();
  };
  await synchronize();
}
function notifyMutation() {
  channel?.postMessage("changed");
  void synchronize();
}
export async function mutate(
  type: EntityType,
  entityId: string,
  patch: Record<string, unknown>,
  action: Operation["action"] = "put",
  notify = true,
) {
  await db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
    const current = await db.entities.get(entityId);
    if (current?.deletedAt && action !== "restore")
      throw new Error(
        "Este registro fue eliminado. Puedes recuperarlo desde la papelera.",
      );
    let data = { ...(current?.data ?? {}), ...patch };
    if (action === "complete")
      data = {
        ...current!.data,
        ...completionPatch(current!.data as Task, today()),
      };
    if (action !== "delete") data = schemas[type].parse(data);
    const localOrder = Math.max(
      Date.now() * 1000,
      Number((await db.meta.get("operationSequence"))?.value ?? 0) + 1,
    );
    await db.meta.put({ key: "operationSequence", value: String(localOrder) });
    const operation: Pending = {
      id: crypto.randomUUID(),
      entityId,
      type,
      action,
      patch,
      baseVersion: current?.version ?? 0,
      base: (current?.data ?? {}) as unknown as Record<string, unknown>,
      occurrence:
        action === "complete"
          ? (current!.data as Task).scheduledDate
          : undefined,
      localOrder,
    };
    const entity: Entity = {
      id: entityId,
      type,
      data: data as Entity["data"],
      version: operation.baseVersion + 1,
      deletedAt: action === "delete" ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    };
    await db.entities.put(entity);
    await db.outbox.add(operation);
  });
  if (notify) notifyMutation();
}
function replay(base: Entity, pending: Pending[]): Entity {
  let current = base;
  for (const op of pending) {
    const data =
      op.action === "complete"
        ? { ...current.data, ...completionPatch(current.data as Task, today()) }
        : { ...current.data, ...op.patch };
    current = {
      ...current,
      data,
      version: current.version + 1,
      deletedAt:
        op.action === "delete"
          ? new Date().toISOString()
          : op.action === "restore"
            ? null
            : current.deletedAt,
    };
  }
  return current;
}
async function acceptRemote(entities: Entity[], cursor?: string) {
  await db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
    for (const entity of entities) {
      const pending = await db.outbox
        .where("entityId")
        .equals(entity.id)
        .sortBy("localOrder");
      await db.entities.put(replay(entity, pending));
    }
    if (cursor !== undefined)
      await db.meta.put({ key: "cursor", value: cursor });
  });
}
async function syncOnce() {
  if (!navigator.onLine) {
    publish({
      mode: "offline",
      message: "Tus cambios se guardan en este dispositivo",
    });
    return;
  }
  publish({ mode: "syncing", message: "" });
  if (!(await db.meta.get("initialized"))) {
    const snapshot = await api("/sync/snapshot");
    await acceptRemote(snapshot.entities, snapshot.cursor);
    await db.meta.put({ key: "initialized", value: "1" });
  }
  const operations = await db.outbox.orderBy("localOrder").toArray();
  const blocked = new Set<string>();
  for (const pending of operations) {
    if (pending.conflict || pending.rejected || blocked.has(pending.entityId)) {
      blocked.add(pending.entityId);
      continue;
    }
    // Re-read because another browser tab may already have consumed the operation.
    if (!(await db.outbox.get(pending.id))) continue;
    const {
      conflict: _conflict,
      localOrder: _order,
      rejected: _rejected,
      ...operation
    } = pending;
    let response;
    try {
      response = await api("/sync/push", {
        operations: [operation],
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch (e) {
      if ([400, 409].includes((e as { status?: number }).status ?? 0)) {
        await db.outbox.update(pending.id, { rejected: (e as Error).message });
        blocked.add(pending.entityId);
        continue;
      }
      throw e;
    }
    const result = response.results[0];
    await db.transaction("rw", db.entities, db.outbox, async () => {
      if (result.status === "conflict") {
        await db.outbox.update(pending.id, {
          conflict: { server: result.entity, fields: result.fields },
        });
        blocked.add(pending.entityId);
      } else {
        await db.outbox.delete(pending.id);
        const remaining = await db.outbox
          .where("entityId")
          .equals(pending.entityId)
          .sortBy("localOrder");
        await db.entities.put(replay(result.entity, remaining));
      }
    });
  }
  let hasMore = true;
  while (hasMore) {
    const cursor = (await db.meta.get("cursor"))?.value ?? "0";
    const response = await api(`/sync/pull?cursor=${cursor}`);
    await acceptRemote(response.entities, response.cursor);
    hasMore = response.hasMore;
  }
  publish({ mode: "online", message: "" });
}
export function synchronize(): Promise<void> {
  if (!db?.isOpen()) return Promise.resolve();
  if (synchronization) {
    rerun = true;
    return synchronization;
  }
  synchronization = (async () => {
    do {
      rerun = false;
      try {
        if (navigator.locks)
          await navigator.locks.request(
            `pulso-sync-${currentUser!.id}`,
            syncOnce,
          );
        else await syncOnce();
      } catch (e) {
        const error = e as Error & { status?: number };
        publish({
          mode:
            error.status === 401
              ? "expired"
              : !navigator.onLine
                ? "offline"
                : "error",
          message: error.message,
        });
      }
    } while (rerun && db?.isOpen());
  })().finally(() => {
    synchronization = null;
  });
  return synchronization;
}
export async function resolveConflict(
  operationId: string,
  choice: "local" | "server",
) {
  await db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
    const op = await db.outbox.get(operationId);
    if (!op?.conflict) return;
    const server = op.conflict.server;
    const related = await db.outbox
      .where("entityId")
      .equals(op.entityId)
      .sortBy("localOrder");
    // Keep the losing variants in the local recovery ledger as well as JSON backups.
    await db.meta.put({
      key: `conflict:${Date.now()}:${op.id}`,
      value: JSON.stringify({ server, pending: related, choice }),
    });
    await db.outbox.bulkDelete(related.map((o) => o.id));
    await db.entities.put(server);
    if (choice === "local" && !server.deletedAt) {
      let base = server;
      for (const p of related) {
        const revised: Pending = {
          ...p,
          id: crypto.randomUUID(),
          baseVersion: base.version,
          base: base.data as unknown as Record<string, unknown>,
          conflict: undefined,
          occurrence:
            p.action === "complete"
              ? (base.data as Task).scheduledDate
              : p.occurrence,
        };
        await db.outbox.add(revised);
        base = replay(base, [revised]);
      }
      await db.entities.put(base);
    }
  });
  notifyMutation();
}
export async function exportBackup() {
  return {
    format: "pulso-backup",
    version: 1,
    userId: currentUser!.id,
    exportedAt: new Date().toISOString(),
    entities: await db.entities.toArray(),
    pending: await db.outbox.toArray(),
    recovery: await db.meta
      .filter((m) => m.key.startsWith("conflict:"))
      .toArray(),
  };
}
export async function discardRejected(entityId: string) {
  const snapshot = await api("/sync/snapshot");
  const remote = snapshot.entities.find((e: Entity) => e.id === entityId);
  await db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
    const related = await db.outbox
      .where("entityId")
      .equals(entityId)
      .toArray();
    await db.meta.put({
      key: `conflict:${Date.now()}:${entityId}`,
      value: JSON.stringify({ rejected: related, remote }),
    });
    await db.outbox.bulkDelete(related.map((op) => op.id));
    if (remote) await db.entities.put(remote);
    else await db.entities.delete(entityId);
  });
  notifyMutation();
}
export async function restoreBackup(input: unknown) {
  const value = input as Awaited<ReturnType<typeof exportBackup>>;
  if (
    value?.format !== "pulso-backup" ||
    value.version !== 1 ||
    value.userId !== currentUser!.id ||
    !Array.isArray(value.entities) ||
    value.entities.length > 50000
  )
    throw new Error("Este respaldo no es válido o pertenece a otra cuenta");
  if (await db.outbox.count())
    throw new Error(
      "Sincroniza o resuelve los cambios pendientes antes de restaurar",
    );
  const ids = new Set<string>();
  for (const entity of value.entities) {
    if (
      !/^[0-9a-f-]{36}$/i.test(entity.id) ||
      ids.has(entity.id) ||
      !schemas[entity.type]
    )
      throw new Error("Identificadores de respaldo inválidos");
    ids.add(entity.id);
    schemas[entity.type].parse(entity.data);
  }
  // Parents precede children. Existing server tombstones cannot be resurrected by import.
  const ordered = [...value.entities]
    .filter((e) => !e.deletedAt)
    .sort(
      (a, b) =>
        ["project", "label", "section", "task", "filter"].indexOf(a.type) -
        ["project", "label", "section", "task", "filter"].indexOf(b.type),
    );
  const added = new Set<string>();
  const sorted: Entity[] = [];
  let rest = ordered;
  while (rest.length) {
    const ready = rest.filter(
      (e) =>
        e.type !== "task" ||
        !(e.data as Task).parentId ||
        added.has((e.data as Task).parentId!),
    );
    if (!ready.length)
      throw new Error("El respaldo contiene una jerarquía inválida");
    for (const entity of ready) {
      sorted.push(entity);
      added.add(entity.id);
    }
    rest = rest.filter((e) => !added.has(e.id));
  }
  await db.transaction("rw", db.entities, db.outbox, db.meta, async () => {
    for (const entity of sorted) {
      const current = await db.entities.get(entity.id);
      if (!current?.deletedAt)
        await mutate(
          entity.type,
          entity.id,
          entity.data as unknown as Record<string, unknown>,
          "put",
          false,
        );
    }
  });
  notifyMutation();
}
window.addEventListener("online", () => {
  void synchronize();
});
window.addEventListener("offline", () =>
  publish({
    mode: "offline",
    message: "Tus cambios se guardan en este dispositivo",
  }),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void synchronize();
});
setInterval(() => {
  if (!document.hidden) void synchronize();
}, 20000);
