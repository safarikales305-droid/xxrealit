/** Module-level worker state — kept separate to avoid circular DI imports. */

let workerHeartbeat: Date | null = null;
let workerLastError: string | null = null;
let workerProcessing = false;
let workerPaused = false;

export function getNewsWorkerHeartbeat(): Date | null {
  return workerHeartbeat;
}

export function getNewsWorkerLastError(): string | null {
  return workerLastError;
}

export function isNewsWorkerProcessing(): boolean {
  return workerProcessing;
}

export function isNewsWorkerPaused(): boolean {
  return workerPaused;
}

export function setNewsWorkerHeartbeat(at: Date): void {
  workerHeartbeat = at;
}

export function setNewsWorkerLastError(error: string | null): void {
  workerLastError = error;
}

export function setNewsWorkerProcessing(processing: boolean): void {
  workerProcessing = processing;
}

export function setNewsWorkerPaused(paused: boolean): void {
  workerPaused = paused;
}
