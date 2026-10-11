import { release } from '../lib/release';

export function initDiscordShare(
  code: string | (() => string),
  onReady?: (link: URL) => void,
) {
  const root = document.querySelector<HTMLElement>('#discord-sharing');
  if (!root) return;
  const create = root.querySelector<HTMLButtonElement>('.discord-create')!;
  const copy = root.querySelector<HTMLButtonElement>('.discord-copy')!;
  const status = root.querySelector<HTMLElement>('.discord-status')!;
  const result = root.querySelector<HTMLElement>('.discord-result')!;
  const link = root.querySelector<HTMLAnchorElement>('.discord-link')!;
  const api = new URL(
    `${import.meta.env.PUBLIC_API_BASE || import.meta.env.BASE_URL}api/shares`,
    location.origin,
  );
  let job = '';
  let timer: ReturnType<typeof setTimeout>;
  let deadline = 0;
  let epoch = 0;
  const controller = new AbortController();
  window.addEventListener(
    'pagehide',
    () => {
      clearTimeout(timer);
      controller.abort();
    },
    { once: true },
  );

  async function request(
    url: string,
    options: RequestInit = {},
    started = epoch,
  ) {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    });
    const value: unknown = await response.json();
    if (started !== epoch) return;
    if ([404, 410].includes(response.status)) job = '';
    if (!value || typeof value !== 'object')
      throw new Error('Sharing returned an unreadable response. Try again.');
    if (!response.ok)
      throw new Error(
        'error' in value && typeof value.error === 'string'
          ? value.error
          : 'Sharing is unavailable. Try again.',
      );
    if (
      !('state' in value) ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(value.id)
    )
      throw new Error('Sharing returned an invalid link. Try again.');
    if (url !== api.href && value.id !== url.split('/').at(-1))
      throw new Error(
        'Sharing returned a different rendered copy. Ask for a new link.',
      );
    job = value.id;
    if (value.state === 'failed') {
      job = '';
      throw new Error(
        'error' in value && typeof value.error === 'string'
          ? value.error
          : 'Rendering failed. Try again.',
      );
    }
    if (value.state === 'ready') {
      if (!('url' in value) || typeof value.url !== 'string')
        throw new Error('The rendered link is missing. Try again.');
      const shared = new URL(value.url);
      if (
        shared.origin !== api.origin ||
        shared.pathname !== `/soundcloud-tempo-control/listen/${job}` ||
        shared.search ||
        shared.hash ||
        shared.username ||
        shared.password
      )
        throw new Error('The rendered link is invalid. Try again.');
      link.href = shared.href;
      link.textContent = shared.href;
      result.hidden = false;
      create.hidden = true;
      status.textContent =
        'Ready to share. The audio copy expires after seven days.';
      onReady?.(shared);
      return;
    }
    if (value.state !== 'rendering')
      throw new Error('Unknown render status. Try again.');
    if (Date.now() >= deadline)
      throw new Error('Still waiting for the render. Check it again shortly.');
    status.textContent =
      'Rendering the shared track. This can take several minutes.';
    timer = setTimeout(
      () =>
        request(`${api.href}/${job}`, {}, started).catch((error) => {
          if (started === epoch) failed(error);
        }),
      3000,
    );
  }
  function failed(error: unknown) {
    if (controller.signal.aborted) return;
    status.textContent =
      error instanceof Error
        ? error.message
        : 'Sharing is unavailable. Try again.';
    create.disabled = false;
    create.textContent = job ? 'Check render' : 'Try again';
  }
  create.addEventListener('click', () => {
    clearTimeout(timer);
    deadline = Date.now() + 16 * 60000;
    create.disabled = true;
    status.textContent = 'Starting the render…';
    const started = epoch;
    try {
      const task = job
        ? request(`${api.href}/${job}`)
        : request(api.href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: typeof code === 'function' ? code() : code,
              publish: true,
            }),
          });
      task.catch((error) => {
        if (started === epoch) failed(error);
      });
    } catch (error) {
      failed(error);
    }
  });
  copy.addEventListener('click', async () => {
    try {
      const label = (
        release.siteUrl || `${location.origin}${import.meta.env.BASE_URL}`
      ).replace(/^https?:\/\//, '');
      await navigator.clipboard.writeText(`[${label}](${link.href})`);
      status.textContent = 'Link copied.';
    } catch {
      status.textContent =
        'Copy the link above. Clipboard access is unavailable.';
    }
  });
  return {
    async readReady(id: string) {
      if (!/^[a-f0-9]{32}$/.test(id))
        throw new Error('The rendered link is invalid. Ask for a new copy.');
      clearTimeout(timer);
      deadline = Date.now() + 16 * 60000;
      await request(`${api.href}/${id}`);
    },
    reset() {
      epoch++;
      clearTimeout(timer);
      job = '';
      result.hidden = true;
      create.hidden = false;
      create.disabled = false;
      create.textContent = 'Create public Discord link';
      status.textContent = '';
    },
  };
}
