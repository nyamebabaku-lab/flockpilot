import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, today } from "../src/lib/dates";
import { planDoses } from "../src/lib/vaccination";
import { PAYE_BANDS, TEMPLATES } from "./defaults";

const db = new PrismaClient();

// Demo sign-in, for local review only. Every account uses this password.
export const DEMO_PASSWORD = "farm1234";

// Repeatable pseudo-random numbers, so the demo looks the same every time.
let state = 42;
const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
const between = (low: number, high: number) => Math.round(low + random() * (high - low));

async function main() {
  if (await db.user.count()) {
    console.log("This database already has data, so the demo farm was not added.");
    return;
  }
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const day = today();

  await db.settings.upsert({
    where: { id: "main" },
    update: {},
    create: { id: "main", payeBandsJson: JSON.stringify(PAYE_BANDS) },
  });
  await db.vaccinationTemplate.createMany({ data: TEMPLATES });

  const owner = await db.user.create({ data: { name: "Farm Owner", phone: "0240000001", passwordHash, role: "OWNER", jobTitle: "Owner" } });
  const manager = await db.user.create({ data: { name: "Ama Mensah", phone: "0240000002", passwordHash, role: "MANAGER", jobTitle: "Farm manager", monthlyPay: 250000 } });
  const worker = await db.user.create({ data: { name: "Kofi Boateng", phone: "0240000003", passwordHash, role: "WORKER", jobTitle: "Poultry attendant", monthlyPay: 120000 } });
  const worker2 = await db.user.create({ data: { name: "Esi Owusu", phone: "0240000004", passwordHash, role: "WORKER", jobTitle: "Poultry attendant", monthlyPay: 110000 } });

  await db.payoutAccount.createMany({
    data: [
      { userId: owner.id, kind: "MOMO", provider: "MTN", accountName: "Farm Owner", accountNumber: "0240000001" },
      { userId: manager.id, kind: "MOMO", provider: "MTN", accountName: manager.name, accountNumber: "0240000002" },
      { userId: worker.id, kind: "MOMO", provider: "TELECEL", accountName: worker.name, accountNumber: "0200000003" },
      { userId: worker2.id, kind: "MOMO", provider: "AT", accountName: worker2.name, accountNumber: "0270000004" },
    ],
  });

  const main = await db.farm.create({ data: { name: "Dodowa Main Farm", location: "Dodowa, Greater Accra" } });
  const second = await db.farm.create({ data: { name: "Nsawam Annex", location: "Nsawam, Eastern Region" } });
  await db.siteAssignment.createMany({ data: [{ userId: worker.id, farmId: main.id }, { userId: worker2.id, farmId: second.id }, { userId: manager.id, farmId: main.id }, { userId: manager.id, farmId: second.id }] });

  const houseA = await db.house.create({ data: { farmId: main.id, name: "House A", capacity: 1500 } });
  const houseB = await db.house.create({ data: { farmId: main.id, name: "House B", capacity: 1000 } });
  const houseC = await db.house.create({ data: { farmId: second.id, name: "House 1", capacity: 800 } });
  const houseD = await db.house.create({ data: { farmId: second.id, name: "House 2", capacity: 300 } });

  const supplier = await db.supplier.create({ data: { name: "Agrimat Feeds", phone: "0302000000" } });
  const vetSupplier = await db.supplier.create({ data: { name: "Kumasi Vet Supplies", phone: "0322000000" } });

  const makeItem = async (farmId: string, name: string, category: string, unit: string, opening: number, lowLevel: number, unitCost: number, supplierId: string, expiresOn?: string) => {
    const item = await db.inventoryItem.create({ data: { farmId, name, category, unit, lowLevel: lowLevel * 1000, unitCost, expiresOn } });
    await db.stockMovement.create({ data: { itemId: item.id, date: addDays(day, -90), kind: "PURCHASE", delta: opening * 1000, unitCost, supplierId, note: "Opening stock" } });
    return item;
  };

  const layerMash = await makeItem(main.id, "Layer mash", "FEED", "kg", 12000, 800, 480, supplier.id);
  const broilerFeed = await makeItem(main.id, "Broiler finisher", "FEED", "kg", 3000, 400, 520, supplier.id);
  const turkeyFeed = await makeItem(second.id, "Grower mash", "FEED", "kg", 900, 300, 450, supplier.id);
  await makeItem(second.id, "Layer mash", "FEED", "kg", 300, 500, 480, supplier.id);
  await makeItem(main.id, "Newcastle vaccine (1000 dose)", "VACCINE", "vials", 3, 2, 8500, vetSupplier.id, addDays(day, 21));
  await makeItem(main.id, "Multivitamin", "DRUG", "bottles", 8, 3, 4500, vetSupplier.id);
  await makeItem(main.id, "Egg crates", "EQUIPMENT", "pieces", 1500, 300, 150, supplier.id);

  const layers = await db.flock.create({
    data: { houseId: houseA.id, name: "LAY-2026-01", birdType: "LAYER", breed: "Lohmann Brown", startDate: addDays(day, -170), ageAtStart: 1, startCount: 1200, costPerBird: 1800 },
  });
  const layers2 = await db.flock.create({
    data: { houseId: houseC.id, name: "LAY-2026-02", birdType: "LAYER", breed: "Isa Brown", startDate: addDays(day, -130), ageAtStart: 1, startCount: 600, costPerBird: 1800 },
  });
  const broilers = await db.flock.create({
    data: { houseId: houseB.id, name: "BRO-2026-07", birdType: "BROILER", breed: "Cobb 500", startDate: addDays(day, -32), ageAtStart: 1, startCount: 800, costPerBird: 1500 },
  });
  const turkeys = await db.flock.create({
    data: { houseId: houseD.id, name: "TUR-2026-01", birdType: "TURKEY", breed: "Bronze", startDate: addDays(day, -60), ageAtStart: 1, startCount: 150, costPerBird: 3500 },
  });

  for (const flock of [layers, layers2, broilers, turkeys]) await planDoses(db, flock);
  // Mark past doses as given, except one, so the demo shows an overdue alert.
  const past = await db.vaccinationDose.findMany({ where: { dueDate: { lt: day } }, orderBy: { dueDate: "desc" } });
  for (const dose of past.slice(1)) {
    await db.vaccinationDose.update({ where: { id: dose.id }, data: { givenOn: dose.dueDate, givenById: worker.id } });
  }

  const eggItem = await db.inventoryItem.create({ data: { farmId: main.id, name: "Eggs", category: "EGGS", unit: "eggs", unitCost: 130 } });

  for (let back = 60; back >= 1; back--) {
    const date = addDays(day, -back);
    const eggs = between(880, 1010);
    const broken = between(5, 18);
    await db.eggRecord.create({ data: { flockId: layers.id, date, large: Math.round(eggs * 0.45), medium: Math.round(eggs * 0.45), small: eggs - Math.round(eggs * 0.45) - Math.round(eggs * 0.45), broken, recordedById: worker.id } });
    await db.stockMovement.create({ data: { itemId: eggItem.id, date, kind: "COLLECTED", delta: eggs * 1000, note: layers.name } });
    const eggs2 = between(400, 490);
    await db.eggRecord.create({ data: { flockId: layers2.id, date, large: Math.round(eggs2 * 0.4), medium: Math.round(eggs2 * 0.5), small: eggs2 - Math.round(eggs2 * 0.4) - Math.round(eggs2 * 0.5), broken: between(2, 8), recordedById: worker2.id } });

    const use = async (flockId: string, itemId: string, kg: number, unitCost: number, name: string) => {
      await db.feedRecord.create({ data: { flockId, itemId, date, quantity: kg * 1000, unitCost, recordedById: worker.id } });
      await db.stockMovement.create({ data: { itemId, date, kind: "USED", delta: -kg * 1000, note: name } });
    };
    await use(layers.id, layerMash.id, between(125, 140), 480, layers.name);
    if (back <= 31) await use(broilers.id, broilerFeed.id, Math.round(15 + (31 - back) * 2.2), 520, broilers.name);
    if (back <= 45) await use(turkeys.id, turkeyFeed.id, between(10, 16), 450, turkeys.name);

    if (back % 4 === 0) await db.mortalityRecord.create({ data: { flockId: layers.id, date, count: between(1, 3), cause: "Unknown", recordedById: worker.id } });
    if (back <= 31 && back % 3 === 0) await db.mortalityRecord.create({ data: { flockId: broilers.id, date, count: between(1, 4), cause: back % 2 ? "Heat stress" : "Unknown", recordedById: worker.id } });
    if (back <= 31 && back % 7 === 0) {
      const age = 31 - back;
      await db.weightRecord.create({ data: { flockId: broilers.id, date, sampleSize: 50, averageGrams: 45 + age * 62, uniformityPct: between(78, 90), recordedById: worker.id } });
    }
  }

  await db.treatment.create({ data: { flockId: broilers.id, date: addDays(day, -10), medicine: "Multivitamin", reason: "Heat stress support", withdrawalDays: 0 } });

  const customers = await Promise.all(
    [
      ["Makola Egg Traders", "0244111222", "orders@example.com"],
      ["Sunrise Hotel Kitchen", "0244333444", "kitchen@example.com"],
      ["Auntie Akos Chop Bar", "0244555666", null],
    ].map(([name, phone, email]) => db.customer.create({ data: { name: name!, phone, email } })),
  );

  const orderSeed = [
    { customer: 0, back: 20, crates: 120, price: 4800, paid: true },
    { customer: 1, back: 11, crates: 60, price: 5000, paid: true },
    { customer: 0, back: 6, crates: 100, price: 4800, paid: true },
    { customer: 2, back: 2, crates: 15, price: 5000, paid: false },
  ];
  let number = 1001;
  for (const seed of orderSeed) {
    const total = seed.crates * seed.price;
    const date = addDays(day, -seed.back);
    const order = await db.order.create({
      data: {
        number: number++,
        payToken: `demo${number}${Math.round(random() * 1e9).toString(36)}`,
        customerId: customers[seed.customer].id,
        farmId: main.id,
        date,
        total,
        status: seed.paid ? "PAID" : "OPEN",
        paid: seed.paid ? total : 0,
        lines: { create: [{ kind: "EGGS", description: "Crates of eggs", quantity: seed.crates, unitPrice: seed.price, total }] },
      },
    });
    await db.stockMovement.create({ data: { itemId: eggItem.id, date, kind: "SOLD", delta: -seed.crates * 30 * 1000, note: `Order #${order.number}` } });
    if (seed.paid) {
      const fee = Math.round(total * 0.0195);
      const payment = await db.payment.create({ data: { reference: `DEMO_${order.number}`, orderId: order.id, amount: total, method: "MTN", status: "SUCCESS", providerFee: fee, paidAt: new Date(date) } });
      await db.ledgerEntry.create({ data: { kind: "SALE", amount: total, dedupeKey: `sale:${payment.id}`, memo: `Payment for order #${order.number}` } });
      await db.ledgerEntry.create({ data: { kind: "PROVIDER_FEE", amount: -fee, dedupeKey: `provider-fee:${payment.id}`, memo: `Payment charges, ${payment.reference}` } });
    }
  }

  await db.expense.createMany({
    data: [
      { farmId: main.id, date: addDays(day, -25), category: "Utilities", description: "Electricity", amount: 85000 },
      { farmId: main.id, date: addDays(day, -14), category: "Repairs", description: "Water line repair", amount: 42000 },
      { farmId: main.id, flockId: broilers.id, date: addDays(day, -30), category: "Chicks", description: "Day-old broiler chicks", amount: 1200000 },
      { farmId: second.id, date: addDays(day, -9), category: "Transport", description: "Feed delivery", amount: 30000 },
    ],
  });

  await db.task.createMany({
    data: [
      { farmId: main.id, assigneeId: worker.id, title: "Clean drinkers in House A", dueDate: day },
      { farmId: main.id, assigneeId: worker.id, title: "Turn litter in House B", dueDate: day },
      { farmId: second.id, assigneeId: worker2.id, title: "Check fencing around House 2", dueDate: addDays(day, 1) },
    ],
  });
  await db.advance.create({ data: { userId: worker.id, date: addDays(day, -5), amount: 20000, note: "School fees" } });
  await db.attendance.createMany({
    data: [
      { userId: worker.id, date: addDays(day, -1), status: "PRESENT" },
      { userId: worker2.id, date: addDays(day, -1), status: "PRESENT" },
    ],
  });
  await db.auditLog.create({ data: { actorId: owner.id, action: "DEMO_DATA", detail: "Demo farm created" } });

  console.log(`Seeded. Owner 0240000001, Manager 0240000002, Worker 0240000003. Password: ${DEMO_PASSWORD}`);
}

main().finally(() => db.$disconnect());
