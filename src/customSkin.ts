/**
 * Runtime character discovery.
 *
 * Characters live in a plain folder tree, no rebuild required:
 *
 *   %APPDATA%\kuro-cat-pet\skins\
 *     characters.json
 *     character.json + *.png                      <- root character
 *     mychar\
 *       character.json + *.png                    <- nested character
 *
 * `characters.json`:
 *   { "characters": [ { "dir": "", "name": "小明" }, { "dir": "cat2" } ] }
 *
 * A folder is valid when it has either:
 *   - `character.json` using schemaVersion 2 (multi-frame/layered pack), or
 *   - the original `idle.png` / `blink.png` / `shy.png` / `happy.png` files.
 *
 * Files are served through Tauri's `asset:` protocol. The plain Vite dev server
 * can preview one character with `?skins=/skins`.
 */
import { appDataDir, dataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  createLegacyCharacterPack,
  parseCharacterPack,
  type CharacterPack,
} from './pet-extension/characterPack';

const FRAME_KEYS = ['idle', 'blink', 'shy', 'happy'] as const;
const LEGACY_FRAME_KEYS = ['blink', 'shy', 'happy'] as const;

/**
 * Catalog id prefix for a sprite character. It must survive the Rust side's
 * `sanitize_cat_id` (lowercase alphanumerics, `-`, `_` only).
 */
export const SPRITE_ID_PREFIX = 'sprite-';

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
  /** Stable settings value, e.g. `sprite-mychar`. */
  id: string;
  /** Folder name relative to the skins root, '' for the root itself. */
  key: string;
  name: string;
  pack: CharacterPack;
  /** Absolute folder, used for logging. */
  origin: string;
}

export function isSpriteId(id: string): boolean {
  return id.startsWith(SPRITE_ID_PREFIX);
}

function toSpriteId(raw: string, fallbackKey: string): string {
  const value = raw.startsWith(SPRITE_ID_PREFIX)
    ? raw.slice(SPRITE_ID_PREFIX.length)
    : raw || fallbackKey;
  return `${SPRITE_ID_PREFIX}${sanitizeKey(value)}`;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface ImageInfo {
  width: number;
  height: number;
}

/** Resolve only when the file exists and decodes to a non-empty bitmap. */
function probeImage(url: string, timeoutMs = 5000): Promise<ImageInfo | null> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (result: ImageInfo | null) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };
    img.onload = () =>
      finish(
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null,
      );
    img.onerror = () => finish(null);
    window.setTimeout(() => finish(null), timeoutMs);
    img.src = url;
  });
}

