import { createFarm, createHouse } from "@/app/actions/farm";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { farmIdsFor, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { flockSummaries } from "@/lib/queries";

export const metadata = { title: "Farms" };

export default async function FarmsPage() {
  const user = await requireUser();
  const farmIds = await farmIdsFor(user);
  const manage = can(user.role, "farm.manage");
  const [farms, flocks] = await Promise.all([
    db.farm.findMany({ where: { id: { in: farmIds } }, include: { houses: { orderBy: { name: "asc" } }, staff: { include: { user: true } } }, orderBy: { name: "asc" } }),
    flockSummaries(farmIds),
  ]);

  return (
    <>
      <PageHeader title="Farms" subtitle="Your sites and poultry houses" />
      <div className="grid gap-5 lg:grid-cols-2">
        {farms.map((farm) => (
          <Card key={farm.id} title={farm.name}>
            <p className="-mt-3 mb-4 text-sm text-ink-soft">{farm.location ?? "No location set"} · {farm.staff.length} staff</p>
            {farm.houses.length === 0 ? (
              <Empty>No houses yet.</Empty>
            ) : (
              <ul className="space-y-2">
                {farm.houses.map((house) => {
                  const inHouse = flocks.filter((flock) => flock.houseName === house.name && flock.farmId === farm.id);
                  const birds = inHouse.reduce((sum, flock) => sum + flock.live, 0);
                  const fill = house.capacity ? Math.min(100, (birds / house.capacity) * 100) : 0;
                  return (
                    <li key={house.id} className="rounded-2xl bg-raised p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold">{house.name}</span>
                        <span className="text-ink-soft">{birds.toLocaleString()} of {house.capacity.toLocaleString()} birds</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="img" aria-label={`${fill.toFixed(0)}% full`}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${fill}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {manage && (
              <ActionForm action={createHouse.bind(null, farm.id)} resetOnSuccess className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="New house"><input className="input" name="name" required /></Field>
                  <Field label="Capacity"><input className="input" name="capacity" type="number" min="0" required /></Field>
                </div>
                <SubmitButton className="btn-ghost w-full">Add house</SubmitButton>
              </ActionForm>
            )}
          </Card>
        ))}
        {manage && (
          <Card title="Add a site">
            <ActionForm action={createFarm} resetOnSuccess>
              <Field label="Site name"><input className="input" name="name" required /></Field>
              <Field label="Location"><input className="input" name="location" /></Field>
              <SubmitButton className="btn-primary w-full">Add site</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
