import { addDays, today } from "./dates";
import { db } from "./db";
import { ageInDays, feedConversion, henDayPercent, liveBirds, mortalityPercent, stockLevel, stockStatus } from "./metrics";

const WITH_RECORDS = {
  house: { include: { farm: true } },
  mortality: { select: { count: true, date: true } },
  movements: { select: { kind: true, count: true } },
  eggs: true,
  feed: true,
  weights: { orderBy: { date: "asc" } },
} as const;

export async function flockSummaries(farmIds: string[], status = "ACTIVE") {
  const flocks = await db.flock.findMany({
    where: { status, house: { farmId: { in: farmIds } } },
    include: WITH_RECORDS,
    orderBy: { startDate: "desc" },
  });
  const day = today();
  const yesterday = addDays(day, -1);
  return flocks.map((flock) => {
    const deaths = flock.mortality.reduce((sum, item) => sum + item.count, 0);
    const live = liveBirds(flock.startCount, deaths, flock.movements);
    const eggsOn = (date: string) => flock.eggs.filter((item) => item.date === date).reduce((sum, item) => sum + item.large + item.medium + item.small + item.broken, 0);
    const eggsToday = eggsOn(day);
    const feedKg = flock.feed.reduce((sum, item) => sum + item.quantity, 0) / 1000;
    const lastWeight = flock.weights.at(-1);
    const gainKg = lastWeight ? (lastWeight.averageGrams * live) / 1000 - (40 * flock.startCount) / 1000 : 0;
    return {
      id: flock.id,
      name: flock.name,
      birdType: flock.birdType,
      breed: flock.breed,
      farmId: flock.house.farmId,
      farmName: flock.house.farm.name,
      houseName: flock.house.name,
      startCount: flock.startCount,
      startDate: flock.startDate,
      live,
      deaths,
      ageDays: ageInDays(flock.startDate, flock.ageAtStart, day),
      eggsToday,
      henDay: henDayPercent(eggsOn(yesterday), live),
      mortality: mortalityPercent(deaths, flock.startCount),
      feedKg,
      fcr: flock.birdType === "LAYER" ? null : feedConversion(feedKg, gainKg),
      lastWeightGrams: lastWeight?.averageGrams ?? null,
    };
  });
}

export type Alert = { tone: "bad" | "warn"; title: string; detail: string; href: string };

export async function stockSummaries(farmIds: string[]) {
  const items = await db.inventoryItem.findMany({
    where: { farmId: { in: farmIds }, active: true },
    include: { movements: { select: { delta: true } }, farm: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return items.map((item) => {
    const level = stockLevel(item.movements);
    return { ...item, level, status: stockStatus(level, item.lowLevel) };
  });
}

export async function alertsFor(farmIds: string[]) {
  const day = today();
  const alerts: Alert[] = [];

  const doses = await db.vaccinationDose.findMany({
    where: { givenOn: null, dueDate: { lte: addDays(day, 3) }, flock: { status: "ACTIVE", house: { farmId: { in: farmIds } } } },
    include: { flock: true },
    orderBy: { dueDate: "asc" },
  });
  for (const dose of doses) {
    const late = dose.dueDate < day;
    alerts.push({
      tone: late ? "bad" : "warn",
      title: `${dose.vaccine} ${late ? "overdue" : "due soon"}`,
      detail: `${dose.flock.name}, due ${dose.dueDate}`,
      href: "/health",
    });
  }

  for (const item of await stockSummaries(farmIds)) {
    if (item.category === "EGGS") continue;
    if (item.status !== "OK") {
      alerts.push({ tone: item.status === "OUT" ? "bad" : "warn", title: `${item.name} ${item.status === "OUT" ? "out of stock" : "running low"}`, detail: item.farm.name, href: "/inventory" });
    }
    if (item.expiresOn && item.expiresOn <= addDays(day, 30)) {
      alerts.push({ tone: item.expiresOn < day ? "bad" : "warn", title: `${item.name} ${item.expiresOn < day ? "expired" : "expires soon"}`, detail: `${item.farm.name}, ${item.expiresOn}`, href: "/inventory" });
    }
  }
  return alerts.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1));
}

/** Everything a device needs to record offline. */
export async function bootstrapFor(user: { id: string; role: string }, farmIds: string[]) {
  const [flocks, feeds, doses, tasks] = await Promise.all([
    flockSummaries(farmIds),
    db.inventoryItem.findMany({ where: { farmId: { in: farmIds }, category: "FEED", active: true }, select: { id: true, name: true, farmId: true } }),
    db.vaccinationDose.findMany({
      where: { givenOn: null, flock: { status: "ACTIVE", house: { farmId: { in: farmIds } } } },
      include: { flock: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 30,
    }),
    db.task.findMany({
      where: { status: "OPEN", farmId: { in: farmIds }, ...(user.role === "WORKER" ? { OR: [{ assigneeId: user.id }, { assigneeId: null }] } : {}) },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),
  ]);
  return {
    userId: user.id,
    flocks: flocks.map(({ id, name, birdType, farmId, farmName, houseName, live }) => ({ id, name, birdType, farmId, farmName, houseName, live })),
    feeds,
    doses: doses.map((dose) => ({ id: dose.id, vaccine: dose.vaccine, dueDate: dose.dueDate, flockName: dose.flock.name })),
    tasks: tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate })),
  };
}

export type Bootstrap = Awaited<ReturnType<typeof bootstrapFor>>;