async function readJson(
  urlOf: (file: string) => Promise<string>,
  file: string,
): Promise<unknown | null> {
  try {
    const response = await fetch(await urlOf(file), { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function cleanRelativePath(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('..') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return '';
  }
  return normalized;
}

interface ManifestEntry {
  key: string;
  name: string;
  manifest: string;
}

async function readManifest(
  urlOf: (file: string) => Promise<string>,
): Promise<ManifestEntry[] | null> {
  const raw = await readJson(urlOf, 'characters.json');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const characters = (raw as { characters?: unknown }).characters;
  if (!Array.isArray(characters)) return null;

  const out: ManifestEntry[] = [];
  for (const item of characters) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.dir === 'string' ? rec.dir.replace(/[\\/]+$/, '') : '';
    if (key && cleanRelativePath(key) !== key) continue;
    out.push({
      key,
      name: typeof rec.name === 'string' ? rec.name : key,
      manifest: cleanRelativePath(rec.manifest),
    });
  }
  return out;
}

async function loadCharacter(
  root: string | null,
  entry: ManifestEntry,
  devBase: string | null,
): Promise<SkinCharacter | null> {
  const dir = root ? (entry.key ? await join(root, entry.key) : root) : null;
  const urlOf = async (file: string): Promise<string> =>
    dir ? convertFileSrc(await join(dir, file)) : `${devBase}/${file}`;

  try {
    // Prefer the v2 manifest. `skin.json` may also contain v2 for backward
    // compatible packs, otherwise it is treated as the legacy metadata file.
    const v2Candidates = entry.manifest
      ? [entry.manifest]
      : ['character.json', 'pack.json', 'skin.json'];
    for (const manifestFile of v2Candidates) {
      const raw = await readJson(urlOf, manifestFile);
      if (!raw || typeof raw !== 'object') continue;
      const schemaVersion = (raw as Record<string, unknown>).schemaVersion;
      if (Number(schemaVersion) !== 2) continue;

      const fallbackId = `${SPRITE_ID_PREFIX}${sanitizeKey(entry.key)}`;
      const pack = await parseCharacterPack(
        raw,
        urlOf,
        manifestFile,
        fallbackId,
        entry.name || entry.key || 'custom',
      );
      if (!pack) continue;
      if (pack.renderer !== 'sprite2d') {
        console.warn(
          `[KuroCat] ${entry.key || '<root>'} requests renderer "${pack.renderer}", but this build currently supports sprite2d only`,
        );
        continue;
      }

      const idle = await probeImage(pack.animations.idle.frames[0].url);
      if (!idle) {
        console.warn('[KuroCat] v2 character idle frame cannot be loaded', {
          dir: dir ?? devBase,
          manifest: manifestFile,
        });
        continue;
      }
      return {
        id: toSpriteId(pack.id, entry.key),
        key: entry.key,
        name: pack.name || entry.name || entry.key || 'custom',
        pack,
        origin: dir ?? devBase ?? '',
      };
    }

    const idle = await urlOf('idle.png');
    const idleInfo = await probeImage(idle);
    if (!idleInfo) {
      let status = 'no-fetch';
      try {
        status = String((await fetch(idle, { cache: 'no-store' })).status);
      } catch (err) {
        status = `fetch-error:${String(err).slice(0, 80)}`;
      }
      console.warn('[KuroCat] sprite probe failed', { dir: dir ?? devBase, idle, status });
      return null;
    }

    const frames = { idle } as Record<(typeof FRAME_KEYS)[number], string>;
    const rest = await Promise.all(
      LEGACY_FRAME_KEYS.map(async (frame) => {
        const url = await urlOf(`${frame}.png`);
        return { frame, url, ok: Boolean(await probeImage(url)) };
      }),
    );
    for (const item of rest) frames[item.frame] = item.ok ? item.url : idle;

    const rawMeta = await readJson(urlOf, 'skin.json');
    const meta =
      rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)
        ? (rawMeta as Record<string, unknown>)
        : {};
    const fallbackName = entry.name || entry.key || 'custom';
    const name =
      (typeof meta.name === 'string' && meta.name.trim()) || fallbackName;
    const id = `${SPRITE_ID_PREFIX}${sanitizeKey(entry.key)}`;
    const pack = await createLegacyCharacterPack({
      id,
      name,
      canvasWidth: idleInfo.width,
      canvasHeight: idleInfo.height,
      frames,
    });
    return {
      id,
      key: entry.key,
      name,
      pack,
      origin: dir ?? devBase ?? '',
    };
  } catch (err) {
    console.warn('[KuroCat] character load threw', dir ?? devBase, String(err).slice(0, 200));
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
    const entry: ManifestEntry = { key: '', name: 'dev', manifest: '' };
    const one = await loadCharacter(null, entry, devBase.replace(/\/+$/, ''));
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
    const entries: ManifestEntry[] = manifest ?? [{ key: '', name: '', manifest: '' }];
    const found: SkinCharacter[] = [];
    for (const entry of entries) {
      const character = await loadCharacter(root, entry, null);
      if (character) found.push(character);
    }
    if (found.length > 0) {
      console.info(
        '[KuroCat] sprite characters =',
        found.map((character) => `${character.id}(${character.name})`).join(', '),
      );
      return found;
    }
  }

  console.info('[KuroCat] no sprite character found');
  return [];
}

export { FRAME_KEYS };
