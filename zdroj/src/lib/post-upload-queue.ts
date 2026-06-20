import { API_BASE_URL } from '@/lib/api';

export type PostUploadStatus =
  | 'QUEUED'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED';

export type PostUploadJobPayload = {
  title: string;
  description: string;
  price: number | null;
  city: string;
  type: 'post' | 'short';
  category?: string;
  latitude?: number;
  longitude?: number;
  soundTrackId?: string;
  imageOrder: string[];
  hasVideo: boolean;
  hasImage: boolean;
};

export type PostUploadJob = {
  id: string;
  status: PostUploadStatus;
  progress: number;
  error?: string;
  postId?: string;
  createdAt: number;
  updatedAt: number;
  accessToken: string;
  payload: PostUploadJobPayload;
  videoBlobKey?: string;
  imageBlobKey?: string;
};

type Listener = (jobs: PostUploadJob[]) => void;

const DB_NAME = 'xxrealit-post-upload';
const DB_VERSION = 1;
const JOBS_STORE = 'jobs';
const BLOBS_STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;
let processing = false;
const listeners = new Set<Listener>();

function postsApiBase(): string {
  if (!API_BASE_URL) return '';
  return API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(JOBS_STORE)) {
        db.createObjectStore(JOBS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BLOBS_STORE)) {
        db.createObjectStore(BLOBS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

async function idbGetAllJobs(): Promise<PostUploadJob[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(JOBS_STORE, 'readonly');
    const req = tx.objectStore(JOBS_STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as PostUploadJob[]).sort((a, b) => a.createdAt - b.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbPutJob(job: PostUploadJob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(JOBS_STORE, 'readwrite');
    tx.objectStore(JOBS_STORE).put(job);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteJob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([JOBS_STORE, BLOBS_STORE], 'readwrite');
    tx.objectStore(JOBS_STORE).delete(id);
    tx.objectStore(BLOBS_STORE).delete(`${id}:video`);
    tx.objectStore(BLOBS_STORE).delete(`${id}:image`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOBS_STORE, 'readwrite');
    tx.objectStore(BLOBS_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOBS_STORE, 'readonly');
    const req = tx.objectStore(BLOBS_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function notifyListeners(jobs: PostUploadJob[]) {
  for (const fn of listeners) fn(jobs);
}

async function emitJobs() {
  const jobs = await idbGetAllJobs();
  notifyListeners(jobs);
  return jobs;
}

async function updateJob(
  id: string,
  patch: Partial<Pick<PostUploadJob, 'status' | 'progress' | 'error' | 'postId'>>,
): Promise<PostUploadJob | null> {
  const jobs = await idbGetAllJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  const next: PostUploadJob = {
    ...job,
    ...patch,
    updatedAt: Date.now(),
  };
  await idbPutJob(next);
  await emitJobs();
  return next;
}

function newJobId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function subscribePostUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  void emitJobs().then((jobs) => listener(jobs));
  return () => listeners.delete(listener);
}

export async function getPostUploadJobs(): Promise<PostUploadJob[]> {
  return idbGetAllJobs();
}

export async function enqueuePostUpload(input: {
  accessToken: string;
  payload: PostUploadJobPayload;
  videoFile?: File | null;
  imageFile?: File | null;
}): Promise<PostUploadJob> {
  const id = newJobId();
  const now = Date.now();
  const job: PostUploadJob = {
    id,
    status: 'QUEUED',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    accessToken: input.accessToken,
    payload: input.payload,
    videoBlobKey: input.videoFile ? `${id}:video` : undefined,
    imageBlobKey: input.imageFile ? `${id}:image` : undefined,
  };
  if (input.videoFile && job.videoBlobKey) {
    await idbPutBlob(job.videoBlobKey, input.videoFile);
  }
  if (input.imageFile && job.imageBlobKey) {
    await idbPutBlob(job.imageBlobKey, input.imageFile);
  }
  await idbPutJob(job);
  await emitJobs();
  void processPostUploadQueue();
  return job;
}

function buildFormData(job: PostUploadJob, video: File | null, image: File | null): FormData {
  const fd = new FormData();
  const p = job.payload;
  fd.append('title', p.title);
  fd.append('description', p.description);
  if (p.price != null && Number.isFinite(p.price) && p.price > 0) {
    fd.append('price', String(Math.trunc(p.price)));
  }
  fd.append('city', p.city);
  fd.append('type', p.type);
  if (p.category) fd.append('category', p.category);
  if (p.soundTrackId?.trim()) fd.append('soundTrackId', p.soundTrackId.trim());
  if (Number.isFinite(p.latitude)) fd.append('latitude', String(p.latitude));
  if (Number.isFinite(p.longitude)) fd.append('longitude', String(p.longitude));
  fd.append('imageOrder', JSON.stringify(p.imageOrder));
  if (video) fd.append('video', video);
  if (image) fd.append('images', image);
  return fd;
}

function uploadListingPostWithProgress(
  token: string,
  fd: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: true; postId: string } | { ok: false; error: string }> {
  const base = postsApiBase();
  if (!base || !token) {
    return Promise.resolve({ ok: false, error: 'API nebo token chybí' });
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/posts/listing`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable || ev.total <= 0) return;
      const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
      onProgress(pct);
    };

    xhr.onload = () => {
      let data: { post?: { id?: string }; message?: string | string[]; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText) as typeof data;
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.post?.id) {
        resolve({ ok: true, postId: data.post.id });
        return;
      }
      const msg =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : typeof data.error === 'string'
              ? data.error
              : `HTTP ${xhr.status}`;
      resolve({ ok: false, error: msg });
    };

    xhr.onerror = () => resolve({ ok: false, error: 'Síťová chyba při nahrávání' });
    xhr.onabort = () => resolve({ ok: false, error: 'Nahrávání bylo přerušeno' });
    xhr.send(fd);
  });
}

async function processJob(job: PostUploadJob): Promise<void> {
  await updateJob(job.id, { status: 'UPLOADING', progress: 0, error: undefined });

  const videoBlob = job.videoBlobKey ? await idbGetBlob(job.videoBlobKey) : null;
  const imageBlob = job.imageBlobKey ? await idbGetBlob(job.imageBlobKey) : null;
  const video =
    videoBlob != null
      ? new File([videoBlob], 'upload-video', { type: videoBlob.type || 'video/mp4' })
      : null;
  const image =
    imageBlob != null
      ? new File([imageBlob], 'upload-image', { type: imageBlob.type || 'image/jpeg' })
      : null;

  const fd = buildFormData(job, video, image);

  const result = await uploadListingPostWithProgress(
    job.accessToken,
    fd,
    (pct) => {
      void updateJob(job.id, { status: 'UPLOADING', progress: pct });
    },
  );

  if (!result.ok) {
    await updateJob(job.id, { status: 'FAILED', progress: 0, error: result.error });
    return;
  }

  await updateJob(job.id, {
    status: 'PROCESSING',
    progress: 100,
  });

  await updateJob(job.id, {
    status: 'PUBLISHED',
    progress: 100,
    postId: result.postId,
  });

  window.dispatchEvent(
    new CustomEvent('xxrealit:post-upload-published', { detail: { jobId: job.id, postId: result.postId } }),
  );

  setTimeout(() => {
    void idbDeleteJob(job.id).then(() => emitJobs());
  }, 8000);
}

export async function processPostUploadQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const jobs = await idbGetAllJobs();
    const pending = jobs.filter((j) =>
      j.status === 'QUEUED' || j.status === 'UPLOADING' || j.status === 'PROCESSING',
    );
    for (const job of pending) {
      if (job.status === 'PROCESSING') {
        continue;
      }
      try {
        await processJob(job);
      } catch (err) {
        await updateJob(job.id, {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'Nahrání selhalo',
        });
      }
    }
  } finally {
    processing = false;
    const jobs = await idbGetAllJobs();
    if (jobs.some((j) => j.status === 'QUEUED')) {
      void processPostUploadQueue();
    }
  }
}

export function postUploadStatusLabel(job: PostUploadJob): string {
  if (job.status === 'FAILED') {
    return job.error ?? 'Nahrání selhalo';
  }
  if (job.status === 'PUBLISHED') {
    return 'Příspěvek byl publikován';
  }
  if (job.status === 'PROCESSING' || (job.status === 'UPLOADING' && job.progress >= 100)) {
    return 'Zpracovávám video…';
  }
  if (job.payload.hasVideo) {
    return `Nahrává se video… ${job.progress} %`;
  }
  if (job.status === 'UPLOADING') {
    return `Nahrávám… ${job.progress} %`;
  }
  return 'Čeká ve frontě…';
}
