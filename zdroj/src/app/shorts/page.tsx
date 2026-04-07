'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  ShortVideo,
  nestCreateVideoPost,
  nestFetchVideos,
} from '@/lib/nest-client';

export default function ShortsPage() {
  const { isAuthenticated, apiAccessToken } = useAuth();
  const [videos, setVideos] = useState<ShortVideo[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadFeed() {
    setLoadingFeed(true);
    const list = await nestFetchVideos();
    setVideos(list);
    setLoadingFeed(false);
  }

  useEffect(() => {
    void loadFeed();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!isAuthenticated || !apiAccessToken) {
      setError('Pro upload videa se musíte přihlásit.');
      return;
    }
    if (!selectedFile) {
      setError('Vyberte video soubor.');
      return;
    }
    if (!selectedFile.type.startsWith('video/')) {
      setError('Povolené jsou pouze video soubory.');
      return;
    }
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('Maximální velikost videa je 50MB.');
      return;
    }

    setUploading(true);
    const create = await nestCreateVideoPost(
      apiAccessToken,
      selectedFile,
      description.trim(),
    );
    if (!create.ok) {
      setUploading(false);
      setError(create.error || 'Uložení videa selhalo.');
      return;
    }

    setSelectedFile(null);
    setDescription('');
    setMessage('Video přidáno');
    await loadFeed();
    setUploading(false);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Video Shorts</h1>

      <form
        onSubmit={handleUpload}
        className="mb-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-3">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <textarea
          className="mb-3 min-h-24 w-full rounded border border-gray-300 p-2"
          placeholder="Popis videa..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button
          type="submit"
          disabled={uploading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {uploading ? 'Nahrávání...' : 'Nahrát'}
        </button>

        {uploading && (
          <div className="mt-3 text-sm text-gray-600">Načítání...</div>
        )}
        {message && <div className="mt-3 text-sm text-green-700">{message}</div>}
        {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
      </form>

      <section className="space-y-6">
        {loadingFeed ? (
          <div className="text-sm text-gray-600">Načítám feed...</div>
        ) : videos.length === 0 ? (
          <div className="text-sm text-gray-600">Zatím žádná videa.</div>
        ) : (
          videos.map((video) => (
            <article
              key={video.id}
              className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
            >
              <video
                muted
                playsInline
                autoPlay
                loop
                controls
                preload="metadata"
                className="w-full h-full object-cover aspect-[9/16] rounded"
                onError={(e) => console.log('VIDEO ERROR', e)}
                onLoadedData={() => console.log('VIDEO LOADED')}
              >
                <source
                  src={nestAbsoluteAssetUrl(video.videoUrl ?? video.url ?? '')}
                  type="video/mp4"
                />
              </video>
              {video.description || video.content ? (
                <p className="mt-2 text-sm text-gray-800">
                  {video.description ?? video.content}
                </p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
