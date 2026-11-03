import { isDay, today } from "./dates";
import { db, type Client, type Tx } from "./db";
import { toMilli } from "./metrics";

export const RECORD_TYPES = ["EGGS", "FEED", "DEATHS", "WEIGHT", "VACCINE", "TASK"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];
export type SyncItem = { clientId: string; type: RecordType; payload: Record<string, unknown> };
export type SyncResult = { clientId: string; status: "saved" | "rejected"; reason?: string };

export class RecordError extends Error {}

function count(value: unknown, label: string, min = 0) {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < min) throw new RecordError(`${label} must be a whole number${min ? ` of at least ${min}` : ""}.`);
  return parsed;
}

function day(value: unknown) {
  if (!isDay(value) || value > today()) throw new RecordError("Choose a valid date, not in the future.");
  return value;
}

async function flockFor(tx: Tx, flockId: unknown, farmIds: string[]) {
  const flock = await tx.flock.findUnique({ where: { id: String(flockId) }, include: { house: true } });
  if (!flock || !farmIds.includes(flock.house.farmId)) throw new RecordError("You cannot record for this flock.");
  return flock;
}

/** Keeps a farm's egg stock item in step with what is collected. */
export async function eggStockItem(client: Client, farmId: string) {
  const existing = await client.inventoryItem.findFirst({ where: { farmId, category: "EGGS" } });
  return existing ?? client.inventoryItem.create({ data: { farmId, name: "Eggs", category: "EGGS", unit: "eggs" } });
}

async function apply(tx: Tx, userId: string, farmIds: string[], type: RecordType, data: Record<string, unknown>) {
  switch (type) {
    case "EGGS": {
      const flock = await flockFor(tx, data.flockId, farmIds);
      const [large, medium, small, broken] = [count(data.large, "Large"), count(data.medium, "Medium"), count(data.small, "Small"), count(data.broken, "Broken")];
      if (large + medium + small + broken === 0) throw new RecordError("Enter at least one egg.");
      const date = day(data.date);
      await tx.eggRecord.create({ data: { flockId: flock.id, date, large, medium, small, broken, recordedById: userId } });
      const item = await eggStockItem(tx, flock.house.farmId);
      const good = large + medium + small;
      if (good > 0) await tx.stockMovement.create({ data: { itemId: item.id, date, kind: "COLLECTED", delta: good * 1000, note: flock.name } });
      return;
    }
    case "FEED": {
      const flock = await flockFor(tx, data.flockId, farmIds);
      const item = await tx.inventoryItem.findUnique({ where: { id: String(data.itemId) } });
      if (!item || item.farmId !== flock.house.farmId || item.category !== "FEED") throw new RecordError("Choose a feed from this site.");
      const quantity = toMilli(data.quantityKg as string);
      if (!quantity) throw new RecordError("Enter the feed used in kg.");
      const date = day(data.date);
      await tx.feedRecord.create({ data: { flockId: flock.id, itemId: item.id, date, quantity, unitCost: item.unitCost, recordedById: userId } });
      // Feed already eaten is a fact, so stock may go below zero and raise an alert instead of refusing the record.
      await tx.stockMovement.create({ data: { itemId: item.id, date, kind: "USED", delta: -quantity, note: flock.name } });
      return;
    }
    case "DEATHS": {
      const flock = await flockFor(tx, data.flockId, farmIds);
      await tx.mortalityRecord.create({
        data: { flockId: flock.id, date: day(data.date), count: count(data.count, "Number of birds", 1), cause: String(data.cause || "Unknown"), note: data.note ? String(data.note) : null, recordedById: userId },
      });
      return;
    }
    case "WEIGHT": {
      const flock = await flockFor(tx, data.flockId, farmIds);
      await tx.weightRecord.create({
        data: {
          flockId: flock.id,
          date: day(data.date),
          sampleSize: count(data.sampleSize, "Birds weighed", 1),
          averageGrams: count(data.averageGrams, "Average weight", 1),
          uniformityPct: data.uniformityPct ? count(data.uniformityPct, "Uniformity") : null,
          recordedById: userId,
        },
      });
      return;
    }
    case "VACCINE": {
      const dose = await tx.vaccinationDose.findUnique({ where: { id: String(data.doseId) } });
      if (!dose) throw new RecordError("That vaccination no longer exists.");
      await flockFor(tx, dose.flockId, farmIds);
      if (!dose.givenOn) {
        await tx.vaccinationDose.update({
          where: { id: dose.id },
          data: { givenOn: day(data.date), givenById: userId, batchNo: data.batchNo ? String(data.batchNo) : null },
        });
      }
      return;
    }
    case "TASK": {
      const task = await tx.task.findUnique({ where: { id: String(data.taskId) } });
      if (!task || !farmIds.includes(task.farmId)) throw new RecordError("That task is not at your site.");
      if (task.status !== "DONE") await tx.task.update({ where: { id: task.id }, data: { status: "DONE", completedOn: day(data.date) } });
      return;
    }
    default:
      throw new RecordError("Unknown record type.");
  }
}

/** Saves one queued record. A clientId is saved once only, so a device retrying after lost signal cannot duplicate it. */
export async function saveRecord(user: { id: string }, farmIds: string[], item: SyncItem, client: typeof db = db): Promise<SyncResult> {
  const { clientId, type, payload } = item;
  if (!clientId) return { clientId, status: "rejected", reason: "Missing record ID." };
  try {
    await client.$transaction(async (tx) => {
      const seen = await tx.syncReceipt.findUnique({ where: { clientId } });
      if (seen) return;
      await apply(tx, user.id, farmIds, type, payload);
      await tx.syncReceipt.create({ data: { clientId, userId: user.id, type } });
    });
    return { clientId, status: "saved" };
  } catch (error) {
    if (error instanceof RecordError) return { clientId, status: "rejected", reason: error.message };
    throw error;
  }
}
