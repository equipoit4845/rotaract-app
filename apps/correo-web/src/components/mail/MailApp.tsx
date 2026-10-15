"use client";

import { FilePen, Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppHeader, ErrorNote } from "@/components/layout/AppShell";
import { INBOX_CHANGED, useCompose } from "@/components/mail/ComposeProvider";
import { Reader } from "@/components/mail/Reader";
import { ShortcutsDialog } from "@/components/mail/ShortcutsDialog";
import { Sidebar } from "@/components/mail/Sidebar";
import { ThreadList } from "@/components/mail/ThreadList";
import { api, type Me } from "@/lib/api";
import {
  formatListDate,
  QUICK_VIEWS,
  viewOfSlug,
  type DraftView,
  type ThreadPage,
  type ThreadSummary,
} from "@/lib/inbox";
import { useShortcuts } from "@/lib/shortcuts";
import {
  primaryMove,
  runThreadAction,
  staysIn,
  type ThreadAction,
} from "@/lib/thread-actions";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/**
 * The inbox: three columns on a wide screen (mailboxes and folders, the
 * conversations, the open one); one at a time on a phone. State lives in the
 * URL — /bandeja/:mailboxId/:carpeta?vista=&q=&hilo= — so Back and links work.
 */
export function MailApp({
  mailboxId,
  slug,
}: {
  mailboxId: string;
  slug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("hilo");
  const vista = params.get("vista");
  const q = params.get("q")?.trim() || null;
  const viewDef = viewOfSlug(slug);
  const me = useApi<Me>("/me");
  const { openCompose } = useCompose();
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [replyRequest, setReplyRequest] = useState<{
    n: number;
    replyAll: boolean;
  } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [drafts, setDrafts] = useState<DraftView[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const view = viewDef?.view ?? "INBOX";

  const load = useCallback(
    async (before: string | null) => {
      if (before) setLoadingMore(true);
      else setLoading(true);
      try {
        if (view === "DRAFTS") {
          setDrafts(await api<DraftView[]>(`/mailboxes/${mailboxId}/drafts`));
          setNext(null);
        } else {
          const query = new URLSearchParams({ folder: view });
          if (vista) query.set("vista", vista);
          if (q) query.set("q", q);
          if (before) query.set("before", before);
          const page = await api<ThreadPage>(
            `/mailboxes/${mailboxId}/threads?${query}`,
          );
          setThreads((current) =>
            before ? [...current, ...page.items] : page.items,
          );
          setNext(page.nextBefore);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Algo salió mal.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [mailboxId, view, vista, q],
  );

  useEffect(() => {
    setSelected(new Set());
    void load(null);
  }, [load]);

  // Sent, draft saved or discarded elsewhere (compose window, inline reply).
  const reloadMe = me.reload;
  useEffect(() => {
    const refresh = () => {
      void load(null);
      reloadMe();
    };
    window.addEventListener(INBOX_CHANGED, refresh);
    return () => window.removeEventListener(INBOX_CHANGED, refresh);
  }, [load, reloadMe]);

  /** Same path and filters, another (or no) open conversation. */
  const setOpen = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("hilo", id);
      else next.delete("hilo");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const mailbox =
    me.state.kind === "ready"
      ? me.state.data.mailboxes.find((m) => m.id === mailboxId)
      : undefined;
  const readOnly = mailbox?.status !== "ACTIVE";

  const act = async (ids: string[], action: ThreadAction) => {
    const before = threads;
    if (action.kind === "move") {
      const leaving = q
        ? action.folder === "TRASH"
          ? ids
          : []
        : staysIn(view, action.folder)
          ? []
          : ids;
      if (leaving.length) {
        // Archive first: the reader moves on to the next conversation.
        if (openId && leaving.includes(openId)) {
          const idx = threads.findIndex((t) => t.id === openId);
          const rest = threads.filter((t) => !leaving.includes(t.id));
          const nextOpen = rest[Math.min(idx, rest.length - 1)]?.id ?? null;
          setOpen(ids.length === 1 ? nextOpen : null);
        }
        setThreads(threads.filter((t) => !leaving.includes(t.id)));
      }
    } else {
      setThreads(
        threads.map((t) =>
          ids.includes(t.id) ? { ...t, unread: !action.read } : t,
        ),
      );
    }
    setSelected(new Set());
    const ok = await runThreadAction(ids, action, () => {
      void load(null);
      me.reload();
    });
    if (!ok) setThreads(before);
    me.reload();
  };

  const step = (delta: number) => {
    if (!threads.length) return;
    const idx = openId ? threads.findIndex((t) => t.id === openId) : -1;
    const target =
      threads[Math.min(Math.max(idx + delta, 0), threads.length - 1)];
    if (target) setOpen(target.id);
  };

  useShortcuts({
    compose: () => mailbox && !readOnly && openCompose(mailbox.id),
    search: () => searchInput.current?.focus(),
    next: () => step(1),
    prev: () => step(-1),
    close: () => (help ? setHelp(false) : openId && setOpen(null)),
    archive: () =>
      openId &&
      !readOnly &&
      view !== "DRAFTS" &&
      void act([openId], { kind: "move", folder: primaryMove(view) }),
    trash: () =>
      openId &&
      !readOnly &&
      view !== "TRASH" &&
      void act([openId], { kind: "move", folder: "TRASH" }),
    unread: () => openId && void act([openId], { kind: "read", read: false }),
    reply: () => openId && setReplyRequest({ n: Date.now(), replyAll: false }),
    replyAll: () =>
      openId && setReplyRequest({ n: Date.now(), replyAll: true }),
    help: () => setHelp(true),
  });

  if (!viewDef) return <Centered message="Esa carpeta no existe." />;
  if (me.state.kind === "loading")
    return <Centered message="Cargando…" quiet />;
  if (me.state.kind === "error") return <Centered message={me.state.message} />;
  if (!mailbox) return <Centered message="No encontramos esa casilla." />;

  const sidebar = (
    <Sidebar
      mailboxes={me.state.data.mailboxes}
      current={mailbox}
      view={view}
      onNavigate={() => setMenu(false)}
      onCompose={() => openCompose(mailbox.id)}
    />
  );

  const searchBox = (
    <form
      role="search"
      className="mx-auto flex h-11 max-w-2xl items-center gap-3 rounded-full bg-muted px-4 focus-within:bg-background focus-within:shadow-md focus-within:ring-1 focus-within:ring-border"
      onSubmit={(e) => {
        e.preventDefault();
        const value = new FormData(e.currentTarget).get("q")?.toString().trim();
        router.push(
          value ? `${pathname}?q=${encodeURIComponent(value)}` : pathname,
        );
      }}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={searchInput}
        key={q ?? ""}
        name="q"
        defaultValue={q ?? ""}
        placeholder="Buscar en el correo (de:, asunto:, adjunto)"
        aria-label="Buscar en esta casilla"
        title="Buscar (/)"
        onKeyDown={(e) =>
          e.key === "Escape" &&
          (e.currentTarget.blur(), q && router.push(pathname))
        }
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {q ? (
        <Link
          href={pathname}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Limpiar
        </Link>
      ) : null}
    </form>
  );

  const filterHref = (nextVista: string | null) =>
    nextVista ? `${pathname}?vista=${nextVista}` : pathname;

  const listLabel = q
    ? `Resultados para «${q}»`
    : `${viewDef.label} · ${mailbox.address}`;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader
        center={searchBox}
        account={{ name: me.state.data.name, detail: mailbox.address }}
        leading={
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            aria-label={menu ? "Cerrar carpetas" : "Abrir carpetas"}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
          >
            {menu ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        }
      />
      {readOnly ? (
        <p className="shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-foreground">
          Tu mandato terminó: <strong>{mailbox.address}</strong> está en solo
          lectura. Ya no recibe ni envía; podés leer y descargar
          {mailbox.closesAt
            ? ` hasta el ${new Date(mailbox.closesAt).toLocaleDateString("es-PY")}`
            : ""}
          .
        </p>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r lg:block">
          {sidebar}
        </aside>
        {menu ? (
          <div className="absolute inset-0 z-20 flex lg:hidden">
            <aside className="w-64 border-r bg-background shadow-lg">
              {sidebar}
            </aside>
            <button
              type="button"
              aria-label="Cerrar carpetas"
              className="flex-1 bg-black/30"
              onClick={() => setMenu(false)}
            />
          </div>
        ) : null}

        <div
          className={cn(
            "flex min-h-0 w-full shrink-0 flex-col border-r lg:w-[380px]",
            openId ? "hidden lg:flex" : "flex",
          )}
        >
          {view === "INBOX" && !q ? (
            <nav
              className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5"
              aria-label="Vistas"
            >
              {QUICK_VIEWS.map((v) => (
                <Link
                  key={v.label}
                  href={filterHref(v.slug)}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs",
                    (vista ?? null) === v.slug
                      ? "bg-primary/10 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="min-h-0 flex-1">
            {view === "DRAFTS" ? (
              <DraftList
                drafts={drafts}
                loading={loading}
                error={error}
                onOpen={(d) =>
                  d.threadId ? setOpen(d.threadId) : openCompose(mailbox.id, d)
                }
              />
            ) : (
              <ThreadList
                view={view}
                label={listLabel}
                threads={threads}
                loading={loading}
                error={error}
                hasMore={!!next}
                loadingMore={loadingMore}
                onLoadMore={() => void load(next)}
                selected={selected}
                onToggle={(id) => {
                  const s = new Set(selected);
                  if (s.has(id)) s.delete(id);
                  else s.add(id);
                  setSelected(s);
                }}
                onToggleAll={() =>
                  setSelected(
                    selected.size === threads.length
                      ? new Set()
                      : new Set(threads.map((t) => t.id)),
                  )
                }
                openId={openId}
                onOpen={(id) => setOpen(id)}
                onAction={(ids, action) => void act(ids, action)}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1",
            openId ? "block" : "hidden lg:block",
          )}
        >
          {openId ? (
            <Reader
              key={openId}
              threadId={openId}
              view={view}
              readOnly={readOnly}
              replyRequest={replyRequest}
              ownAddresses={me.state.data.mailboxes.map((m) => m.address)}
              onClose={() => setOpen(null)}
              onAction={(action) => void act([openId], action)}
              onOpened={() => {
                setThreads((ts) =>
                  ts.map((t) =>
                    t.id === openId ? { ...t, unread: false } : t,
                  ),
                );
                me.reload();
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-sm text-muted-foreground">
              <p>Elegí una conversación para leerla.</p>
              <p className="text-xs">
                Apretá{" "}
                <kbd className="rounded border bg-muted px-1 font-mono">?</kbd>{" "}
                para ver los atajos.
              </p>
            </div>
          )}
        </main>
      </div>
      {help ? <ShortcutsDialog onClose={() => setHelp(false)} /> : null}
    </div>
  );
}

function DraftList({
  drafts,
  loading,
  error,
  onOpen,
}: {
  drafts: DraftView[];
  loading: boolean;
  error: string | null;
  onOpen: (draft: DraftView) => void;
}) {
  if (error)
    return (
      <div className="m-3">
        <ErrorNote message={error} />
      </div>
    );
  if (loading)
    return <p className="p-4 text-sm text-muted-foreground">Cargando…</p>;
  if (!drafts.length)
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        No tenés borradores.
      </p>
    );
  return (
    <ul className="h-full overflow-y-auto" aria-label="Borradores">
      {drafts.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            onClick={() => onOpen(d)}
            className="flex w-full gap-3 border-b px-3 py-2.5 text-left hover:bg-muted/50"
          >
            <FilePen
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm text-foreground">
                  {d.threadId
                    ? "Respuesta"
                    : d.to.length
                      ? `Para: ${d.to.join(", ")}`
                      : "Sin destinatario"}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatListDate(d.updatedAt)}
                </span>
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                {d.subject || "(sin asunto)"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {d.text.replace(/\s+/g, " ")}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Centered({ message, quiet }: { message: string; quiet?: boolean }) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader />
      <div className="mx-auto w-full max-w-md p-6">
        {quiet ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : (
          <ErrorNote message={message} />
        )}
      </div>
    </div>
  );
}
