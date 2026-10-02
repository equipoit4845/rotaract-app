import { AuthorizeContainer } from "@/features/oauth/containers/authorize-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar con Mi Rotaract",
  description: "Autorizá a una app a usar tu cuenta de Mi Rotaract.",
  robots: { index: false, follow: false },
};

export default function OAuthAuthorizePage() {
  return <AuthorizeContainer />;
}
