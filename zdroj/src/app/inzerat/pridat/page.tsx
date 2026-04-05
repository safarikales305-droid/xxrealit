'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PropertyType } from '@/lib/rental/mock-properties';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/50 focus:ring-2 focus:ring-[#ff6a00]/15';

export default function PridatInzeratPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<PropertyType>('byt');
  const [imageFake, setImageFake] = useState<File | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title,
      description,
      price,
      location,
      type,
      imageFileName: imageFake?.name ?? null,
      imageSize: imageFake?.size ?? null,
    };
    console.log('NOVÝ INZERÁT:', payload);
    router.push('/moje-inzeraty');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Podat inzerát</h1>
      <p className="mt-1 text-sm text-zinc-600">Vyplňte údaje o nabídce.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 max-w-xl space-y-5 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-md"
      >
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Název
          </label>
          <input
            id="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Popis
          </label>
          <textarea
            id="desc"
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="price" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Cena (Kč)
          </label>
          <input
            id="price"
            required
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="loc" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Lokalita
          </label>
          <input
            id="loc"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="typ" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Typ nemovitosti
          </label>
          <select
            id="typ"
            value={type}
            onChange={(e) => setType(e.target.value as PropertyType)}
            className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`}
          >
            <option value="byt">Byt</option>
            <option value="dum">Dům</option>
            <option value="pozemek">Pozemek</option>
          </select>
        </div>
        <div>
          <label htmlFor="img" className="mb-1.5 block text-sm font-medium text-zinc-700">
            Obrázek (ukázka výběru souboru)
          </label>
          <input
            id="img"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFake(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200"
          />
          {imageFake ? (
            <p className="mt-2 text-xs text-zinc-500">Vybráno: {imageFake.name} (fake upload)</p>
          ) : null}
        </div>
        <button
          type="submit"
          className="w-full rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
        >
          Uložit inzerát
        </button>
      </form>
    </div>
  );
}
