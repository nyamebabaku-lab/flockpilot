// Prepares an empty live database: the owner's account and the starting settings, with no demo data.
// Reads OWNER_NAME, OWNER_PHONE and OWNER_PASSWORD. Does nothing once anyone has an account.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { normalizePhone } from "../src/lib/phone";
import { PAYE_BANDS, TEMPLATES } from "./defaults";

const MIN_PASSWORD = 10;
const db = new PrismaClient();

async function main() {
  if (await db.user.count()) {
    console.log("Accounts already exist, so no owner was created.");
    return;
  }
  const name = process.env.OWNER_NAME?.trim();
  const phone = normalizePhone(process.env.OWNER_PHONE ?? "");
  const password = process.env.OWNER_PASSWORD ?? "";
  // Names which setting is wrong without ever printing a value.
  const problems = [
    !name && "OWNER_NAME is empty",
    !phone && "OWNER_PHONE is not a Ghana number such as 0241234567",
    password.length < MIN_PASSWORD && `OWNER_PASSWORD is shorter than ${MIN_PASSWORD} characters (it has ${password.length})`,
  ].filter(Boolean);
  if (problems.length) console.error(`Owner setup: ${problems.join("; ")}.`);
  if (problems.length) {
    // Preview builds are for checking changes, so only the live site insists on an owner.
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
      console.log("No owner details for this preview build, so no owner was created.");
      return;
    }
    throw new Error(`Set OWNER_NAME, OWNER_PHONE (a Ghana number) and OWNER_PASSWORD (at least ${MIN_PASSWORD} characters).`);
  }

  await db.settings.upsert({ where: { id: "main" }, update: {}, create: { id: "main", payeBandsJson: JSON.stringify(PAYE_BANDS) } });
  if ((await db.vaccinationTemplate.count()) === 0) await db.vaccinationTemplate.createMany({ data: TEMPLATES });
  await db.user.create({ data: { name, phone, role: "OWNER", jobTitle: "Owner", passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`Owner account created for ${phone}.`);
}

main().finally(() => db.$disconnect());
