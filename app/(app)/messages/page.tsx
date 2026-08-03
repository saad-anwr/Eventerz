/**
 * Moved into `/community`.
 *
 * The inbox is the Messages segment there. Kept as a redirect because
 * `/messages` is linked from notification emails; `/messages/[id]` is
 * untouched and still opens an individual thread.
 */

import { redirect } from "next/navigation";

export default function MessagesPage() {
  redirect("/community");
}
