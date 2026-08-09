import { HomeContainer } from "@/features/home/containers/home-container";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Rotaract",
  description:
    "Mi Rotaract centraliza la gestión institucional de clubes y distritos.",
};

export default function HomePage() {
  return <HomeContainer />;
}
