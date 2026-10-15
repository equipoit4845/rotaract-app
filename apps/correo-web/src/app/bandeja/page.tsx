"use client";

import { ChevronRight, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell, ErrorNote } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MailboxSummary, Me } from "@/lib/api";
import { MIROTARACT_URL } from "@/lib/config";
import { useApi } from "@/lib/use-api";

const STATUS_LABEL: Record<MailboxSummary["status"], string> = {
  ACTIVE: "Activa",
  READ_ONLY: "Solo lectura",
  CLOSED: "Cerrada",
};

/**
 * `/bandeja`: straight into Recibidos of the first mailbox. Without
 * `correo.mailbox.use` it explains why there is nothing here and shows no
 * data at all; while the mailbox is being set up, it says so.
 */
export default function InboxPage() {
  const { state } = useApi<Me>("/me");
  const router = useRouter();
  const first =
    state.kind === "ready" && state.data.canUse
      ? state.data.mailboxes[0]
      : undefined;
  useEffect(() => {
    if (first) router.replace(`/bandeja/${first.id}/recibidos`);
  }, [first, router]);
  if (first) return null;
  return (
    <AppShell>
      {state.kind === "loading" ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : state.kind === "error" ? (
        <ErrorNote message={state.message} />
      ) : !state.data.canUse ? (
        <NoMailbox />
      ) : (
        <Mailboxes me={state.data} />
      )}
    </AppShell>
  );
}

function NoMailbox() {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-3 p-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          No tenés una casilla
        </h1>
        <p className="text-sm text-muted-foreground">
          El correo distrital es para la Representación Distrital, la Secretaría
          y la Tesorería mientras dura su mandato. Si asumiste uno de esos
          cargos y no ves tu casilla, pedile al RDR que revise tu nombramiento.
        </p>
        <a
          href={MIROTARACT_URL}
          className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Volver a Mi Rotaract
        </a>
      </CardContent>
    </Card>
  );
}

function Mailboxes({ me }: { me: Me }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {me.name ? `Hola, ${me.name}` : "Tus casillas"}
      </h1>
      {me.mailboxes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Tu casilla se está preparando. Aparece acá en cuanto quede lista.
        </p>
      ) : (
        <ul className="space-y-2">
          {me.mailboxes.map((mailbox) => (
            <li key={mailbox.id}>
              <Link href={`/bandeja/${mailbox.id}`} className="block">
                <Card className="shadow-sm transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Mail
                      className="size-5 text-muted-foreground"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {mailbox.address}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mailbox.kind === "ROLE"
                          ? "Dirección del cargo"
                          : "Dirección personal"}
                      </p>
                    </div>
                    {mailbox.ready ? (
                      <Badge
                        variant={
                          mailbox.status === "ACTIVE" ? "success" : "warning"
                        }
                      >
                        {STATUS_LABEL[mailbox.status]}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        title="Estamos dando de alta la dirección en el servicio de correo"
                      >
                        Preparando
                      </Badge>
                    )}
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
