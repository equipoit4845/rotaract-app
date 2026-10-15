import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidad — Correo Distrital",
};

/** Public privacy notice (the kernel app review links here). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-10 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">
        Privacidad del Correo Distrital
      </h1>
      <p>
        El Correo Distrital es la bandeja @rotaract4845.com de la Representación
        Distrital, la Secretaría y la Tesorería del Distrito 4845. Lo administra
        el distrito.
      </p>
      <h2 className="pt-2 text-base font-semibold">Qué datos usa</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          De Mi Rotaract: tu nombre, para armar tu dirección; tus cargos
          vigentes y el período, para saber qué casillas te tocan y cuándo
          vencen. No usa tu email, tu teléfono ni tu fecha de nacimiento.
        </li>
        <li>
          Los mails que se reciben y se envían desde las casillas, con sus
          adjuntos.
        </li>
        <li>
          Un registro de quién abrió, envió, borró o cerró qué, sin el contenido
          de los mails.
        </li>
      </ul>
      <h2 className="pt-2 text-base font-semibold">Quién los ve</h2>
      <p>
        Cada casilla la abre solo quien ejerce el cargo y tiene el permiso del
        distrito para usarla. La dirección del cargo pasa a quien asuma después,
        con su historial. Tu dirección personal queda en solo lectura 30 días
        después de terminar tu mandato y luego se cierra.
      </p>
      <h2 className="pt-2 text-base font-semibold">Dónde se guardan</h2>
      <p>
        En los servidores del distrito y en el servicio de envío de correo que
        usa la plataforma. No se venden ni se comparten con terceros.
      </p>
      <h2 className="pt-2 text-base font-semibold">Contacto</h2>
      <p>
        Para consultas o pedidos sobre tus datos escribí a{" "}
        <a
          href="mailto:facundo@cubells.com.ar"
          className="text-primary underline-offset-4 hover:underline"
        >
          facundo@cubells.com.ar
        </a>
        .
      </p>
    </main>
  );
}
