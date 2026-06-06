declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (
        callback: (response: { authResponse?: { accessToken?: string }; status?: string }) => void,
        options?: { scope?: string; return_scopes?: boolean },
      ) => void;
      getLoginStatus: (
        callback: (response: { authResponse?: { accessToken?: string }; status?: string }) => void,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_ID = 'facebook-jssdk';
const FB_API_VERSION = 'v21.0';
const FB_VIDEO_SCOPES = 'public_profile,publish_video';

let sdkLoadPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Facebook SDK lze načíst jen v prohlížeči.'));
  }
  const trimmed = appId.trim();
  if (!trimmed) {
    return Promise.reject(new Error('Chybí Facebook App ID.'));
  }

  if (window.FB) {
    window.FB.init({ appId: trimmed, cookie: true, xfbml: false, version: FB_API_VERSION });
    return Promise.resolve();
  }

  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: trimmed, cookie: true, xfbml: false, version: FB_API_VERSION });
      resolve();
    };

    if (document.getElementById(FB_SDK_ID)) {
      const wait = () => {
        if (window.FB) {
          window.FB.init({ appId: trimmed, cookie: true, xfbml: false, version: FB_API_VERSION });
          resolve();
        } else {
          setTimeout(wait, 50);
        }
      };
      wait();
      return;
    }

    const script = document.createElement('script');
    script.id = FB_SDK_ID;
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/cs_CZ/sdk.js';
    script.onerror = () => reject(new Error('Nepodařilo se načíst Facebook SDK.'));
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export function facebookLogin(appId: string): Promise<string> {
  return loadFacebookSdk(appId).then(
    () =>
      new Promise<string>((resolve, reject) => {
        const fb = window.FB;
        if (!fb) {
          reject(new Error('Facebook SDK není k dispozici.'));
          return;
        }

        fb.login(
          (response) => {
            const token = response.authResponse?.accessToken?.trim();
            if (token) {
              resolve(token);
              return;
            }
            if (response.status === 'not_authorized') {
              reject(new Error('Facebook nepovolil požadovaná oprávnění.'));
              return;
            }
            reject(new Error('Přihlášení přes Facebook bylo zrušeno.'));
          },
          { scope: FB_VIDEO_SCOPES, return_scopes: true },
        );
      }),
  );
}
