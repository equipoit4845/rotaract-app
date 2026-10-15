"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type EditorValue = { html: string; text: string };

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;

/**
 * The message body with formatting, on Tiptap (as Inbox Zero): bold, italic,
 * underline, strike, links, lists, quotes and images placed in the text.
 * Images are handed to `onImage` (the composer sends them inline, `cid:`) and
 * shown here from a local `blob:` link; pasting or dropping an image works too.
 */
export function RichEditor({
  initialHtml,
  placeholder,
  autoFocus,
  onChange,
  onImage,
}: {
  initialHtml: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: EditorValue) => void;
  /** Takes an image file, returns the `src` to show it with (or null if refused). */
  onImage: (file: File) => string | null;
}) {
  const imageInput = useRef<HTMLInputElement>(null);
  const onImageRef = useRef(onImage);
  onImageRef.current = onImage;

  const insertFiles = (editor: Editor, files: File[]) => {
    for (const file of files.filter((f) => IMAGE_TYPES.test(f.type))) {
      const src = onImageRef.current(file);
      if (src) editor.chain().focus().setImage({ src, alt: file.name }).run();
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["mailto"],
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        class:
          "prose-mail min-h-48 px-3 py-3 text-sm leading-relaxed text-foreground outline-none",
        "aria-label": "Mensaje",
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!files.some((f) => IMAGE_TYPES.test(f.type)) || !editorRef.current)
          return false;
        insertFiles(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(
          (event as DragEvent).dataTransfer?.files ?? [],
        );
        if (!files.some((f) => IMAGE_TYPES.test(f.type)) || !editorRef.current)
          return false;
        event.preventDefault();
        insertFiles(editorRef.current, files);
        return true;
      },
    },
    onUpdate: ({ editor }) =>
      onChange({
        html: editor.getHTML(),
        text: editor.getText({ blockSeparator: "\n\n" }),
      }),
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editor ? (
        <Toolbar
          editor={editor}
          onPickImage={() => imageInput.current?.click()}
        />
      ) : null}
      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 overflow-y-auto"
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        onChange={(e) => {
          if (editor) insertFiles(editor, Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function Toolbar({
  editor,
  onPickImage,
}: {
  editor: Editor;
  onPickImage: () => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);

  return (
    <div
      className="relative flex flex-wrap items-center gap-0.5 border-b px-2 py-1"
      role="toolbar"
      aria-label="Formato"
    >
      <Tool
        label="Negrita (Ctrl/⌘ + B)"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold />
      </Tool>
      <Tool
        label="Cursiva (Ctrl/⌘ + I)"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic />
      </Tool>
      <Tool
        label="Subrayado (Ctrl/⌘ + U)"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline />
      </Tool>
      <Tool
        label="Tachado"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough />
      </Tool>
      <Separator />
      <Tool
        label="Enlace (Ctrl/⌘ + K)"
        active={state.link}
        onClick={() => setLinkOpen(!linkOpen)}
      >
        <Link2 />
      </Tool>
      <Tool label="Insertar imagen" onClick={onPickImage}>
        <ImagePlus />
      </Tool>
      <Separator />
      <Tool
        label="Lista"
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List />
      </Tool>
      <Tool
        label="Lista numerada"
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered />
      </Tool>
      <Tool
        label="Cita"
        active={state.quote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote />
      </Tool>
      <Separator />
      <Tool
        label="Quitar formato"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <RemoveFormatting />
      </Tool>
      {linkOpen ? (
        <LinkForm editor={editor} onClose={() => setLinkOpen(false)} />
      ) : null}
      <LinkShortcut editor={editor} onOpen={() => setLinkOpen(true)} />
    </div>
  );
}

/** Ctrl/⌘ + K opens the link form, as in Gmail. */
function LinkShortcut({
  editor,
  onOpen,
}: {
  editor: Editor;
  onOpen: () => void;
}) {
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor, onOpen]);
  return null;
}

function LinkForm({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const current =
    (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);

  const apply = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const url = /^(https?:|mailto:)/i.test(value)
        ? value
        : value.includes("@") && !value.includes("/")
          ? `mailto:${value}`
          : `https://${value}`;
      if (editor.state.selection.empty && !editor.isActive("link")) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "text",
            text: value,
            marks: [{ type: "link", attrs: { href: url } }],
          })
          .run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href: url })
          .run();
      }
    }
    onClose();
  };

  return (
    <div className="absolute left-2 top-full z-30 mt-1 flex w-80 items-center gap-2 rounded-lg border bg-popover p-2 shadow-lg">
      <input
        autoFocus
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
        placeholder="https://… o una dirección de mail"
        aria-label="Dirección del enlace"
        className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      />
      <button
        type="button"
        onClick={apply}
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
      >
        Aplicar
      </button>
      {current ? (
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
          className="text-xs text-muted-foreground hover:text-destructive"
        >
          Quitar
        </button>
      ) : null}
    </div>
  );
}

function Tool({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Separator = () => (
  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
);
