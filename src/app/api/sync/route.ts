import { NextResponse } from "next/server";
import { currentUser, farmIdsFor } from "@/lib/auth";
import { saveRecord, type SyncItem } from "@/lib/records";

const MAX_ITEMS = 100;

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { items?: SyncItem[] } | null;
  if (!Array.isArray(body?.items) || body.items.length > MAX_ITEMS) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const farmIds = await farmIdsFor(user);
  const results = [];
  for (const item of body.items) results.push(await saveRecord(user, farmIds, item));
  return NextResponse.json({ results });
}
