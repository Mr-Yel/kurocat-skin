/**
 * Runtime sprite skin loader.
 *
 * A user-supplied character lives in a plain folder, no rebuild required:
 *
 *   %APPDATA%\com.kurocat.pet\skins\
 *     idle.png    (required, 224x278 recommended, transparent)
 *     blink.png   (optional, falls back to idle)
 *     shy.png     (optional, falls back to idle)
 *     happy.png   (optional, falls back to idle)
 *     skin.json   (optional: { "name": "...", "hands": false, "tail": false, ... })
 *
 * Files are served through Tauri's `asset:` protocol, so `tauri.conf.json` must
 * enable `app.security.assetProtocol` and scope it to the app data directory.
 * The same loader accepts `?skins=<url-prefix>` so the browser dev server can
 * preview a skin without a Tauri runtime.
 */
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { SpriteOptions, SpriteSources } from './dafeiyuRenderer';

const FRAME_KEYS = ['idle', 'blink', 'shy', 'happy'] as const;
const OPTION_KEYS = ['hands', 'tail', 'eyeGaze', 'blush'] as const;

export interface AppliedSkin {
  name: string;
  sources: SpriteSources;
  options: Partial<SpriteOptions>;
  /** Human-readable origin, used for logging. */
  origin: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Resolve `true` only when the file exists and decodes to a non-empty bitmap. */
function probe(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
    img.onerror = () => finish(false);
    window.setTimeout(() => finish(false), timeoutMs);
    img.src = url;
  });
}

async function readMeta(urlOf: (file: string) => Promise<string>): Promise<{
  name: string;
  options: Partial<SpriteOptions>;
}> {
  const fallback = { name: 'custom', options: {} as Partial<SpriteOptions> };
  try {
    const res = await fetch(await urlOf('skin.json'), { cache: 'no-store' });
    if (!res.ok) return fallback;
    const raw = (await res.json()) as Record<string, unknown>;
    const options: Partial<SpriteOptions> = {};
    for (const key of OPTION_KEYS) {
      if (typeof raw[key] === 'boolean') options[key] = raw[key] as boolean;
    }
    return { name: typeof raw.name === 'string' ? raw.name : 'custom', options };
  } catch {
    return fallback;
  }
}

export async function loadCustomSkin(): Promise<AppliedSkin | null> {
  const devBase = new URLSearchParams(window.location.search).get('skins');
  let base: string | null = devBase ? devBase.replace(/\/+$/, '') : null;
  let dir: string | null = null;

  if (!base) {
    if (!isTauriRuntime()) return null;
    try {
      dir = await join(await appDataDir(), 'skins');
    } catch {
      return null;
    }
  }

  const urlOf = async (file: string): Promise<string> =>
    dir ? convertFileSrc(await join(dir, file)) : `${base}/${file}`;

  try {
    const idle = await urlOf('idle.png');
    if (!(await probe(idle))) return null;

    const sources = { idle } as SpriteSources;
    const rest = await Promise.all(
      (['blink', 'shy', 'happy'] as const).map(async (key) => {
        const url = await urlOf(`${key}.png`);
        return { key, url, ok: await probe(url) };
      }),
    );
    for (const item of rest) {
      sources[item.key] = item.ok ? item.url : idle;
    }

    const meta = await readMeta(urlOf);
    return {
      name: meta.name,
      sources,
      options: meta.options,
      origin: dir ?? (base as string),
    };
  } catch {
    return null;
  }
}

export { FRAME_KEYS };
