import type { Metadata } from "next";

import AthleteShell from "@/components/AthleteShell";
import DashboardShell from "@/components/layout/DashboardShell";
import NotificationList from "@/components/NotificationList";
import { listNotifications } from "@/lib/notifications";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications · Diastole" };

export default async function NotificationsPage() {
  const me = await requireUser();
  const { items, unread } = await listNotifications(50);
  const body = (
    <>
      <p className="text-sm uppercase tracking-[0.25em] text-white/50">Inbox</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight">Notifications</h1>
      <div className="mt-8 max-w-2xl">
        <NotificationList initial={items} initialUnread={unread} />
      </div>
    </>
  );
  if (me.role === "dietitian") return <DashboardShell role="dietitian">{body}</DashboardShell>;
  return <AthleteShell isCoach={me.role === "coach"}>{body}</AthleteShell>;
}
