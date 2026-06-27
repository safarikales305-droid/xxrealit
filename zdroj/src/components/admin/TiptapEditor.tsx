'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect } from 'react';

type Props = {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  minHeightClass?: string;
};

const btn =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:border-orange-300 hover:bg-orange-50';

export function TiptapEditor({ label, value, onChange, minHeightClass = 'min-h-[200px]' }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false }),
      Image,
      Youtube.configure({ width: 640, height: 360 }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight,
      Placeholder.configure({ placeholder: 'Začněte psát obsah sekce…' }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: `portal-terms-html prose prose-zinc max-w-none px-3 py-3 outline-none ${minHeightClass}`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />;
  }

  const addLink = () => {
    const url = window.prompt('URL odkazu');
    if (!url?.trim()) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addImage = () => {
    const url = window.prompt('URL obrázku');
    if (!url?.trim()) return;
    editor.chain().focus().setImage({ src: url.trim() }).run();
  };

  const addYoutube = () => {
    const url = window.prompt('YouTube URL');
    if (!url?.trim()) return;
    editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {label ? <p className="border-b border-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-800">{label}</p> : null}
      <div className="flex flex-wrap gap-1 border-b border-zinc-100 p-2">
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBold().run()}>
          Tučné
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Odrážky
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Číslování
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Citace
        </button>
        <button type="button" className={btn} onClick={addLink}>
          Odkaz
        </button>
        <button type="button" className={btn} onClick={addImage}>
          Obrázek
        </button>
        <button type="button" className={btn} onClick={addYoutube}>
          YouTube
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          Tabulka
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            const c = window.prompt('Barva (#hex)');
            if (c) editor.chain().focus().setColor(c).run();
          }}
        >
          Barva
        </button>
        <button type="button" className={btn} onClick={() => editor.chain().focus().toggleHighlight().run()}>
          Zvýraznit
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
