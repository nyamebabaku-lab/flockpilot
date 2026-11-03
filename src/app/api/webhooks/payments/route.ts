import { NextResponse } from "next/server";
import { getProvider } from "@/lib/payments";
import { handleProviderEvent } from "@/lib/payments/service";

export async function POST(request: Request) {
  const event = getProvider().parseWebhook(await request.text(), request.headers);
  if (!event) return NextResponse.json({ received: false }, { status: 401 });
  await handleProviderEvent(event);
  return NextResponse.json({ received: true });
}
