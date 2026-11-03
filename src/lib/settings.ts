import { db, type Client } from "./db";

export function getSettings(client: Client = db) {
  return client.settings.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });
}
