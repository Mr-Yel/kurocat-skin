/**
 * Runtime sprite character discovery.
 *
 * Characters live in a plain folder tree, no rebuild required:
 *
 *   %APPDATA%\kuro-cat-pet\skins\
 *     characters.json          (optional manifest)
 *     idle.png blink.png shy.png happy.png skin.json   <- root character
 *     mychar\
 *       idle.png blink.png shy.png happy.png skin.json <- nested character
 *
 * `characters.json` shape:
 *   { "characters": [ { "dir": "", "name": "小明" }, { "dir": "cat2", "name": "第二只" } ] }
 * `dir` empty means "the skins folder itself".
 *
 * When the manifest is missing we fall back to a single root character, which
 * keeps the first-generation layout (`skins\idle.png`) working.
 *
 * Files are served through Tauri's `asset:` protocol, so `tauri.conf.json` must
 * enable `app.security.assetProtocol` and scope it to the real data directory.
 * Note: `$APPDATA` resolves to the bundle-identifier folder, while KuroCat's
 * Rust side writes to `$DATA/kuro-cat-pet` — both are scoped.
 *
 * The loader also accepts `?skins=<url-prefix>` so the plain browser dev server
 * can preview one character without a Tauri runtime.
 */
import { appDataDir, dataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { SpriteOptions, SpriteSources } from './dafeiyuRenderer';

const FRAME_KEYS = ['idle', 'blink', 'shy', 'happy'] as const;
const OPTION_KEYS = ['hands', 'tail', 'eyeGaze', 'blush'] as const;

/**
 * Catalog id prefix for a sprite character. It must survive the Rust side's
 * `sanitize_cat_id` (lowercase alphanumerics, `-`, `_` only), which is why we
 * use a dash instead of a colon.
 */
export const SPRITE_ID_PREFIX = 'sprite-';

/** Mirror of the Rust `sanitize_cat_id` so persisted ids stay stable. */
function sanitizeKey(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .split('')
    .map((ch) => (/[a-z0-9_-]/.test(ch) ? ch : '-'))
    .join('');
  const trimmed = cleaned.replace(/^-+|-+$/g, '');
  return trimmed || 'root';
}

export interface SkinCharacter {
  /** Stable settings value, e.g. `sprite:mychar`. */
  id: string;
  /** Folder name relative to the skins root, '' for the root itself. */
  key: string;
  name: string;
  sources: SpriteSources;
  options: Partial<SpriteOptions>;
  /** Absolute folder, used for logging. */
  origin: string;
}

export function isSpriteId(id: string): boolean {
  return id.startsWith(SPRITE_ID_PREFIX);
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

interface CharacterMeta {
  name: string;
  options: Partial<SpriteOptions>;
}

async function readMeta(urlOf: (file: string) => Promise<string>): Promise<CharacterMeta> {
  const fallback: CharacterMeta = { name: '', options: {} };
  try {
    const res = await fetch(await urlOf('skin.json'), { cache: 'no-store' });
    if (!res.ok) return fallback;
    const raw = (await res.json()) as Record<string, unknown>;
    const options: Partial<SpriteOptions> = {};
    for (const key of OPTION_KEYS) {
      if (typeof raw[key] === 'boolean') options[key] = raw[key] as boolean;
    }
    return { name: typeof raw.name === 'string' ? raw.name : '', options };
  } catch {
    return fallback;
  }
}

interface ManifestEntry {
  key: string;
  name: string;
}

async function readManifest(
  urlOf: (file: string) => Promise<string>,
): Promise<ManifestEntry[] | null> {
  try {
    const res = await fetch(await urlOf('characters.json'), { cache: 'no-store' });
    if (!res.ok) return null;
    const raw = (await res.json()) as { characters?: unknown };
    if (!Array.isArray(raw.characters)) return null;
    const out: ManifestEntry[] = [];
    for (const item of raw.characters) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const dir = typeof rec.dir === 'string' ? rec.dir.replace(/[\\/]+$/, '') : '';
      // Reject anything that tries to escape the skins folder.
      if (dir.includes('..') || /^[a-zA-Z]:/.test(dir) || dir.startsWith('\\') || dir.startsWith('/')) {
        continue;
      }
      out.push({ key: dir, name: typeof rec.name === 'string' ? rec.name : dir });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Load one character from a folder. Returns null when `idle.png` is missing or
 * unreadable — a 403 here almost always means the asset-protocol scope in
 * `tauri.conf.json` does not cover this folder.
 */
async function loadCharacter(
  root: string | null,
  key: string,
  fallbackName: string,
  devBase: string | null,
): Promise<SkinCharacter | null> {
  const dir = root ? (key ? await join(root, key) : root) : null;
  const urlOf = async (file: string): Promise<string> =>
    dir ? convertFileSrc(await join(dir, file)) : `${devBase}/${file}`;

  try {
    const idle = await urlOf('idle.png');
    if (!(await probe(idle))) {
      let status = 'no-fetch';
      try {
        status = String((await fetch(idle, { cache: 'no-store' })).status);
      } catch (err) {
        status = `fetch-error:${String(err).slice(0, 80)}`;
      }
      console.warn('[KuroCat] sprite probe failed', { dir: dir ?? devBase, idle, status });
      return null;
    }

    const sources = { idle } as SpriteSources;
    const rest = await Promise.all(
      (['blink', 'shy', 'happy'] as const).map(async (frame) => {
        const url = await urlOf(`${frame}.png`);
        return { frame, url, ok: await probe(url) };
      }),
    );
    for (const item of rest) sources[item.frame] = item.ok ? item.url : idle;

    const meta = await readMeta(urlOf);
    return {
      id: `${SPRITE_ID_PREFIX}${sanitizeKey(key)}`,
      key,
      name: meta.name || fallbackName || key || 'custom',
      sources,
      options: meta.options,
      origin: dir ?? devBase ?? '',
    };
  } catch (err) {
    console.warn('[KuroCat] sprite load threw', dir ?? devBase, String(err).slice(0, 200));
    return null;
  }
}

/**
 * KuroCat's Rust side hardcodes `%APPDATA%\kuro-cat-pet` (see `config.rs`),
 * while Tauri's `$APPDATA` / `appDataDir()` resolves to the identifier folder
 * `%APPDATA%\com.kurocat.pet`. Probe the real one first.
 */
const SKIN_ROOT_CANDIDATES: ReadonlyArray<readonly string[]> = [
  ['kuro-cat-pet', 'skins'],
  ['com.kurocat.pet', 'skins'],
];

export async function discoverCharacters(): Promise<SkinCharacter[]> {
  const devBase = new URLSearchParams(window.location.search).get('skins');
  if (devBase) {
    const one = await loadCharacter(null, '', 'dev', devBase.replace(/\/+$/, ''));
    return one ? [one] : [];
  }

  if (!isTauriRuntime()) {
    console.info('[KuroCat] not a tauri runtime, sprite characters skipped');
    return [];
  }

  const roots: string[] = [];
  try {
    const base = await dataDir();
    for (const parts of SKIN_ROOT_CANDIDATES) {
      roots.push(await join(base, ...parts));
    }
    roots.push(await join(await appDataDir(), 'skins'));
    console.info('[KuroCat] sprite roots =', roots.join(' | '));
  } catch (err) {
    console.warn('[KuroCat] cannot resolve sprite roots', String(err).slice(0, 200));
    return [];
  }

  for (const root of roots) {
    const manifest = await readManifest(async (file) => convertFileSrc(await join(root, file)));
    const entries: ManifestEntry[] = manifest ?? [{ key: '', name: '' }];
    const found: SkinCharacter[] = [];
    for (const entry of entries) {
      const ch = await loadCharacter(root, entry.key, entry.name, null);
      if (ch) found.push(ch);
    }
    if (found.length > 0) {
      console.info(
        '[KuroCat] sprite characters =',
        found.map((c) => `${c.id}(${c.name})`).join(', '),
      );
      return found;
    }
  }

  console.info('[KuroCat] no sprite character found');
  return [];
}

export { FRAME_KEYS };
