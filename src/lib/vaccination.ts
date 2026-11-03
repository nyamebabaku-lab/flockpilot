import { addDays } from "./dates";
import type { Client } from "./db";

/** Creates a flock's vaccination plan from the editable template for its bird type. */
export async function planDoses(client: Client, flock: { id: string; birdType: string; startDate: string; ageAtStart: number }) {
  const templates = await client.vaccinationTemplate.findMany({ where: { birdType: flock.birdType } });
  const upcoming = templates.filter((template) => template.dayOfAge >= flock.ageAtStart);
  for (const template of upcoming) {
    await client.vaccinationDose.create({
      data: {
        flockId: flock.id,
        vaccine: template.vaccine,
        route: template.route,
        dueDate: addDays(flock.startDate, template.dayOfAge - flock.ageAtStart),
      },
    });
  }
  return upcoming.length;
}
