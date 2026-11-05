"use client";

import { useState } from "react";

import { NoticeRow, syncNotifications } from "@/components/layout/Notifications";
import { listNotifications, markAllRead, type Notice } from "@/lib/notifications";

const PAGE = 50;

/** The full notification center: everything, newest first, 50 at a time. */
export default function NotificationList({ initial, initialUnread }: { initial: Notice[]; initialUnread: number }) {
  const [items, setItems] = useState(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [more, setMore] = useState(initial.length === PAGE);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    setLoading(true);
    try {
      const { items: next } = await listNotifications(PAGE, items.at(-1)?.created_at);
      setItems((cur) => [...cur, ...next.filter((n) => !cur.some((c) => c.id === n.id))]);
      setMore(next.length === PAGE);
    } finally {
      setLoading(false);
    }
  };

  if (!items.length)
    return (
      <p className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5 text-sm text-white/55">
        Nothing yet. Workouts, pod news and updates about your athletes show up here.
      </p>
    );

  return (
    <div className="grid gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm text-white/55">{unread ? `${unread} unread` : "All caught up"}</p>
        {unread > 0 && (
          <button
            onClick={async () => {
              setUnread(0);
              setItems((cur) => cur.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() })));
              await markAllRead();
              syncNotifications();
            }}
            className="min-h-11 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 hover:bg-white/[0.1]"
          >
            Mark all read
          </button>
        )}
      </div>
      <ul className="grid gap-1 rounded-[24px] border border-white/10 bg-white/[0.03] p-2">
        {items.map((n) => (
          <li key={n.id}>
            <NoticeRow
              n={n}
              onOpen={() => {
                if (!n.read_at) {
                  setUnread((u) => Math.max(0, u - 1));
                  setItems((cur) => cur.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
                  setTimeout(syncNotifications, 500);
                }
              }}
            />
          </li>
        ))}
      </ul>
      {more && (
        <button onClick={loadMore} disabled={loading} className="min-h-12 rounded-2xl text-sm text-white/60 hover:text-white disabled:opacity-50">
          {loading ? "Loading…" : "Show older"}
        </button>
      )}
    </div>
  );
}
