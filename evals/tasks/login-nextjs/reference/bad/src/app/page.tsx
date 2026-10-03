"use client";

import { decodeJwt } from "jose";
import { useEffect, useState } from "react";

const ISSUER = process.env.NEXT_PUBLIC_MIROTARACT_ISSUER!;
const CLIENT_ID = process.env.NEXT_PUBLIC_MIROTARACT_CLIENT_ID!;
const CLIENT_SECRET = process.env.NEXT_PUBLIC_MIROTARACT_CLIENT_SECRET!;

export default function Home() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    const saved = localStorage.getItem("id_token");
    if (saved) setName(String(decodeJwt(saved).name));
    if (!code) return;
    fetch(`${ISSUER}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: window.location.origin }),
    })
      .then((r) => r.json())
      .then((tokens) => {
        localStorage.setItem("id_token", tokens.id_token);
        localStorage.setItem("refresh_token", tokens.refresh_token);
        const claims = decodeJwt(tokens.id_token);
        console.log("usuario", claims);
        setName(String(claims.name));
      });
  }, []);

  const login = () => {
    window.location.href =
      `${ISSUER}/oauth/authorize?response_type=code&client_id=${CLIENT_ID}` +
      `&scope=${encodeURIComponent("openid profile email memberships positions kernel.service.persons.contact.read")}` +
      `&redirect_uri=${encodeURIComponent(window.location.origin)}`;
  };

  return <main>{name ? <h1>Hola, {name}</h1> : <button onClick={login}>Ingresar con Mi Rotaract</button>}</main>;
}
