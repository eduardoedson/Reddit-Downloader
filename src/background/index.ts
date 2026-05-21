interface DownloadMessage {
  type: 'social-download';
  source?: 'reddit';
  url: string;
  filename?: string;
  saveAs?: boolean;
}

chrome.runtime.onMessage.addListener(
  (msg: DownloadMessage, _sender, sendResponse: (resp: { ok: boolean; id?: number; error?: string }) => void) => {
    if (
      !msg ||
      msg.type !== 'social-download' ||
      !msg.url
    ) {
      return;
    }

    chrome.downloads.download(
      {
        url: msg.url,
        filename: sanitizeFilename(msg.filename ?? defaultFilename(msg.source)),
        saveAs: !!msg.saveAs,
      },
      (id) => {
        if (chrome.runtime.lastError || !id) {
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message });
        } else {
          sendResponse({ ok: true, id });
        }
      },
    );
    return true;
  },
);

function sanitizeFilename(name: string): string {
  return name.replaceAll(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

function defaultFilename(source?: DownloadMessage['source']): string {
  if (source === 'reddit') return 'reddit-media.bin';
  return 'reddit-media.bin';
}

