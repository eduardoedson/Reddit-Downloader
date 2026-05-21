import { requestDownload } from '../shared/download';

const POST_SELECTOR =
  'shreddit-post, article[data-testid="post-container"], div[data-testid="post-container"], article';

let redditModuleStarted = false;

interface RedditMediaItem {
  url: string;
  type: 'video' | 'photo';
}

interface RedditPostMedia {
  postId: string;
  author: string;
  media: RedditMediaItem[];
}

interface RedditListingResponse {
  data?: {
    children?: Array<{
      data?: RedditPostJson;
    }>;
  };
}

interface RedditPostJson {
  id?: string;
  author?: string;
  url?: string;
  permalink?: string;
  is_video?: boolean;
  post_hint?: string;
  media?: RedditMediaJson | null;
  secure_media?: RedditMediaJson | null;
  preview?: RedditPreviewJson | null;
  gallery_data?: {
    items?: Array<{
      media_id?: string;
      id?: number;
    }>;
  };
  media_metadata?: Record<string, RedditMediaMetadataJson>;
}

interface RedditMediaJson {
  reddit_video?: {
    fallback_url?: string;
    dash_url?: string;
    hls_url?: string;
    scrubber_media_url?: string;
  };
}

interface RedditPreviewJson {
  images?: Array<{
    source?: {
      url?: string;
      width?: number;
      height?: number;
    };
    resolutions?: Array<{
      url?: string;
      width?: number;
      height?: number;
    }>;
  }>;
  reddit_video_preview?: {
    fallback_url?: string;
    dash_url?: string;
    hls_url?: string;
    scrubber_media_url?: string;
  };
}

interface RedditMediaMetadataJson {
  status?: string;
  e?: string;
  m?: string;
  s?: {
    u?: string;
    gif?: string;
    mp4?: string;
    x?: number;
    y?: number;
  };
  p?: Array<{
    u?: string;
    x?: number;
    y?: number;
  }>;
}

const TEXT_DOWNLOAD = 'Download';
const TEXT_LOADING = 'Loading...';
const TEXT_DOWNLOADED = 'Downloaded';

function decodeHtmlUrl(rawUrl: string): string {
  const textarea = document.createElement('textarea');

  textarea.innerHTML = rawUrl;

  return textarea.value.replace(/&amp;/g, '&');
}

function normalizeMediaUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;

  const decoded = decodeHtmlUrl(rawUrl.trim());

  if (!decoded || decoded.startsWith('blob:') || decoded.startsWith('data:')) return null;

  try {
    return new URL(decoded, window.location.origin).toString();
  } catch {
    return null;
  }
}

function isMediaHost(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();

    return (
      host === 'i.redd.it' ||
      host === 'v.redd.it' ||
      host.endsWith('.redd.it') ||
      host.endsWith('redd.it') ||
      host.endsWith('redditmedia.com') ||
      host.endsWith('reddituploads.com')
    );
  } catch {
    return false;
  }
}

function isLikelyPhotoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();

    return (
      /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(path) ||
      url.hostname.toLowerCase().includes('redd.it') ||
      url.hostname.toLowerCase().includes('redditmedia.com')
    );
  } catch {
    return false;
  }
}

function isLikelyVideoUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.toLowerCase();

    return /\.(mp4|webm|m3u8|mpd)(\?|$)/i.test(path) || url.hostname.toLowerCase() === 'v.redd.it';
  } catch {
    return false;
  }
}

function addMediaItem(
  media: Map<string, RedditMediaItem>,
  rawUrl: string | null | undefined,
  type: 'video' | 'photo',
): void {
  if (!rawUrl) return;

  const url = normalizeMediaUrl(rawUrl);

  if (!url || !isMediaHost(url)) return;

  if (!media.has(url)) {
    media.set(url, {
      url,
      type,
    });
  }
}

function extractUrlsFromSrcset(srcset: string | null | undefined): string[] {
  if (!srcset) return [];

  return srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .map((url) => normalizeMediaUrl(url))
    .filter((url): url is string => !!url);
}

