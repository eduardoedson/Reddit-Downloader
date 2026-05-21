export interface DownloadResult {
  ok: boolean;
  error?: string;
  filename: string;
}

export type DownloadSource = 'reddit';

export interface DownloadRequest {
  source?: DownloadSource;
  url: string;
  filename: string;
  saveAs?: boolean;
}

interface DownloadResponse {
  ok?: boolean;
  error?: string;
}

export function requestDownload(request: DownloadRequest): Promise<DownloadResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'social-download', ...request },
      (resp: DownloadResponse | undefined) => {
        if (!resp) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError?.message ?? 'no response from background',
            filename: request.filename,
          });
          return;
        }
        resolve({ ok: !!resp.ok, error: resp.error, filename: request.filename });
      },
    );
  });
}

export function downloadOne(
  url: string,
  filename: string,
  source?: DownloadSource,
): Promise<DownloadResult> {
  return requestDownload({ source, url, filename });
}

export async function downloadMany(files: DownloadRequest[]): Promise<DownloadResult[]> {
  return Promise.all(files.map((f) => requestDownload(f)));
}

