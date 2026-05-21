# Reddit Downloader

A Chrome extension that adds a download button to Reddit posts so you can save available images and videos with one click.

## Overview

`Reddit Downloader` injects a lightweight action button into Reddit post UI. When a post has downloadable media, the extension sends a download request to the background service worker, which saves files using Chrome's native `downloads` API.

## Features

- One-click media download from Reddit posts
- Supports common Reddit media hosts:
  - `i.redd.it`
  - `v.redd.it`
  - `preview.redd.it`
  - `external-preview.redd.it`
- Handles image and video posts
- Clean filename generation based on post ID and author
- Minimal UI with clear button states (idle, loading, success, error)
- Manifest V3 + TypeScript + Vite setup

## Requirements

- Node.js 18+
- npm
- Google Chrome (or Chromium-based browser with MV3 support)

## Installation (Developer Mode)

1. Install dependencies and build the extension:

```bash
npm install
npm run build
```

2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the generated `dist/` folder

## Usage

1. Open `https://www.reddit.com/`
2. Navigate to a post that contains downloadable media
3. Click the download button added by the extension
4. File is saved through Chrome Downloads

## Development

Run local development watcher:

```bash
npm run dev
```

Run TypeScript checks:

```bash
npm run typecheck
```

Create production build:

```bash
npm run build
```

## Project Structure

```text
src/
├── manifest.json
├── background/
│   └── index.ts              # Service worker, handles chrome.downloads
├── content/
│   ├── index.ts              # Reddit host bootstrap
│   └── content.css           # Content styles for injected button
├── modules/
│   ├── reddit/
│   │   └── content.ts        # Reddit media detection + button injection
│   └── shared/
│       └── download.ts       # Runtime message helper for downloads
└── popup/
    ├── index.html
    ├── popup.css
    └── popup.ts
```

## Permissions

- `downloads`
- `https://reddit.com/*`
- `https://www.reddit.com/*`
- `https://i.redd.it/*`
- `https://v.redd.it/*`
- `https://preview.redd.it/*`
- `https://external-preview.redd.it/*`

## Troubleshooting

- **No download button appears:** reload the page and confirm the post contains media.
- **Download fails:** open the post page directly and try again.
- **Extension changes not applied:** rebuild and reload the extension in `chrome://extensions`.

## Privacy

- No login required
- No external backend service
- No analytics/tracking in extension code

## Legal

Use this extension for personal and lawful purposes only.
You are responsible for complying with Reddit terms and respecting creator rights and copyright.
