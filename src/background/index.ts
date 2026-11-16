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

    void resolveDownloadUrl(msg.url)
      .then((url) => {
        chrome.downloads.download(
          {
            url,
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
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not resolve media URL',
        });
      });
    return true;
  },
);

interface RedgifsAuthResponse {
  token?: string;
}

interface RedgifsGifResponse {
  gif?: {
    urls?: {
      hd?: string;
      sd?: string;
    };
  };
}

function getRedgifsId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();

    if (host !== 'redgifs.com' && !host.endsWith('.redgifs.com')) return null;

    const match = url.pathname.match(/^\/(?:watch|ifr)\/([a-z0-9_-]+)/i);

    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function resolveDownloadUrl(rawUrl: string): Promise<string> {
  const redgifsId = getRedgifsId(rawUrl);

  if (!redgifsId) return rawUrl;

  const authResponse = await fetch('https://api.redgifs.com/v2/auth/temporary');

  if (!authResponse.ok) throw new Error('RedGifs authentication failed');

  const auth = (await authResponse.json()) as RedgifsAuthResponse;

  if (!auth.token) throw new Error('RedGifs did not return an access token');

  const gifResponse = await fetch(
    `https://api.redgifs.com/v2/gifs/${encodeURIComponent(redgifsId)}`,
    {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    },
  );

  if (!gifResponse.ok) throw new Error('RedGifs video could not be resolved');

  const payload = (await gifResponse.json()) as RedgifsGifResponse;
  const mediaUrl = payload.gif?.urls?.hd || payload.gif?.urls?.sd;

  if (!mediaUrl) throw new Error('RedGifs did not return a downloadable video');

  return mediaUrl;
}

function sanitizeFilename(name: string): string {
  return name.replaceAll(/[\\/:*?"<>|]/g, '_').slice(0, 200);
}

function defaultFilename(source?: DownloadMessage['source']): string {
  if (source === 'reddit') return 'reddit-media.bin';
  return 'reddit-media.bin';
}

