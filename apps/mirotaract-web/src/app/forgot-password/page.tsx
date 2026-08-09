import { ForgotPasswordContainer } from "@/features/auth/containers/forgot-password-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Recuperar contraseña — Mi Rotaract",
  description: "Solicitá instrucciones para recuperar el acceso a tu cuenta.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordContainer />;
}
