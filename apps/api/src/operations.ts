import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  schemas,
  conflictingFields,
  completionPatch,
  type Entity,
  type Operation,
  type Task,
} from "@pulso/shared";

export const entityView = (r: any): Entity => ({
  id: r.id,
  type: r.type,
  data: r.data,
  version: r.version,
  deletedAt: r.deleted_at?.toISOString() ?? null,
  updatedAt: r.updated_at.toISOString(),
});
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function applyOperation(
  c: PoolClient,
  owner: string,
  op: Operation,
  date: string,
): Promise<any> {
  const existing = (
    await c.query("SELECT result FROM operations WHERE id=$1 AND owner_id=$2", [
      op.id,
      owner,
    ])
  ).rows[0];
  if (existing) return existing.result;
  const row = (
    await c.query(
      "SELECT * FROM entities WHERE id=$1 AND owner_id=$2 FOR UPDATE",
      [op.entityId, owner],
    )
  ).rows[0];
  const current = row ? entityView(row) : null;
  if (current && current.type !== op.type)
    throw new HttpError(400, "Tipo de registro incompatible");
  const conflict = (fields: string[]) => ({
    operationId: op.id,
    status: "conflict",
    entity: current,
    fields,
  });
  if (current?.deletedAt && op.action !== "restore")
    return conflict(["deletedAt"]);
  if (op.action === "restore" && !current?.deletedAt)
    throw new HttpError(400, "El registro no está en la papelera");
  if (!current && (op.baseVersion !== 0 || op.action !== "put"))
    throw new HttpError(409, "El registro original no existe");
  if (current && op.baseVersion === 0) return conflict(["id"]);
  if (current && op.baseVersion !== current.version) {
    // A recurring completion is already applied when a second device submits the same occurrence.
    if (
      op.action === "complete" &&
      op.occurrence &&
      (
        await c.query(
          "SELECT 1 FROM completions WHERE task_id=$1 AND occurrence=$2",
          [op.entityId, op.occurrence],
        )
      ).rowCount
    ) {
      const result = { operationId: op.id, status: "ok", entity: current };
      await remember(c, owner, op.id, result);
      return result;
    }
    if (op.action !== "put") return conflict(["version"]);
    const fields = conflictingFields(
      current.data as unknown as Record<string, unknown>,
      op.base,
      op.patch,
    );
    if (fields.length) return conflict(fields);
  }
  let data = { ...(current?.data ?? {}), ...op.patch } as Record<
    string,
    unknown
  >;
  if (op.action === "complete") {
    if (op.type !== "task" || !current)
      throw new HttpError(400, "Solo se completan tareas");
    const task = current.data as Task;
    if (op.occurrence !== task.scheduledDate)
      return conflict(["scheduledDate"]);
    data = { ...task, ...completionPatch(task, date) };
    if (!task.completedAt)
      await c.query(
        "INSERT INTO completions(id,owner_id,task_id,occurrence) VALUES($1,$2,$3,$4) ON CONFLICT(task_id,occurrence) DO NOTHING",
        [
          randomUUID(),
          owner,
          op.entityId,
          task.recurrence ? op.occurrence : `once:${current.version}`,
        ],
      );
  }
  if (op.type === "project") {
    if (data.isInbox && !(current?.data as any)?.isInbox)
      throw new HttpError(400, "La bandeja de entrada ya existe");
    if (
      (current?.data as any)?.isInbox &&
      (op.action === "delete" || data.isInbox !== true || data.archived)
    )
      throw new HttpError(
        400,
        "La bandeja de entrada no se puede eliminar ni archivar",
      );
  }
  if (op.action === "delete") {
    const { rowCount } = await c.query(
      `SELECT 1 FROM entities WHERE owner_id=$1 AND deleted_at IS NULL AND id<>$2::uuid AND (
      (type='task' AND (data->>'parentId'=$2::text OR data->>'projectId'=$2::text OR data->>'sectionId'=$2::text OR data->'labelIds' ? $2::text)) OR
      (type='section' AND data->>'projectId'=$2::text)) LIMIT 1`,
      [owner, op.entityId],
    );
    if (rowCount)
      throw new HttpError(
        409,
        "Primero mueve o elimina los registros que dependen de este elemento",
      );
  } else {
    data = schemas[op.type].parse(data) as unknown as Record<string, unknown>;
    await validateReferences(c, owner, op.entityId, op.type, data);
  }
  const resultRow = (
    await c.query(
      `INSERT INTO entities(id,owner_id,type,data,version,deleted_at) VALUES($1,$2,$3,$4,1,$5)
    ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,version=entities.version+1,deleted_at=EXCLUDED.deleted_at,updated_at=now()
    WHERE entities.owner_id=EXCLUDED.owner_id RETURNING *`,
      [
        op.entityId,
        owner,
        op.type,
        data,
        op.action === "delete" ? new Date() : null,
      ],
    )
  ).rows[0];
  if (!resultRow) throw new HttpError(409, "Identificador no disponible");
  const entity = entityView(resultRow);
  await c.query("INSERT INTO changes(owner_id,entity) VALUES($1,$2)", [
    owner,
    entity,
  ]);
  const result = { operationId: op.id, status: "ok", entity };
  await remember(c, owner, op.id, result);
  return result;
}
async function remember(
  c: PoolClient,
  owner: string,
  opId: string,
  result: any,
) {
  await c.query("INSERT INTO operations(id,owner_id,result) VALUES($1,$2,$3)", [
    opId,
    owner,
    result,
  ]);
}
async function validateReferences(
  c: PoolClient,
  owner: string,
  entityId: string,
  type: string,
  data: Record<string, unknown>,
) {
  const get = async (id: unknown, expected: string) => {
    const row = (
      await c.query(
        "SELECT data FROM entities WHERE id=$1 AND owner_id=$2 AND type=$3 AND deleted_at IS NULL",
        [id, owner, expected],
      )
    ).rows[0];
    if (!row) throw new HttpError(400, `Referencia ${expected} no válida`);
    return row.data;
  };
  if (type === "section" || type === "task")
    await get(data.projectId, "project");
  if (type === "task") {
    if (
      (
        await c.query(
          `SELECT 1 FROM entities WHERE owner_id=$1 AND type='task' AND deleted_at IS NULL AND data->>'parentId'=$2 AND data->>'projectId'<>$3 LIMIT 1`,
          [owner, entityId, data.projectId],
        )
      ).rowCount
    )
      throw new HttpError(
        400,
        "Mueve primero las subtareas al proyecto de destino",
      );
    if (
      data.sectionId &&
      (await get(data.sectionId, "section")).projectId !== data.projectId
    )
      throw new HttpError(400, "La sección pertenece a otro proyecto");
    if (data.parentId) {
      const parent = await get(data.parentId, "task");
      if (parent.projectId !== data.projectId)
        throw new HttpError(
          400,
          "La subtarea debe pertenecer al mismo proyecto",
        );
      let cursor: string | null = data.parentId as string;
      for (let n = 0; cursor; n++) {
        if (cursor === entityId || n > 100)
          throw new HttpError(400, "La jerarquía no puede contener ciclos");
        cursor = (await get(cursor, "task")).parentId;
      }
    }
    for (const label of data.labelIds as string[]) await get(label, "label");
  }
  if (
    type === "section" &&
    (
      await c.query(
        `SELECT 1 FROM entities WHERE owner_id=$1 AND type='task' AND deleted_at IS NULL AND data->>'sectionId'=$2 AND data->>'projectId'<>$3 LIMIT 1`,
        [owner, entityId, data.projectId],
      )
    ).rowCount
  )
    throw new HttpError(400, "La sección contiene tareas de otro proyecto");
}
