import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { requireUser, farmIdsFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { dockFor, navFor } from "@/lib/navigation";
import { SITE_COOKIE } from "@/lib/site";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const farmIds = await farmIdsFor(user);
  const farms = await db.farm.findMany({ where: { id: { in: farmIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const site = (await cookies()).get(SITE_COOKIE)?.value ?? "";
  return (
    <AppShell nav={navFor(user.role)} dock={dockFor(user.role)} user={{ name: user.name, role: user.role }} farms={farms} site={site}>
      {children}
    </AppShell>
  );
}
