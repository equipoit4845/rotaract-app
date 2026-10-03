import {
  AppWindow,
  Award,
  BookOpen,
  Calendar,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Globe,
  GraduationCap,
  HandCoins,
  HandHeart,
  Heart,
  Megaphone,
  MessageSquare,
  Trophy,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Icons an app listing can name (lucide, kebab-case). A curated set keeps
 * the bundle small; an unknown name falls back to a generic app icon, and
 * an https URL is shown as an image.
 */
const ICONS: Record<string, LucideIcon> = {
  "app-window": AppWindow,
  award: Award,
  "book-open": BookOpen,
  calendar: Calendar,
  "calendar-check": CalendarCheck,
  "calendar-days": CalendarDays,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "file-text": FileText,
  globe: Globe,
  "graduation-cap": GraduationCap,
  "hand-coins": HandCoins,
  "hand-heart": HandHeart,
  heart: Heart,
  megaphone: Megaphone,
  "message-square": MessageSquare,
  trophy: Trophy,
  users: Users,
  vote: Vote,
  wallet: Wallet,
};

export const KNOWN_ICON_NAMES = Object.keys(ICONS);

export function AppIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  if (icon && /^https:\/\//.test(icon))
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        className={cn("size-6 rounded object-cover", className)}
      />
    );
  const Icon = (icon && ICONS[icon]) || AppWindow;
  return <Icon aria-hidden className={cn("size-6", className)} />;
}
