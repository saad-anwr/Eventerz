/**
 * Moved into `/community`.
 *
 * Friends, requests and messages are one destination now - see
 * `app/(app)/community/page.tsx` for why. This route stays as a redirect
 * rather than being deleted: `/friends` is linked from notification emails and
 * sits in people's history, and a 404 is a worse answer than one hop.
 */

import { redirect } from "next/navigation";

export default function FriendsPage() {
  redirect("/community");
}