function getMediaRoot(post: HTMLElement): HTMLElement {
  const selectors = [
    '[slot="post-media-container"]',
    '[data-testid="post-image"]',
    '[data-testid="post-video"]',
    'shreddit-player',
    'gallery-carousel',
    'media-telemetry-observer',
    'figure',
  ];

  for (const selector of selectors) {
    const root = post.querySelector<HTMLElement>(selector);

    if (root) return root;
  }

  return post;
}

function getPostId(post: HTMLElement): string | null {
  const thingId = post.getAttribute('thingid') || post.getAttribute('thing-id');

  if (thingId) {
    const thingIdMatch = thingId.match(/t3_([a-z0-9]+)/i);

    if (thingIdMatch) return thingIdMatch[1];

    if (/^[a-z0-9]+$/i.test(thingId)) return thingId;
  }

  const links = post.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]');

  for (const link of Array.from(links)) {
    const match = link.getAttribute('href')?.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i);

    if (match) return match[1];
  }

  const permalink =
    post.getAttribute('permalink') ||
    post.getAttribute('data-permalink') ||
    post.getAttribute('content-href');

  const permalinkMatch = permalink?.match(/\/comments\/([a-z0-9]+)(?:\/|$)/i);

  if (permalinkMatch) return permalinkMatch[1];

  const id = post.getAttribute('id');
  const idMatch = id?.match(/t3_([a-z0-9]+)/i);

  if (idMatch) return idMatch[1];

  return null;
}

function getPermalink(post: HTMLElement): string | null {
  const direct =
    post.getAttribute('permalink') ||
    post.getAttribute('data-permalink') ||
    post.getAttribute('content-href');

  if (direct && direct.includes('/comments/')) {
    return new URL(direct, window.location.origin).toString();
  }

  const links = post.querySelectorAll<HTMLAnchorElement>('a[href*="/comments/"]');

  for (const link of Array.from(links)) {
    const href = link.getAttribute('href');

    if (href) return new URL(href, window.location.origin).toString();
  }

  const postId = getPostId(post);

  if (postId) return `https://www.reddit.com/comments/${postId}/`;

  return null;
}

