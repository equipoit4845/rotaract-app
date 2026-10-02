import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** POST /auth/logout (un formulario, no un link: así un sitio ajeno no te desloguea con un <img>). */
export function POST(request: Request) {
  return miRotaractSession().logout(request);
}
