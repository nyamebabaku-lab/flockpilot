import { cookies } from "next/headers";
import { farmIdsFor } from "./auth";

export const SITE_COOKIE = "flockpilot_site";

/** The sites a page should show: the one picked in the switcher, or all the user may see. */
export async function activeFarmIds(user: { id: string; role: string }) {
  const allowed = await farmIdsFor(user);
  const picked = (await cookies()).get(SITE_COOKIE)?.value;
  return picked && allowed.includes(picked) ? [picked] : allowed;
}
