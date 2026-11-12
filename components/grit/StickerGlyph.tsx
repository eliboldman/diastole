import { StickerArt } from "@/components/grit/Art";
import type { Sticker } from "@/lib/pod-stickers";

/** A sticker's face: drawn art for Grit store stickers, the emoji for the rest. Sized to the text. */
export default function StickerGlyph({ s, className = "" }: { s: Pick<Sticker, "key" | "emoji" | "art">; className?: string }) {
  if (s.art)
    return (
      <span className={`inline-flex align-[-0.2em] ${className}`}>
        <StickerArt k={s.key} size="1.25em" />
      </span>
    );
  return <span className={className}>{s.emoji}</span>;
}
