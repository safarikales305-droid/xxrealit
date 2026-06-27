'use client';

import { useCallback, useEffect, useRef } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (html: string) => void;
  minHeightClass?: string;
};

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function SimpleRichEditor({ label, value, onChange, minHeightClass = 'min-h-[180px]' }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value;
    }
  }, [value]);

  const emitChange = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? '';
    onChange(html);
  }, [onChange]);

  const addLink = () => {
    const url = window.prompt('URL odkazu (včetně https://)');
    if (!url?.trim()) return;
    exec('createLink', url.trim());
    emitChange();
  };

  const toolbarBtn =
    'rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:border-orange-300 hover:bg-orange-50';

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-800">{label}</span>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={toolbarBtn} onClick={() => { exec('bold'); emitChange(); }}>
            Tučné
          </button>
          <button
            type="button"
            className={toolbarBtn}
            onClick={() => {
              exec('formatBlock', 'h2');
              emitChange();
            }}
          >
            Nadpis
          </button>
          <button
            type="button"
            className={toolbarBtn}
            onClick={() => {
              exec('formatBlock', 'p');
              emitChange();
            }}
          >
            Odstavec
          </button>
          <button
            type="button"
            className={toolbarBtn}
            onClick={() => {
              exec('insertUnorderedList');
              emitChange();
            }}
          >
            Odrážky
          </button>
          <button type="button" className={toolbarBtn} onClick={addLink}>
            Odkaz
          </button>
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onBlur={emitChange}
        className={`portal-terms-html w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm text-zinc-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 ${minHeightClass}`}
      />
    </div>
  );
}
