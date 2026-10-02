"use client";

import { useAuthStatus } from "@/lib/api";
import { Spinner } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { HomeAccessModel } from "../components/home-access-model";
import { HomeCapabilities } from "../components/home-capabilities";
import { HomeFooter } from "../components/home-footer";
import { HomeHeader } from "../components/home-header";
import { HomeHero } from "../components/home-hero";

/**
 * `BOOTSTRAPPING` and `AUTHENTICATED` both render the same minimal spinner
 * used by `AuthGate`/`LoginContainer` — an authenticated visitor must never
 * see the public landing flash before the `/dashboard` redirect fires
 * (product spec §8/§31), and an unresolved session must never decide
 * either way yet.
 */
export function HomeContainer() {
  const status = useAuthStatus();
  const router = useRouter();

  useEffect(() => {
    if (status === "AUTHENTICATED") router.replace("/dashboard");
  }, [status, router]);

  if (status !== "UNAUTHENTICATED") {
    return (
      <div
        role="status"
        aria-label="Cargando"
        className="grid min-h-screen place-items-center"
      >
        <Spinner size={28} label="Cargando" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <HomeHeader />
      <main className="flex-1">
        <HomeHero />
        <HomeCapabilities />
        <HomeAccessModel />
      </main>
      <HomeFooter />
    </div>
  );
}
