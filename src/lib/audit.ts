import { db, type Client } from "./db";

/** Adds to the permanent activity log. Nothing in the app edits or removes these rows. */
export function audit(actorId: string | null, action: string, detail: string, client: Client = db) {
  return client.auditLog.create({ data: { actorId, action, detail } });
}
