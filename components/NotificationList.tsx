"use client";

import { useState } from "react";

import { NoticeRow, syncNotifications } from "@/components/layout/Notifications";
import { dismissAll, listNotifications, type Notice } from "@/lib/notifications";

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

  const remove = (n: Notice) => {
    setItems((cur) => cur.filter((i) => i.id !== n.id));
    if (!n.read_at) setUnread((u) => Math.max(0, u - 1));
    setTimeout(syncNotifications, 500);
  };

  if (!items.length)
    return (
      <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-8 text-center">
        <p className="text-3xl" aria-hidden>
          ✨
        </p>
        <p className="mt-2 font-medium">All caught up</p>
        <p className="mt-1 text-sm text-white/55">Workouts, messages, pod news and updates about your athletes show up here.</p>
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm text-white/55">{unread ? `${unread} unread · swipe or ✕ to clear` : "Swipe or ✕ to clear"}</p>
        <button
          onClick={async () => {
            navigator.vibrate?.(8);
            setUnread(0);
            setItems([]);
            setMore(false);
            await dismissAll();
            syncNotifications();
          }}
          className="min-h-11 rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm text-white/80 transition active:scale-95 hover:bg-white/[0.1]"
        >
          Clear all
        </button>
      </div>
      <ul className="grid gap-1 rounded-[24px] border border-white/10 bg-white/[0.03] p-2">
        {items.map((n) => (
          <li key={n.id}>
            <NoticeRow n={n} onOpen={() => remove(n)} onDismiss={() => remove(n)} />
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
