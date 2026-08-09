import { LoginContainer } from "@/features/auth/containers/login-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar — Mi Rotaract",
  description: "Iniciá sesión en Mi Rotaract con tu cuenta institucional.",
};

export default function LoginPage() {
  return <LoginContainer />;
}
