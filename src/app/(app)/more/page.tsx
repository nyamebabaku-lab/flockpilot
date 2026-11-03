import Link from "next/link";
import { SignOutButton } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { navFor } from "@/lib/navigation";

export const metadata = { title: "More" };

export default async function MorePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="More" subtitle={user.name} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {navFor(user.role).map((item) => (
          <Link key={item.href} href={item.href} className="card flex min-h-24 items-center justify-center p-4 font-display font-semibold">
            {item.label}
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <SignOutButton className="btn-ghost w-full" />
      </div>
    </>
  );
}
