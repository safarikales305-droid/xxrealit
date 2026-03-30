'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { propertiesEndpoint } from '@/lib/api';

type FormState = {
  title: string;
  price: string;
  videoUrl: string;
};

export function CreatePropertyForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    title: '',
    price: '',
    videoUrl: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setError(null);
    };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const priceNum = Number(form.price);
    if (form.title.trim() === '' || !Number.isInteger(priceNum) || priceNum < 0) {
      setError('Please enter a valid title and a non-negative integer price.');
      return;
    }
    if (form.videoUrl.trim() === '') {
      setError('Video URL is required.');
      return;
    }

    if (!propertiesEndpoint) {
      setError(
        'Chybí NEXT_PUBLIC_API_URL — nelze odeslat data na backend.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(propertiesEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          price: priceNum,
          videoUrl: form.videoUrl.trim(),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `Request failed (${res.status})`;
        try {
          const json = JSON.parse(text) as { message?: string | string[] };
          if (Array.isArray(json.message)) message = json.message.join(', ');
          else if (typeof json.message === 'string') message = json.message;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.08)]"
    >
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium text-zinc-800">
          Název
        </label>
        <input
          id="title"
          name="title"
          type="text"
          autoComplete="off"
          value={form.title}
          onChange={update('title')}
          className={inputClass}
          placeholder="e.g. Bright loft with city views"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="price" className="text-sm font-medium text-zinc-800">
          Cena (Kč)
        </label>
        <input
          id="price"
          name="price"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={form.price}
          onChange={update('price')}
          className={inputClass}
          placeholder="0"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="videoUrl" className="text-sm font-medium text-zinc-800">
          URL videa
        </label>
        <input
          id="videoUrl"
          name="videoUrl"
          type="url"
          inputMode="url"
          value={form.videoUrl}
          onChange={update('videoUrl')}
          className={inputClass}
          placeholder="https://…"
          disabled={isSubmitting}
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3.5 text-center text-sm font-semibold text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition hover:shadow-[0_10px_32px_-6px_rgba(255,90,0,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Ukládám…' : 'Publikovat'}
      </button>
    </form>
  );
}
