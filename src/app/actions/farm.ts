"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { attempt, optional, text, whole } from "@/lib/action";
import { audit } from "@/lib/audit";
import { requireAction } from "@/lib/auth";
import { BIRD_TYPES } from "@/lib/constants";
import { isDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { toPesewas } from "@/lib/money";
import { planDoses } from "@/lib/vaccination";

export async function createFarm(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("farm.manage");
    const name = text(data, "name");
    if (!name) return { error: "Enter the site name." };
    if (await db.farm.findUnique({ where: { name } })) return { error: "A site with that name already exists." };
    await db.farm.create({ data: { name, location: optional(data, "location") } });
    await audit(user.id, "FARM_ADDED", name);
    revalidatePath("/farms");
    return { success: `${name} added.` };
  });
}

export async function createHouse(farmId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    await requireAction("farm.manage");
    const name = text(data, "name");
    const capacity = whole(data, "capacity");
    if (!name || capacity === null) return { error: "Enter a house name and capacity." };
    if (await db.house.findFirst({ where: { farmId, name } })) return { error: "This site already has a house with that name." };
    await db.house.create({ data: { farmId, name, capacity } });
    revalidatePath("/farms");
    return { success: `${name} added.` };
  });
}

export async function createFlock(_state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("farm.manage");
    const name = text(data, "name");
    const birdType = text(data, "birdType");
    const startDate = text(data, "startDate");
    const startCount = whole(data, "startCount");
    const ageAtStart = whole(data, "ageAtStart");
    const costPerBird = toPesewas(text(data, "costPerBird") || "0");
    if (!name || !BIRD_TYPES[birdType] || !isDay(startDate) || !startCount || ageAtStart === null || costPerBird === null) {
      return { error: "Check the flock name, bird type, start date and number of birds." };
    }
    if (await db.flock.findUnique({ where: { name } })) return { error: "A flock with that name already exists." };
    const flock = await db.flock.create({
      data: { houseId: text(data, "houseId"), name, birdType, breed: optional(data, "breed"), startDate, ageAtStart, startCount, costPerBird },
    });
    const planned = await planDoses(db, flock);
    await audit(user.id, "FLOCK_ADDED", `${name}: ${startCount} birds, ${planned} vaccinations planned`);
    redirect(`/flocks/${flock.id}`);
  });
}

export async function recordMovement(flockId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("farm.manage");
    const kind = text(data, "kind");
    const count = whole(data, "count");
    const date = text(data, "date");
    if (!["SALE", "CULL", "TRANSFER_OUT", "TRANSFER_IN"].includes(kind) || !count || !isDay(date)) return { error: "Enter the type, number of birds and date." };
    await db.birdMovement.create({ data: { flockId, kind, count, date, note: optional(data, "note") } });
    await audit(user.id, "BIRDS_MOVED", `${kind}: ${count} birds, flock ${flockId}`);
    revalidatePath(`/flocks/${flockId}`);
    return { success: "Movement saved." };
  });
}

export async function closeFlock(flockId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    const user = await requireAction("farm.manage");
    const closedOn = text(data, "closedOn");
    if (!isDay(closedOn)) return { error: "Choose the closing date." };
    const flock = await db.flock.update({ where: { id: flockId }, data: { status: "CLOSED", closedOn, closeReason: optional(data, "closeReason") } });
    await audit(user.id, "FLOCK_CLOSED", flock.name);
    revalidatePath(`/flocks/${flockId}`);
    return { success: "Flock closed." };
  });
}

export async function addTreatment(flockId: string, _state: unknown, data: FormData) {
  return attempt(async () => {
    await requireAction("farm.manage");
    const medicine = text(data, "medicine");
    const reason = text(data, "reason");
    const date = text(data, "date");
    const withdrawalDays = whole(data, "withdrawalDays");
    if (!medicine || !reason || !isDay(date) || withdrawalDays === null) return { error: "Enter the medicine, reason and date." };
    await db.treatment.create({ data: { flockId, medicine, reason, date, withdrawalDays, note: optional(data, "note") } });
    revalidatePath(`/flocks/${flockId}`);
    revalidatePath("/health");
    return { success: "Treatment saved." };
  });
}

export async function addTemplate(_state: unknown, data: FormData) {
  return attempt(async () => {
    await requireAction("farm.manage");
    const birdType = text(data, "birdType");
    const vaccine = text(data, "vaccine");
    const route = text(data, "route");
    const dayOfAge = whole(data, "dayOfAge");
    if (!BIRD_TYPES[birdType] || !vaccine || !route || dayOfAge === null) return { error: "Enter the bird type, vaccine, route and age." };
    await db.vaccinationTemplate.create({ data: { birdType, vaccine, route, dayOfAge } });
    revalidatePath("/health");
    return { success: "Added to the schedule. It applies to new flocks." };
  });
}

export async function removeTemplate(id: string) {
  await requireAction("farm.manage");
  await db.vaccinationTemplate.delete({ where: { id } });
  revalidatePath("/health");
}