function getAuthor(post: HTMLElement): string {
  const directAuthor =
    post.getAttribute('author') ||
    post.getAttribute('data-author') ||
    post.getAttribute('author-name');

  if (directAuthor) return directAuthor.replace(/^u\//i, '');

  const links = post.querySelectorAll<HTMLAnchorElement>('a[href*="/user/"], a[href*="/u/"]');

  for (const link of Array.from(links)) {
    const href = link.getAttribute('href') || '';
    const match = href.match(/\/(?:user|u)\/([^/?#]+)/i);

    if (match) return decodeURIComponent(match[1]);
  }

  return 'reddit';
}

function collectPostMediaFromDom(post: HTMLElement): RedditPostMedia | null {
  const postId = getPostId(post);

  if (!postId) return null;

  const root = getMediaRoot(post);
  const media = new Map<string, RedditMediaItem>();

  const videos = root.querySelectorAll<HTMLVideoElement>('video');

  for (const video of Array.from(videos)) {
    const candidates = [
      video.currentSrc,
      video.src,
      video.getAttribute('src'),
      video.getAttribute('data-src'),
    ];

    const sourceTags = video.querySelectorAll<HTMLSourceElement>('source[src]');

    for (const source of Array.from(sourceTags)) {
      candidates.push(source.src);
      candidates.push(source.getAttribute('src'));
    }

    for (const candidate of candidates) {
      const url = normalizeMediaUrl(candidate || '');

      if (!url || !isMediaHost(url)) continue;

      if (isLikelyVideoUrl(url)) {
        addMediaItem(media, url, 'video');
        break;
      }
    }
  }

  const videoLikeElements = root.querySelectorAll<HTMLElement>(
    'shreddit-player, shreddit-async-loader, media-telemetry-observer, source',
  );

  for (const element of Array.from(videoLikeElements)) {
    const candidates = [
      element.getAttribute('src'),
      element.getAttribute('data-src'),
      element.getAttribute('source'),
      element.getAttribute('url'),
      element.getAttribute('fallback-url'),
      element.getAttribute('data-url'),
    ];

    for (const candidate of candidates) {
      const url = normalizeMediaUrl(candidate || '');

      if (!url || !isMediaHost(url)) continue;

      if (isLikelyVideoUrl(url)) {
        addMediaItem(media, url, 'video');
      }
    }
  }

  const videosFound = Array.from(media.values()).filter((item) => item.type === 'video');

  if (videosFound.length > 0) {
    return {
      postId,
      author: getAuthor(post),
      media: videosFound,
    };
  }

  const images = root.querySelectorAll<HTMLImageElement>('img');

  for (const image of Array.from(images)) {
    const candidates = [
      image.currentSrc,
      image.src,
      image.getAttribute('src'),
      image.getAttribute('data-src'),
      image.getAttribute('data-lazy-src'),
      image.getAttribute('loading-src'),
      ...extractUrlsFromSrcset(image.srcset),
      ...extractUrlsFromSrcset(image.getAttribute('srcset')),
    ];

    const validCandidates = candidates
      .map((candidate) => normalizeMediaUrl(candidate || ''))
      .filter((candidate): candidate is string => {
        return !!candidate && isMediaHost(candidate) && isLikelyPhotoUrl(candidate);
      });

    const bestCandidate = validCandidates[validCandidates.length - 1] || validCandidates[0];

    if (bestCandidate) {
      addMediaItem(media, bestCandidate, 'photo');
    }
  }

  const links = root.querySelectorAll<HTMLAnchorElement>('a[href]');

  for (const link of Array.from(links)) {
    const url = normalizeMediaUrl(link.href);

    if (!url || !isMediaHost(url)) continue;

    if (isLikelyVideoUrl(url)) {
      addMediaItem(media, url, 'video');
      continue;
    }

    if (isLikelyPhotoUrl(url)) {
      addMediaItem(media, url, 'photo');
    }
  }

  const items = Array.from(media.values());
  const finalVideos = items.filter((item) => item.type === 'video');

  if (finalVideos.length > 0) {
    return {
      postId,
      author: getAuthor(post),
      media: finalVideos,
    };
  }

  const finalPhotos = items.filter((item) => item.type === 'photo');

  if (finalPhotos.length === 0) return null;

  return {
    postId,
    author: getAuthor(post),
    media: finalPhotos,
  };
}

function getBestPreviewImage(preview: RedditPreviewJson | null | undefined): string | null {
  const image = preview?.images?.[0];

  if (!image) return null;

  const resolutions = image.resolutions || [];
  const largestResolution = resolutions[resolutions.length - 1];

  return largestResolution?.url || image.source?.url || null;
}

function getGalleryImageUrl(metadata: RedditMediaMetadataJson | undefined): string | null {
  if (!metadata) return null;

  if (metadata.s?.mp4) return metadata.s.mp4;
  if (metadata.s?.gif) return metadata.s.gif;
  if (metadata.s?.u) return metadata.s.u;

  const previews = metadata.p || [];
  const largestPreview = previews[previews.length - 1];

  return largestPreview?.u || null;
}

function collectMediaFromPostJson(json: RedditPostJson): RedditMediaItem[] {
  const media = new Map<string, RedditMediaItem>();

  addMediaItem(media, json.media?.reddit_video?.fallback_url, 'video');
  addMediaItem(media, json.secure_media?.reddit_video?.fallback_url, 'video');
  addMediaItem(media, json.preview?.reddit_video_preview?.fallback_url, 'video');

  if (json.url && isMediaHost(json.url) && (json.is_video || isLikelyVideoUrl(json.url))) {
    addMediaItem(media, json.url, 'video');
  }

  const videos = Array.from(media.values()).filter((item) => item.type === 'video');

  if (videos.length > 0) {
    return videos;
  }

  if (json.gallery_data?.items?.length && json.media_metadata) {
    for (const item of json.gallery_data.items) {
      if (!item.media_id) continue;

      const metadata = json.media_metadata[item.media_id];
      const galleryUrl = getGalleryImageUrl(metadata);

      if (!galleryUrl) continue;

      const type = metadata?.e === 'AnimatedImage' || metadata?.s?.mp4 ? 'video' : 'photo';

      addMediaItem(media, galleryUrl, type);
    }
  }

  const galleryItems = Array.from(media.values());
  const galleryVideos = galleryItems.filter((item) => item.type === 'video');

  if (galleryVideos.length > 0) {
    return galleryVideos;
  }

  if (json.url && isMediaHost(json.url) && isLikelyPhotoUrl(json.url)) {
    addMediaItem(media, json.url, 'photo');
  }

  const hasAnyMedia = Array.from(media.values()).length > 0;

  if (!hasAnyMedia) {
    addMediaItem(media, getBestPreviewImage(json.preview), 'photo');
  }

  const finalItems = Array.from(media.values());
  const finalVideos = finalItems.filter((item) => item.type === 'video');

  if (finalVideos.length > 0) {
    return finalVideos;
  }

  return finalItems.filter((item) => item.type === 'photo');
}

async function fetchPostJsonMedia(post: HTMLElement): Promise<RedditPostMedia | null> {
  const permalink = getPermalink(post);
  const postId = getPostId(post);

  if (!permalink || !postId) return null;

  const jsonUrl = new URL(permalink, window.location.origin);

  jsonUrl.pathname = jsonUrl.pathname.replace(/\/?$/, '.json');
  jsonUrl.search = '';

  try {
    const response = await fetch(jsonUrl.toString(), {
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;

    const listing = Array.isArray(payload)
      ? (payload[0] as RedditListingResponse | undefined)
      : (payload as RedditListingResponse | undefined);

    const postJson = listing?.data?.children?.[0]?.data;

    if (!postJson) return null;

    const items = collectMediaFromPostJson(postJson);

    if (items.length === 0) return null;

    const videos = items.filter((item) => item.type === 'video');

    return {
      postId: postJson.id || postId,
      author: postJson.author || getAuthor(post),
      media: videos.length > 0 ? videos : items,
    };
  } catch {
    return null;
  }
}

async function collectPostMedia(post: HTMLElement): Promise<RedditPostMedia | null> {
  const jsonMedia = await fetchPostJsonMedia(post);

  if (jsonMedia && jsonMedia.media.length > 0) {
    const videos = jsonMedia.media.filter((item) => item.type === 'video');

    if (videos.length > 0) {
      return {
        ...jsonMedia,
        media: videos,
      };
    }

    return jsonMedia;
  }

  const domMedia = collectPostMediaFromDom(post);

  if (!domMedia || domMedia.media.length === 0) return domMedia;

  const videos = domMedia.media.filter((item) => item.type === 'video');

  if (videos.length > 0) {
    return {
      ...domMedia,
      media: videos,
    };
  }

  return domMedia;
}

function findActionBar(post: HTMLElement): HTMLElement | null {
  const selectors = [
    'shreddit-post-action-row',
    '[slot="actionRow"]',
    '[slot="action-row"]',
    '[slot="footer"]',
    '[data-testid="post-action-bar"]',
    '[data-testid="post-footer"]',
    '.flat-list.buttons',
  ];

  for (const selector of selectors) {
    const found = post.querySelector<HTMLElement>(selector);

    if (found) return found;
  }

  const buttons = Array.from(post.querySelectorAll<HTMLElement>('button, a'));

  const actionButton = buttons.find((element) => {
    const text = [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      text.includes('comment') ||
      text.includes('comments') ||
      text.includes('coment') ||
      text.includes('share') ||
      text.includes('compartilhar') ||
      text.includes('save') ||
      text.includes('salvar') ||
      text.includes('upvote') ||
      text.includes('downvote')
    );
  });

  if (!actionButton) return null;

  const actionRow =
    actionButton.closest<HTMLElement>('shreddit-post-action-row') ||
    actionButton.closest<HTMLElement>('[slot="actionRow"]') ||
    actionButton.closest<HTMLElement>('[slot="action-row"]') ||
    actionButton.closest<HTMLElement>('[data-testid="post-action-bar"]') ||
    actionButton.closest<HTMLElement>('[data-testid="post-footer"]');

  if (actionRow) return actionRow;

  if (actionButton.parentElement) return actionButton.parentElement;

  return null;
}

function findMoreButton(actionBar: HTMLElement): HTMLElement | null {
  const elements = Array.from(actionBar.querySelectorAll<HTMLElement>('button, a'));

  return (
    elements.find((element) => {
      const label = [
        element.textContent,
        element.getAttribute('aria-label'),
        element.getAttribute('title'),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return (
        label.includes('more') ||
        label.includes('mais') ||
        label.includes('overflow') ||
        label.includes('options') ||
        label.includes('opções') ||
        label.includes('opcoes')
      );
    }) || null
  );
}

function getDirectActionChild(actionBar: HTMLElement, element: HTMLElement): HTMLElement {
  let current: HTMLElement = element;

  while (current.parentElement && current.parentElement !== actionBar) {
    current = current.parentElement;
  }

  return current;
}

function setState(btn: HTMLButtonElement, state: 'idle' | 'loading' | 'ok' | 'error') {
  btn.classList.remove('rdt-btn--loading', 'rdt-btn--ok', 'rdt-btn--error');
  btn.disabled = state === 'loading';

  if (state === 'loading') {
    btn.classList.add('rdt-btn--loading');
    btn.textContent = TEXT_LOADING;
    return;
  }

  if (state === 'ok') {
    btn.classList.add('rdt-btn--ok');
    btn.textContent = TEXT_DOWNLOADED;
    return;
  }

  if (state === 'error') {
    btn.classList.add('rdt-btn--error');
    btn.textContent = TEXT_DOWNLOAD;
    return;
  }

  btn.textContent = TEXT_DOWNLOAD;
}

async function waitForMedia(post: HTMLElement, timeoutMs = 3500): Promise<RedditPostMedia | null> {
  const start = performance.now();

  while (performance.now() - start < timeoutMs) {
    const found = await collectPostMedia(post);

    if (found && found.media.length > 0) return found;

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return collectPostMedia(post);
}

function getExtensionFromUrl(item: RedditMediaItem): string {
  try {
    const url = new URL(item.url);
    const path = url.pathname.toLowerCase();
    const pathMatch = path.match(/\.([a-z0-9]+)$/i);

    if (pathMatch?.[1]) {
      const ext = pathMatch[1].toLowerCase();

      if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' || ext === 'gif') {
        return ext;
      }

      if (ext === 'mp4' || ext === 'webm') {
        return ext;
      }
    }
  } catch {
    return item.type === 'video' ? 'mp4' : 'jpg';
  }

  return item.type === 'video' ? 'mp4' : 'jpg';
}

function filenameFor(
  author: string,
  postId: string,
  item: RedditMediaItem,
  index: number,
  total: number,
): string {
  const safeAuthor = author.replace(/[^a-z0-9_-]/gi, '_');
  const safePostId = postId.replace(/[^a-z0-9_-]/gi, '_');
  const base = `${safeAuthor || 'reddit'}-${safePostId}`;
  const suffix = total > 1 ? `-${index + 1}` : '';
  const ext = getExtensionFromUrl(item);

  return `${base}${suffix}.${ext}`;
}

function createButton(post: HTMLElement): HTMLButtonElement {
  const btn = document.createElement('button');

  btn.type = 'button';
  btn.className = 'rdt-btn';
  btn.setAttribute('aria-label', 'Download media');
  btn.title = 'Download media';

  setState(btn, 'idle');

  btn.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (btn.disabled) return;

    setState(btn, 'loading');

    const media = await waitForMedia(post);

    if (!media || media.media.length === 0) {
      setState(btn, 'error');
      alert('Reddit Downloader\n\nNo downloadable media found for this post.');
      window.setTimeout(() => {
        setState(btn, 'idle');
      }, 1800);
      return;
    }

    const downloadableMedia = media.media.some((item) => item.type === 'video')
      ? media.media.filter((item) => item.type === 'video')
      : media.media;

    const total = downloadableMedia.length;

    const results = await Promise.all(
      downloadableMedia.map((item, idx) =>
        requestDownload({
          source: 'reddit',
          url: item.url,
          filename: filenameFor(media.author, media.postId, item, idx, total),
        }),
      ),
    );

    const failures = results.filter((result: { ok: any; }) => !result.ok);

    if (failures.length === 0) {
      setState(btn, 'ok');

      window.setTimeout(() => {
        setState(btn, 'idle');
      }, 1600);

      return;
    }

    setState(btn, 'error');

    alert(
      `Reddit Downloader\n\n${failures.length} of ${total} download(s) failed.\n` +
        'Try opening the post page and trying again.',
    );

    window.setTimeout(() => {
      setState(btn, 'idle');
    }, 1800);
  });

  return btn;
}

function getOrCreateBottomBar(post: HTMLElement): HTMLElement {
  const existing = post.querySelector<HTMLElement>(':scope > .rdt-bottom-bar');

  if (existing) return existing;

  const bottomBar = document.createElement('div');

  bottomBar.className = 'rdt-bottom-bar';
  post.appendChild(bottomBar);

  return bottomBar;
}

function insertIntoActionBar(actionBar: HTMLElement, wrap: HTMLElement): boolean {
  const moreButton = findMoreButton(actionBar);

  if (moreButton) {
    const directChild = getDirectActionChild(actionBar, moreButton);

    actionBar.insertBefore(wrap, directChild);
    return true;
  }

  actionBar.appendChild(wrap);
  return true;
}

function injectButton(post: HTMLElement) {
  const ancestorPost = post.parentElement?.closest<HTMLElement>(POST_SELECTOR);

  if (ancestorPost?.querySelector('[data-rdt-injected="1"]')) return;
  if (post.dataset.rdtInjected === '1') return;
  if (post.querySelector('[data-rdt-injected="1"]')) return;

  post.dataset.rdtInjected = '1';

  const wrap = document.createElement('div');

  wrap.className = 'rdt-btn-wrap';
  wrap.dataset.rdtInjected = '1';

  const btn = createButton(post);

  wrap.appendChild(btn);

  const actionBar = findActionBar(post);

  if (actionBar) {
    const inserted = insertIntoActionBar(actionBar, wrap);

    if (inserted) return;
  }

  const bottomBar = getOrCreateBottomBar(post);

  bottomBar.appendChild(wrap);
}

function normalizePost(candidate: HTMLElement): HTMLElement | null {
  if (candidate.matches('shreddit-post')) return candidate;

  const post = candidate.closest<HTMLElement>(POST_SELECTOR);

  return post;
}

function getDepth(element: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = element;

  while (current) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function scan() {
  const candidates = document.querySelectorAll<HTMLElement>(POST_SELECTOR);

  const posts = new Set<HTMLElement>();

  candidates.forEach((candidate) => {
    const post = normalizePost(candidate);

    if (post) posts.add(post);
  });

  Array.from(posts)
    .sort((a, b) => getDepth(a) - getDepth(b))
    .forEach(injectButton);
}

export function initRedditModule() {
  if (redditModuleStarted) return;
  redditModuleStarted = true;

  if (!document.body) {
    window.setTimeout(initRedditModule, 100);
    return;
  }

  const observer = new MutationObserver(() => {
    scan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scan();

  window.setInterval(scan, 1500);
}

