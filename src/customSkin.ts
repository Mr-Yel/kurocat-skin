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
import { appDataDir, dataDir, join } from '@tauri-apps/api/path';
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

/**
 * KuroCat 的 Rust 端没有用 Tauri 的 `app_data_dir()`，而是在 `config.rs` 里自己拼了
 * `%APPDATA%\kuro-cat-pet`。而前端 `appDataDir()` 拿到的是 identifier 目录
 * `%APPDATA%\com.kurocat.pet`。两者不同，所以两个位置都要试。
 */
const SKIN_DIR_CANDIDATES: ReadonlyArray<readonly string[]> = [
  ['kuro-cat-pet', 'skins'],
  ['com.kurocat.pet', 'skins'],
];

export async function loadCustomSkin(): Promise<AppliedSkin | null> {
  const devBase = new URLSearchParams(window.location.search).get('skins');
  const base: string | null = devBase ? devBase.replace(/\/+$/, '') : null;

  const attempt = async (dir: string | null): Promise<AppliedSkin | null> => {
    const urlOf = async (file: string): Promise<string> =>
      dir ? convertFileSrc(await join(dir, file)) : `${base}/${file}`;
    try {
      const idle = await urlOf('idle.png');
      if (!(await probe(idle))) {
        // Keep this loud: a 403 here almost always means the asset-protocol
        // scope in tauri.conf.json does not cover `dir`.
        let status = 'no-fetch';
        try {
          status = String((await fetch(idle, { cache: 'no-store' })).status);
        } catch (err) {
          status = `fetch-error:${String(err).slice(0, 80)}`;
        }
        console.warn('[KuroCat] sprite probe failed', { dir: dir ?? base, idle, status });
        return null;
      }
      console.info('[KuroCat] sprite probe ok', { dir: dir ?? base, idle });

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
        origin: dir ?? base ?? '',
      };
    } catch (err) {
      console.warn('[KuroCat] sprite attempt threw', dir ?? base, String(err).slice(0, 200));
      return null;
    }
  };

  if (base) return attempt(null);
  if (!isTauriRuntime()) {
    console.info('[KuroCat] not a tauri runtime, custom skin skipped');
    return null;
  }

  try {
    const root = await dataDir();
    console.info('[KuroCat] dataDir =', root);
    for (const parts of SKIN_DIR_CANDIDATES) {
      const candidate = await join(root, ...parts);
      const hit = await attempt(candidate);
      if (hit) return hit;
    }
    return await attempt(await join(await appDataDir(), 'skins'));
  } catch (err) {
    console.warn('[KuroCat] custom skin resolution failed', String(err).slice(0, 200));
    return null;
  }
}

export { FRAME_KEYS };
