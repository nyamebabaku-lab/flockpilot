"use server";

import { revalidatePath } from "next/cache";
import { attempt, optional, text } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireAction } from "@/lib/auth";
import { ITEM_CATEGORIES } from "@/lib/constants";
import { isDay, today } from "@/lib/dates";
import { db } from "@/lib/db";
import { toMilli } from "@/lib/metrics";
import { toPesewas } from "@/lib/money";

export async function createItem(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("inventory.manage");
    const name = text(data, "name");
    const farmId = text(data, "farmId");
    const category = text(data, "category");
    const unit = text(data, "unit");
    const lowLevel = toMilli(text(data, "lowLevel") || "0");
    const unitCost = toPesewas(text(data, "unitCost") || "0");
    if (!name || !farmId || !ITEM_CATEGORIES[category] || !unit || lowLevel === null || unitCost === null) return { error: "Check the item details." };
    if (await db.inventoryItem.findFirst({ where: { farmId, name } })) return { error: "This site already has an item with that name." };
    await db.inventoryItem.create({ data: { name, farmId, category, unit, lowLevel, unitCost, expiresOn: optional(data, "expiresOn") } });
    await audit(user.id, "ITEM_ADDED", name);
    revalidatePath("/inventory");
    return { success: `${name} added.` };
  });
}

export async function createSupplier(_state: unknown, data: FormData) {
  return attempt(async () => {
    await requireAction("inventory.manage");
    const name = text(data, "name");
    if (!name) return { error: "Enter the supplier name." };
    if (await db.supplier.findUnique({ where: { name } })) return { error: "That supplier already exists." };
    await db.supplier.create({ data: { name, phone: optional(data, "phone"), note: optional(data, "note") } });
    revalidatePath("/inventory");
    return { success: `${name} added.` };
  });
}

/** Records stock coming in or a counted correction. */
export async function moveStock(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("inventory.manage");
    const itemId = text(data, "itemId");
    const kind = text(data, "kind");
    const date = text(data, "date") || today();
    const quantity = toMilli(text(data, "quantity"));
    const unitCost = toPesewas(text(data, "unitCost") || "0");
    if (!itemId || !["PURCHASE", "ADJUST_UP", "ADJUST_DOWN"].includes(kind) || !quantity || unitCost === null || !isDay(date)) return { error: "Enter the item and quantity." };

    const item = await db.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    await db.stockMovement.create({
      data: { itemId, date, kind: kind === "PURCHASE" ? "PURCHASE" : "ADJUST", delta: kind === "ADJUST_DOWN" ? -quantity : quantity, unitCost, supplierId: optional(data, "supplierId"), note: optional(data, "note") },
    });
    if (kind === "PURCHASE" && unitCost > 0) await db.inventoryItem.update({ where: { id: itemId }, data: { unitCost } });
    await audit(user.id, "STOCK_MOVED", `${kind}: ${text(data, "quantity")} ${item.unit} of ${item.name}`);
    revalidatePath("/inventory");
    return { success: "Stock updated." };
  });
}
