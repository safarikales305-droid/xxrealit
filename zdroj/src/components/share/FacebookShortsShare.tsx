'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestFacebookConnect,
  nestFacebookGetConfig,
  nestFacebookGetStatus,
  nestFacebookUploadVideo,
} from '@/lib/nest-client';
import { facebookLogin } from '@/lib/facebook-sdk';

const FACEBOOK_LINK_SHARE_NOTE =
  'Facebook nepovoluje přehrání videa přímo ze sdíleného odkazu. Pro video příspěvek je nutné propojit Facebook účet a video nahrát přímo na Facebook.';

const facebookSharerUrl = (url: string) =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

export type FacebookShortsShareProps = {
  listingUrl: string;
  title: string;
  city: string;
  price?: number | null;
  videoUrl: string | null;
  apiAccessToken: string | null;
};

function buildUploadDescription(title: string, city: string, price?: number | null): string {
  const lines = [title.trim()];
  if (price != null && price > 0) {
    lines.push(`${price.toLocaleString('cs-CZ')} Kč`);
  }
  if (city.trim()) {
    lines.push(city.trim());
  }
  return lines.join('\n');
}

export function FacebookShortsShare({
  listingUrl,
  title,
  city,
  price,
  videoUrl,
  apiAccessToken,
}: FacebookShortsShareProps) {
  const [fbConfigured, setFbConfigured] = useState<boolean | null>(null);
  const [fbAppId, setFbAppId] = useState<string | null>(null);
  const [fbConnected, setFbConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void nestFacebookGetConfig().then((cfg) => {
      setFbConfigured(cfg.configured);
      setFbAppId(cfg.appId);
    });
  }, []);

  useEffect(() => {
    if (!apiAccessToken) {
      setFbConnected(false);
      return;
    }
    void nestFacebookGetStatus(apiAccessToken).then((s) => {
      setFbConnected(s.connected);
    });
  }, [apiAccessToken]);

  const uploadToFacebook = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!videoUrl?.trim()) {
      setError('Video není k dispozici.');
      return;
    }
    if (!apiAccessToken) {
      setError('Pro nahrání videa se přihlaste do účtu XXrealit.');
      return;
    }
    if (!fbConfigured || !fbAppId) {
      setError(FACEBOOK_LINK_SHARE_NOTE);
      return;
    }

    setBusy(true);
    try {
      let connected = fbConnected;
      if (!connected) {
        const accessToken = await facebookLogin(fbAppId);
        const connectRes = await nestFacebookConnect(apiAccessToken, accessToken);
        if (!connectRes.ok) {
          setError(connectRes.error ?? 'Propojení Facebook účtu selhalo.');
          return;
        }
        connected = true;
        setFbConnected(true);
      }

      const description = buildUploadDescription(title, city, price);
      const uploadRes = await nestFacebookUploadVideo(apiAccessToken, {
        videoUrl: videoUrl.trim(),
        title: title.trim(),
        description,
        listingUrl,
      });
      if (!uploadRes.ok) {
        setError(uploadRes.error ?? 'Nahrání videa na Facebook selhalo.');
        return;
      }
      setMessage('Video bylo nahráno na Facebook jako nativní video příspěvek.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nahrání na Facebook selhalo.');
    } finally {
      setBusy(false);
    }
  }, [
    apiAccessToken,
    city,
    fbAppId,
    fbConfigured,
    fbConnected,
    listingUrl,
    price,
    title,
    videoUrl,
  ]);

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Sdílení na Facebooku</h2>
      <p className="text-xs leading-relaxed text-zinc-600">{FACEBOOK_LINK_SHARE_NOTE}</p>

      <div className="flex flex-wrap gap-2">
        <a
          href={facebookSharerUrl(listingUrl)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[#1877F2] bg-white px-4 py-2 text-sm font-semibold text-[#1877F2] hover:bg-blue-50"
        >
          Sdílet odkaz na Facebook
        </a>

        {videoUrl ? (
          <button
            type="button"
            disabled={busy || fbConfigured === false}
            onClick={() => void uploadToFacebook()}
            className="inline-flex items-center gap-2 rounded-full bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe5] disabled:opacity-60"
          >
            {busy ? 'Nahrávám na Facebook…' : 'Nahrát video na Facebook'}
          </button>
        ) : null}
      </div>

      {!videoUrl ? (
        <p className="text-xs text-zinc-500">Nahrání videa vyžaduje Shorts video u tohoto tipu.</p>
      ) : null}

      {fbConfigured === false ? (
        <p className="text-xs text-amber-800">{FACEBOOK_LINK_SHARE_NOTE}</p>
      ) : null}

      {!apiAccessToken && videoUrl ? (
        <p className="text-xs text-zinc-500">
          Pro nahrání videa na Facebook se přihlaste do účtu XXrealit.
        </p>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
