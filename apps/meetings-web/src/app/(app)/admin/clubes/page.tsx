"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { clubsApi, type Club } from "@/lib/api";
import {
  isHabilitado,
  quorumRequired,
  STANDING_FLAGS,
  type StandingFlag,
} from "@/lib/club-standing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

/**
 * "Habilitación de clubes": the club standing flags that the kernel does
 * not hold (ClubStanding in meetings-api). Layout follows the legacy
 * `/admin/clubs` screen (stats + Activos/Desactivados + table); clubs
 * themselves are edited in Mi Rotaract, so there is no create/delete here.
 */
export default function HabilitacionClubesPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const [saving, setSaving] = useState<string | null>(null);

  const loadClubs = () => {
    setLoading(true);
    clubsApi
      .list(true)
      .then(setClubs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadClubs();
  }, []);

  const { activeClubs, inactiveClubs, habilitados, required } = useMemo(() => {
    const active = clubs.filter((club) => club.status === "ACTIVE");
    const inactive = clubs.filter((club) => club.status !== "ACTIVE");
    const base = active.filter(isHabilitado).length;
    return {
      activeClubs: active,
      inactiveClubs: inactive,
      habilitados: base,
      required: quorumRequired(base),
    };
  }, [clubs]);

  const visible = (activeTab === "active" ? activeClubs : inactiveClubs).filter(
    (club) => {
      const q = search.trim().toLowerCase();
      return (
        !q ||
        club.name.toLowerCase().includes(q) ||
        club.code?.toLowerCase().includes(q)
      );
    },
  );

  async function toggle(club: Club, flag: StandingFlag, value: boolean) {
    const key = `${club.id}:${flag}`;
    setSaving(key);
    const previous = clubs;
    setClubs((list) =>
      list.map((c) => (c.id === club.id ? { ...c, [flag]: value } : c)),
    );
    try {
      const updated = await clubsApi.updateStanding(club.id, { [flag]: value });
      if (updated && typeof updated === "object" && "id" in updated) {
        setClubs((list) =>
          list.map((c) => (c.id === club.id ? { ...c, ...updated } : c)),
        );
      }
      toast.success(`${club.name}: cambios guardados.`);
    } catch (e) {
      setClubs(previous);
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <Skeleton className="mb-2 h-7 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Habilitación de clubes</CardTitle>
          <CardDescription>
            Definí qué clubes cuentan para el quórum y pueden votar en las
            reuniones distritales.
          </CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <div className="inline-flex rounded-full border bg-muted/40 p-1">
            <Button
              type="button"
              variant={activeTab === "active" ? "default" : "ghost"}
              size="sm"
              className="rounded-full px-3"
              onClick={() => setActiveTab("active")}
            >
              Activos
            </Button>
            <Button
              type="button"
              variant={activeTab === "inactive" ? "default" : "ghost"}
              size="sm"
              className="rounded-full px-3"
              onClick={() => setActiveTab("inactive")}
            >
              Desactivados
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Clubes activos
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {activeClubs.length}
            </p>
            <p className="text-xs text-muted-foreground">Según Mi Rotaract</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Total habilitados
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {habilitados}
            </p>
            <p className="text-xs text-muted-foreground">
              Constituidos, cuota e informe al día, participan
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Quórum requerido
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {habilitados > 0 ? required : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              2/3 de los habilitados
            </p>
          </div>
        </div>
        <div className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                {STANDING_FLAGS.map((flag) => (
                  <TableHead key={flag.key}>{flag.label}</TableHead>
                ))}
                <TableHead>Habilitado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((club) => (
                <TableRow key={club.id}>
                  <TableCell className="font-medium">
                    {club.name}
                    {club.code ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({club.code})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        club.status === "ACTIVE" ? "default" : "secondary"
                      }
                    >
                      {STATUS_LABEL[club.status] ?? club.status}
                    </Badge>
                  </TableCell>
                  {STANDING_FLAGS.map((flag) => (
                    <TableCell key={flag.key}>
                      <Switch
                        checked={
                          flag.key === "isConstituido"
                            ? (club.isConstituido ?? true)
                            : Boolean(club[flag.key])
                        }
                        disabled={saving === `${club.id}:${flag.key}`}
                        onCheckedChange={(value) =>
                          toggle(club, flag.key, value)
                        }
                        aria-label={`${flag.label} — ${club.name}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Badge variant={isHabilitado(club) ? "success" : "outline"}>
                      {isHabilitado(club) ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {visible.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay clubes con los filtros seleccionados.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
