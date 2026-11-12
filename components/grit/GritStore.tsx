"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import Avatar from "@/components/avatar/Avatar";
import { GritMark, ItemArt } from "@/components/grit/Art";
import { useToast } from "@/components/coach/Toast";
import { buyItem, equipGear } from "@/lib/grit/actions";
import { CATEGORY_LABEL, ITEMS, keyOf, type Category, type Gear, type GearSlot, type Item } from "@/lib/grit/catalog";
import { haptic } from "@/lib/haptics";

const TABS: Category[] = ["sticker", "jersey", "helmet", "aura", "theme", "ability"];
const SHORT: Record<Category, string> = { sticker: "Stickers", jersey: "Jerseys", helmet: "Helmets", aura: "Auras", theme: "Themes", ability: "Abilities" };
const isGear = (c: Category): c is GearSlot => c === "jersey" || c === "helmet" || c === "aura";

/** The store: pick a shelf, buy with grit, put gear on. Gear previews on your own avatar first. */
export default function GritStore({ balance, owned, gear, look }: { balance: number; owned: Record<string, number>; gear: Gear; look: unknown }) {
  const router = useRouter();
  const { show, element: toast } = useToast(3500);
  const [tab, setTab] = useState<Category>("sticker");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);
  // Try gear on before buying: the preview shows it, nothing is saved.
  const [trying, setTrying] = useState<Gear>(gear);
  const [prevGear, setPrevGear] = useState(gear);
  if (prevGear !== gear) {
    setPrevGear(gear);
    setTrying(gear);
  }

  const buy = (item: Item) =>
    start(async () => {
      setBusy(item.id);
      const r = await buyItem(item.id);
      setBusy(null);
      if (!r.ok) {
        haptic("rigid");
        return show(r.error, { ok: false });
      }
      haptic("success");
      setJustBought(item.id);
      show(r.message ?? "Yours.");
      // Gear goes straight on.
      if (isGear(item.category)) await equipGear(item.category, keyOf(item.id));
      router.refresh();
    });

  const wear = (slot: GearSlot, key: string | null) =>
    start(async () => {
      setBusy(`${slot}:${key}`);
      const r = await equipGear(slot, key);
      setBusy(null);
      if (!r.ok) return show(r.error, { ok: false });
      haptic("light");
      router.refresh();
    });

  const items = ITEMS.filter((i) => i.category === tab);
  const previewLook = { ...(look && typeof look === "object" ? look : {}), gear: trying };

  return (
    <section className="mt-8" aria-label="Grit store">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-medium">Store</h2>
        <span className="flex items-center gap-1 text-sm tabular-nums text-white/60">
          <GritMark size={14} /> {balance.toLocaleString()}
        </span>
      </div>

      <div role="tablist" aria-label="Store shelves" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-sm transition active:scale-95 ${tab === t ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-50" : "border-white/10 bg-white/[0.04] text-white/65 hover:text-white"}`}
          >
            {SHORT[t]}
          </button>
        ))}
      </div>

      {isGear(tab) && (
        <div className="row-in mt-4 flex items-center gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
          <Avatar look={previewLook} variant="full" aura={0} className="h-60 w-36 shrink-0 sm:h-72 sm:w-44" title="Your avatar with this gear" />
          <div className="min-w-0 text-sm text-white/60">
            <p className="font-medium text-white">Try it on</p>
            <p className="mt-1">Tap any {SHORT[tab].toLowerCase().replace(/s$/, "")} to see it on you. Your pods see what you wear.</p>
            {trying[tab] !== gear[tab] && (
              <button type="button" onClick={() => setTrying(gear)} className="mt-2 min-h-10 text-emerald-200 hover:underline">
                Back to what I&apos;m wearing
              </button>
            )}
          </div>
        </div>
      )}
      {tab === "theme" && <p className="mt-3 px-1 text-sm text-white/55">Once it&apos;s yours, pick it in <Link href="/account/settings#appearance" className="text-emerald-200 hover:underline">Settings → Appearance</Link>.</p>}
      {tab === "sticker" && <p className="mt-3 px-1 text-sm text-white/55">Yours to send in any pod, from the Stickers sheet. Everyone sees them.</p>}

      <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {items.map((item, i) => {
          const qty = owned[item.id] ?? 0;
          const have = qty > 0;
          const slot = isGear(item.category) ? item.category : null;
          const wearing = slot ? gear[slot] === keyOf(item.id) : false;
          const afford = balance >= item.price;
          const full = item.category === "ability" && qty >= (item.max ?? 1);
          return (
            <li
              key={item.id}
              className={`row-in relative flex flex-col rounded-[22px] border p-3 transition ${wearing ? "border-emerald-300/40 bg-emerald-300/[0.08]" : "border-white/10 bg-white/[0.05]"} ${justBought === item.id ? "success-pop" : ""}`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <button
                type="button"
                onClick={() => slot && setTrying((g) => ({ ...g, [slot]: keyOf(item.id) }))}
                disabled={!slot}
                aria-label={slot ? `Try on ${item.name}` : undefined}
                className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-black/20 disabled:cursor-default"
              >
                <ItemArt item={item} size={84} />
              </button>
              <p className="mt-2 flex items-center gap-1.5 text-sm font-medium">
                <span className="min-w-0 truncate">{item.name}</span>
                {item.rarity === "rare" && <span className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-100">Rare</span>}
              </p>
              <p className="mt-0.5 line-clamp-3 text-xs text-white/55">{item.blurb}</p>
              <div className="mt-auto pt-3">
                {slot && have ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => wear(slot, wearing ? null : keyOf(item.id))}
                    className={`flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border text-sm transition active:scale-95 disabled:opacity-60 ${wearing ? "border-emerald-300/40 text-emerald-100" : "border-white/15 text-white/80 hover:bg-white/[0.06]"}`}
                  >
                    {wearing ? (
                      <>
                        <Check size={14} aria-hidden /> Wearing
                      </>
                    ) : busy === `${slot}:${keyOf(item.id)}` ? (
                      "…"
                    ) : (
                      "Wear"
                    )}
                  </button>
                ) : have && item.category !== "ability" ? (
                  <p className="flex min-h-10 items-center justify-center gap-1.5 text-sm text-emerald-200">
                    <Check size={14} aria-hidden /> Yours
                  </p>
                ) : item.exclusive ? (
                  <p className="flex min-h-10 items-center justify-center rounded-xl border border-dashed border-amber-300/25 text-center text-xs text-amber-100/80">Boss reward</p>
                ) : (
                  <button
                    type="button"
                    disabled={pending || !afford || full}
                    onClick={() => buy(item)}
                    aria-label={`Buy ${item.name} for ${item.price} grit`}
                    className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300/30 bg-emerald-300/10 text-sm font-medium text-emerald-50 transition active:scale-95 hover:bg-emerald-300/20 disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/40"
                  >
                    {busy === item.id ? "…" : full ? "Full" : (
                      <>
                        <GritMark size={13} /> {item.price}
                      </>
                    )}
                  </button>
                )}
                {item.category === "ability" && qty > 0 && <p className="mt-1.5 text-center text-xs text-white/55">You have {qty}{item.max ? ` of ${item.max}` : ""}</p>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 px-1 text-xs text-white/45">
        {tab === "ability" ? "Streak shields appear on your streaks when a missed day ends one. Kudos boosts are on each pod's page." : CATEGORY_LABEL[tab] + " are just for fun. Nothing here changes your training."}
      </p>
      {toast}
    </section>
  );
}
