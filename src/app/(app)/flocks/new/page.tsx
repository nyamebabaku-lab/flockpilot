import { createFlock } from "@/app/actions/farm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, LinkButton, PageHeader } from "@/components/ui";
import { farmIdsFor, requirePage } from "@/lib/auth";
import { BIRD_TYPES } from "@/lib/constants";
import { today } from "@/lib/dates";
import { db } from "@/lib/db";

export const metadata = { title: "New flock" };

export default async function NewFlockPage() {
  const user = await requirePage("farm.manage");
  const houses = await db.house.findMany({ where: { farmId: { in: await farmIdsFor(user) } }, include: { farm: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New flock" subtitle="The vaccination plan is created for you from the schedule." />
      {houses.length === 0 ? (
        <div className="space-y-3">
          <Empty>Add a site and a house first.</Empty>
          <LinkButton href="/farms">Go to Farms</LinkButton>
        </div>
      ) : (
        <Card>
          <ActionForm action={createFlock}>
            <Field label="Flock name">
              <input className="input" name="name" required placeholder="LAY-2026-03" />
            </Field>
            <Field label="House">
              <select className="input" name="houseId" required>
                {houses.map((house) => (
                  <option key={house.id} value={house.id}>
                    {house.name}, {house.farm.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bird type">
                <select className="input" name="birdType">
                  {Object.entries(BIRD_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Breed">
                <input className="input" name="breed" />
              </Field>
              <Field label="Number of birds">
                <input className="input" name="startCount" type="number" min="1" required />
              </Field>
              <Field label="Age on arrival (days)">
                <input className="input" name="ageAtStart" type="number" min="0" defaultValue="1" required />
              </Field>
              <Field label="Start date">
                <input className="input" name="startDate" type="date" defaultValue={today()} required />
              </Field>
              <Field label="Cost per bird (GH₵)">
                <input className="input" name="costPerBird" inputMode="decimal" placeholder="0.00" />
              </Field>
            </div>
            <SubmitButton className="btn-primary w-full">Create flock</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
