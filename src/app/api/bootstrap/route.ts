import { NextResponse } from "next/server";
import { currentUser, farmIdsFor } from "@/lib/auth";
import { bootstrapFor } from "@/lib/queries";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  return NextResponse.json(await bootstrapFor(user, await farmIdsFor(user)), { headers: { "cache-control": "no-store" } });
}
