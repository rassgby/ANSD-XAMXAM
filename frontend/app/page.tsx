import { redirect } from "next/navigation";

// `/accueil` is the real product (live, backend-connected) — send visitors
// there directly instead of the design-review index. That index is still
// reachable at /sommaire for browsing the static screen references.
export default function RootPage() {
  redirect("/accueil");
}
