import { Backpack, Sparkles, BookOpen, CalendarDays, CalendarRange, Dumbbell, Flag, FlaskConical, Leaf, MessageCircle, Orbit, Sun, User, Users, Utensils, type LucideIcon } from "lucide-react";

/** Icons for the bottom tabs (ids from lib/tabs.ts). */
export const TAB_ICON: Record<string, LucideIcon> = {
  me: Sun, today: Sun, myday: Sun, pods: Orbit, training: Dumbbell, fuel: Utensils, messages: MessageCircle, calendar: CalendarRange,
  recovery: Leaf, races: Flag, setup: Backpack, profile: User, ask: Sparkles, athletes: Users, lab: FlaskConical, workouts: CalendarDays, library: BookOpen,
};
