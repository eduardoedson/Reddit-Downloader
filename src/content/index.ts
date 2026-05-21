import { initRedditModule } from '../modules/reddit/content';

const host = window.location.hostname;


if (host === 'reddit.com' || host === 'www.reddit.com' || host.endsWith('.reddit.com')) {
  initRedditModule();
}

