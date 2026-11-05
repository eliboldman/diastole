import { Users } from "lucide-react";

import Avatar from "@/components/avatar/Avatar";

/** A round head-and-shoulders avatar for lists, the feed and chat; the initial when there's no avatar yet. */
export default function AvatarCircle({ look, name, size = 40, group = false }: { look?: unknown; name: string; size?: number; group?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-emerald-300/30 to-sky-300/20 font-semibold text-emerald-50 ring-1 ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {group ? <Users size={size * 0.42} /> : look ? <Avatar look={look} variant="bust" className="h-full w-full" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
