/** Zachytí snímek z videa (cca 1. s) jako data URL pro poster. */
export async function captureVideoPosterDataUrl(
  video: HTMLVideoElement,
  seekSeconds = 1,
): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) return null;

  const seekTo = () =>
    new Promise<void>((resolve, reject) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        resolve();
      };
      const onError = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        reject(new Error('video seek failed'));
      };
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      try {
        const target = Number.isFinite(video.duration)
          ? Math.min(Math.max(seekSeconds, 0), Math.max(video.duration - 0.1, 0))
          : seekSeconds;
        video.currentTime = target;
      } catch {
        reject(new Error('video seek failed'));
      }
    });

  try {
    if (video.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
          reject(new Error('video load failed'));
        };
        video.addEventListener('loadeddata', onLoaded);
        video.addEventListener('error', onError);
      });
    }
    await seekTo();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}

export async function captureFileVideoPoster(file: File, seekSeconds = 1): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    return await captureVideoPosterDataUrl(video, seekSeconds);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
