import { redirect } from "next/navigation";

// Settings moved to the "Me" tab. Kept so old links and bookmarks still work.
export default function SettingsPage() {
  redirect("/account");
}
