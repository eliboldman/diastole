import { redirect } from "next/navigation";

// Settings live under Me → Settings. Kept so old links and bookmarks still work.
export default function SettingsPage() {
  redirect("/account/settings");
}
