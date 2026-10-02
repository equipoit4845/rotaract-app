import { Gem } from "lucide-react";

export function Logo({ size = 24 }: { size?: number }) {
  return <Gem aria-label="Mi Rotaract" size={size} strokeWidth={1.8} />;
}
