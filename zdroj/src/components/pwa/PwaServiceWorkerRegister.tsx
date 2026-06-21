'use client';

import { useEffect, useState } from 'react';

let swReadyPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function getSwReady(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (!swReadyPromise) {
    swReadyPromise = navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg)
      .catch((err) => {
        console.warn('[pwa] service worker registration failed', err);
        return null;
      });
  }
  return swReadyPromise;
}

/** Registruje service worker pro web push (PWA). */
export function PwaServiceWorkerRegister() {
  const [, setReady] = useState(false);

  useEffect(() => {
    void getSwReady().then((reg) => setReady(Boolean(reg)));
  }, []);

  return null;
}

export async function isServiceWorkerRegistered(): Promise<boolean> {
  const reg = await getSwReady();
  return Boolean(reg?.active || reg?.installing || reg?.waiting);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export async function subscribeToWebPush(
  token: string,
  publicKey: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'Prohlížeč nepodporuje push notifikace.' };
  }

  const registration = await getSwReady();
  if (!registration) {
    return { ok: false, error: 'Service worker není registrován.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Oprávnění k notifikacím nebylo uděleno.' };
  }

  const ready = await navigator.serviceWorker.ready;
  const subscription = await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const json = subscription.toJSON();
  const endpoint = json.endpoint ?? '';
  const p256dh = json.keys?.p256dh ?? '';
  const auth = json.keys?.auth ?? '';
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, error: 'Nepodařilo se vytvořit push subscription.' };
  }

  const { nestPushSubscribe } = await import('@/lib/nest-client');
  return nestPushSubscribe(token, { endpoint, p256dh, auth });
}
