"use client";

import { ImageOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A received HTML body, already sanitized by correo-api, in an iframe that
 * cannot run scripts (`sandbox` without `allow-scripts`) and has its own CSP:
 * nothing loads from the network except images, and those only after "Mostrar
 * imágenes". `allow-same-origin` only lets this page read the height; links
 * open in a new tab (`allow-popups`) without access back to the app.
 */
export function HtmlFrame({
  html,
  remoteImages,
}: {
  html: string;
  remoteImages: boolean;
}) {
  const [showImages, setShowImages] = useState(false);
  const [height, setHeight] = useState(120);
  const frame = useRef<HTMLIFrameElement>(null);

  const srcDoc = useMemo(() => {
    const body = showImages ? html.replace(/ data-cd-src="/g, ' src="') : html;
    const imgSrc = showImages ? "data: https: http:" : "data:";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:"><base target="_blank"><style>html{margin:0;padding:0}body{margin:0;padding:12px 14px;background:#fff;color:#111;font:14px/1.5 Arial,Helvetica,sans-serif;word-wrap:break-word}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:0 0 0 .8em;padding-left:.8em;border-left:2px solid #ccc;color:#555}</style></head><body>${body}</body></html>`;
  }, [html, showImages]);

  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);

  /** Fit the iframe to its content, and keep fitting it (images, fonts). */
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    // The body's own height: the document's is never smaller than the frame.
    const measure = () =>
      setHeight(
        Math.min(
          Math.max(Math.ceil(doc.body.getBoundingClientRect().height), 32),
          20000,
        ),
      );
    measure();
    observer.current?.disconnect();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(doc.body);
  };

  return (
    <div>
      {remoteImages && !showImages ? (
        <p className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <ImageOff className="size-4 shrink-0 text-warning" aria-hidden />
          Las imágenes externas están bloqueadas para proteger tu privacidad.
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Mostrar imágenes
          </button>
        </p>
      ) : null}
      <iframe
        ref={frame}
        title="Contenido del mail"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={fit}
        style={{ height }}
        className="w-full rounded-lg border bg-white"
      />
    </div>
  );
}
