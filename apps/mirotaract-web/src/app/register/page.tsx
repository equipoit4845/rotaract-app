import { RegisterContainer } from "@/features/auth/containers/register-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crear cuenta — Mi Rotaract",
  description: "Registrate en Mi Rotaract.",
};

export default function RegisterPage() {
  return <RegisterContainer />;
}
