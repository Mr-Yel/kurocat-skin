/**
 * External character pack format.
 *
 * The renderer consumes resolved asset URLs, while the JSON parser below stays
 * independent from the storage backend. This keeps the pack format reusable by
 * Tauri, a browser preview, or a future 3D renderer.
 */

export type CharacterRendererKind = 'sprite2d' | 'gltf3d' | 'vrm';

export type CharacterLayerRole =
  | 'back'
  | 'body'
  | 'eye-details'
  | 'eyes'
  | 'eye-left'
  | 'eye-right'
  | 'pupil-left'
  | 'pupil-right'
  | 'hand-left'
  | 'hand-right'
  | 'accessory'
  | 'front';

export interface CharacterAnimationFrame {
  url: string;
  durationMs: number | null;
}

export interface CharacterAnimation {
  frames: CharacterAnimationFrame[];
  fps: number;
  loop: boolean;
}

export interface GazeConfig {
  maxX: number;
  maxY: number;
}

export interface ArmConnectorConfig {
  width: number;
  color: string;
  outlineColor: string | null;
  outlineWidth: number;
  bend: number;
}

export interface MouseFollowConfig {
  offsetX: number;
  offsetY: number;
  pressOffsetY: number;
  maxDistance: number;
  joint: readonly [number, number];
  maxReach: number | null;
  connector: ArmConnectorConfig | null;
}

export interface CharacterLayer {
  id: string;
  file: string;
  url: string;
  role: CharacterLayerRole;
  actions: string[] | null;
  order: number;
  foreground: boolean;
  anchor: readonly [number, number];
  opacity: number;
  gaze: GazeConfig | null;
  followMouse: MouseFollowConfig | null;
}

export interface CharacterMotionConfig {
  idleAnimation: string;
  blinkAnimation: string | null;
  clickAnimation: string | null;
  privacyAnimation: string | null;
  dragAnimation: string | null;
  mouseLean: number;
  gazeSmoothing: number;
  dragLift: number;
  dragSway: number;
  dragTiltDeg: number;
}

export interface CharacterAudioConfig {
  /** Loop-ready purr/voice sample. `null` keeps imported characters silent. */
  purr: string | null;
}

export interface CharacterPack {
  schemaVersion: 2;
  id: string;
  name: string;
  renderer: CharacterRendererKind;
  canvas: {
    width: number;
    height: number;
    drawWidth: number;
    baseY: number;
    pivotOffset: number;
  };
  animations: Record<string, CharacterAnimation>;
  layers: CharacterLayer[];
  motion: CharacterMotionConfig;
  audio: CharacterAudioConfig;
  manifestFile: string;
}

type UrlResolver = (file: string) => Promise<string>;

const RENDERERS = new Set<CharacterRendererKind>(['sprite2d', 'gltf3d', 'vrm']);
const ROLES = new Set<CharacterLayerRole>([
  'back',
  'body',
  'eye-details',
  'eyes',
  'eye-left',
  'eye-right',
  'pupil-left',
  'pupil-right',
  'hand-left',
  'hand-right',
  'accessory',
  'front',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function cleanAssetPath(value: unknown): string {
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

function parseAnchor(value: unknown): readonly [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0.5, 0.5];
  return [
    boundedNumber(value[0], 0.5, 0, 1),
    boundedNumber(value[1], 0.5, 0, 1),
  ];
}

function parseGaze(value: unknown, role: CharacterLayerRole): GazeConfig | null {
  if (
    role !== 'eyes' &&
    role !== 'eye-left' &&
    role !== 'eye-right' &&
    role !== 'pupil-left' &&
    role !== 'pupil-right'
  ) {
    return null;
  }
  if (value === false) return null;
  const rec = asRecord(value);
  return {
    maxX: boundedNumber(rec?.maxX, 2.5, 0, 24),
    maxY: boundedNumber(rec?.maxY, 1.8, 0, 24),
  };
}

function parseColor(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (!color || color.length > 80 || /[;{}]/.test(color)) return fallback;
  return color;
}

function parseMouseFollow(
  value: unknown,
  role: CharacterLayerRole,
  anchor: readonly [number, number],
): MouseFollowConfig | null {
  if (role !== 'hand-left' && role !== 'hand-right') return null;
  if (value === false) return null;
  const rec = asRecord(value);
  const defaultJoint: readonly [number, number] =
    role === 'hand-left'
      ? [anchor[0] + 0.16, 0.64]
      : [anchor[0] - 0.16, 0.64];
  const rawConnector = asRecord(rec?.connector);
  return {
    offsetX: boundedNumber(rec?.offsetX, 0, -120, 120),
    offsetY: boundedNumber(rec?.offsetY, 0, -120, 120),
    pressOffsetY: boundedNumber(rec?.pressOffsetY, 2.5, -12, 12),
    maxDistance: boundedNumber(rec?.maxDistance, 36, 4, 420),
    joint: Array.isArray(rec?.joint)
      ? parseAnchor(rec.joint)
      : [
          Math.max(0, Math.min(1, defaultJoint[0])),
          Math.max(0, Math.min(1, defaultJoint[1])),
        ],
    maxReach:
      typeof rec?.maxReach === 'number' && Number.isFinite(rec.maxReach)
        ? boundedNumber(rec.maxReach, 120, 16, 420)
        : null,
    connector: rawConnector
      ? {
          width: boundedNumber(rawConnector.width, 12, 2, 40),
          color: parseColor(rawConnector.color, '#d1d3d7') || '#d1d3d7',
          outlineColor: parseColor(rawConnector.outlineColor, '#202126'),
          outlineWidth: boundedNumber(rawConnector.outlineWidth, 3, 0, 10),
          bend: boundedNumber(rawConnector.bend, 0.16, -0.6, 0.6),
        }
      : null,
  };
}

async function resolveAnimation(
  name: string,
  value: unknown,
  urlOf: UrlResolver,
): Promise<CharacterAnimation | null> {
  const rec = asRecord(value);
  const rawFrames = Array.isArray(value) ? value : rec?.frames;
  if (!Array.isArray(rawFrames) || rawFrames.length === 0) {
    console.warn(`[KuroCat] character animation "${name}" has no frames`);
    return null;
  }

  const fps = boundedNumber(rec?.fps, 6, 0.1, 120);
  const defaultDuration = 1000 / fps;
  const frames: CharacterAnimationFrame[] = [];
  for (const rawFrame of rawFrames) {
    const frameRec = asRecord(rawFrame);
    const file = cleanAssetPath(
      typeof rawFrame === 'string' ? rawFrame : frameRec?.file,
    );
    if (!file) continue;
    const duration = frameRec?.durationMs;
    frames.push({
      url: await urlOf(file),
      durationMs:
        typeof duration === 'number' && Number.isFinite(duration) && duration > 0
          ? duration
          : null,
    });
  }

  if (frames.length === 0) return null;
  return {
    frames,
    fps,
    loop: rec?.loop !== false,
  };
}

/**
 * Parse and validate a v2 `character.json` / `skin.json`.
 * Invalid frames or layers are skipped individually so one broken asset does
 * not make the whole catalog unusable.
 */
export async function parseCharacterPack(
  raw: unknown,
  urlOf: UrlResolver,
  manifestFile: string,
  fallbackId: string,
  fallbackName: string,
): Promise<CharacterPack | null> {
  const rec = asRecord(raw);
  if (!rec || Number(rec.schemaVersion) !== 2) return null;

  const rawRenderer = typeof rec.renderer === 'string' ? rec.renderer : 'sprite2d';
  const renderer = RENDERERS.has(rawRenderer as CharacterRendererKind)
    ? (rawRenderer as CharacterRendererKind)
    : null;
  if (!renderer) {
    console.warn(`[KuroCat] unsupported renderer "${rawRenderer}" in ${manifestFile}`);
    return null;
  }

  const canvas = asRecord(rec.canvas);
  const width = boundedNumber(canvas?.width, 224, 1, 8192);
  const height = boundedNumber(canvas?.height, 278, 1, 8192);
  const drawWidth = boundedNumber(canvas?.drawWidth, 262, 16, 2048);
  const baseY = boundedNumber(canvas?.baseY, 364, 0, 2048);
  const pivotOffset = boundedNumber(canvas?.pivotOffset, 48, -2048, 2048);

  const rawAnimations = asRecord(rec.animations);
  if (!rawAnimations) {
    console.warn(`[KuroCat] character pack ${manifestFile} has no animations`);
    return null;
  }

  const animations: Record<string, CharacterAnimation> = {};
  for (const [name, value] of Object.entries(rawAnimations)) {
    const animation = await resolveAnimation(name, value, urlOf);
    if (animation) animations[name] = animation;
  }
  if (!animations.idle) {
    console.warn(`[KuroCat] character pack ${manifestFile} needs an "idle" animation`);
    return null;
  }

  const layers: CharacterLayer[] = [];
  if (Array.isArray(rec.layers)) {
    for (let index = 0; index < rec.layers.length; index++) {
      const layerRec = asRecord(rec.layers[index]);
      const file = cleanAssetPath(layerRec?.file);
      if (!layerRec || !file) continue;
      const rawRole = typeof layerRec.role === 'string' ? layerRec.role : 'front';
      const role = ROLES.has(rawRole as CharacterLayerRole)
        ? (rawRole as CharacterLayerRole)
        : 'front';
      const anchor = parseAnchor(layerRec.anchor);
      const foreground =
        role === 'hand-left' ||
        role === 'hand-right' ||
        role === 'accessory' ||
        role === 'front' ||
        layerRec.foreground === true;
      layers.push({
        id:
          typeof layerRec.id === 'string' && layerRec.id.trim()
            ? layerRec.id.trim()
            : `layer-${index}`,
        file,
        url: await urlOf(file),
        role,
        actions: (() => {
          if (!Array.isArray(layerRec.actions)) return null;
          const actions = layerRec.actions.filter(
            (action): action is string => typeof action === 'string',
          );
          return actions.length > 0 ? actions : null;
        })(),
        order: boundedNumber(layerRec.order, index * 10, -10000, 10000),
        foreground,
        anchor,
        opacity: boundedNumber(layerRec.opacity, 1, 0, 1),
        gaze: parseGaze(layerRec.gaze, role),
        followMouse: parseMouseFollow(layerRec.followMouse, role, anchor),
      });
    }
  }
  layers.sort((a, b) => a.order - b.order);

  const motionRec = asRecord(rec.motion);
  const audioRec = asRecord(rec.audio);
  const purrFile = cleanAssetPath(audioRec?.purr);
  const dragAnimationName =
    typeof motionRec?.dragAnimation === 'string' &&
    animations[motionRec.dragAnimation]
      ? motionRec.dragAnimation
      : null;
  const rawId = typeof rec.id === 'string' ? rec.id.trim() : '';
  const rawName = typeof rec.name === 'string' ? rec.name.trim() : '';
  return {
    schemaVersion: 2,
    id: rawId || fallbackId,
    name: rawName || fallbackName,
    renderer,
    canvas: { width, height, drawWidth, baseY, pivotOffset },
    animations,
    layers,
    motion: {
      idleAnimation: 'idle',
      blinkAnimation: animations.blink ? 'blink' : null,
      clickAnimation: animations.happy ? 'happy' : animations.shy ? 'shy' : null,
      privacyAnimation: animations.shy
        ? 'shy'
        : animations.blink
          ? 'blink'
          : null,
      dragAnimation: dragAnimationName,
      mouseLean: boundedNumber(motionRec?.mouseLean, -14, -80, 80),
      gazeSmoothing: boundedNumber(motionRec?.gazeSmoothing, 13, 2, 36),
      dragLift: boundedNumber(motionRec?.dragLift, 20, 0, 96),
      dragSway: boundedNumber(motionRec?.dragSway, 7, 0, 40),
      dragTiltDeg: boundedNumber(motionRec?.dragTiltDeg, 4.5, 0, 24),
    },
    audio: {
      purr: purrFile ? await urlOf(purrFile) : null,
    },
    manifestFile,
  };
}

/** Convert the original four-file convention into the same runtime format. */
export async function createLegacyCharacterPack(options: {
  id: string;
  name: string;
  canvasWidth: number;
  canvasHeight: number;
  frames: Record<'idle' | 'blink' | 'shy' | 'happy', string>;
}): Promise<CharacterPack> {
  const frame = (url: string): CharacterAnimationFrame => ({ url, durationMs: null });
  return {
    schemaVersion: 2,
    id: options.id,
    name: options.name,
    renderer: 'sprite2d',
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
      drawWidth: 262,
      baseY: 364,
      pivotOffset: 48,
    },
    animations: {
      idle: { frames: [frame(options.frames.idle)], fps: 1, loop: true },
      blink: { frames: [frame(options.frames.blink)], fps: 1, loop: false },
      shy: { frames: [frame(options.frames.shy)], fps: 1, loop: false },
      happy: { frames: [frame(options.frames.happy)], fps: 1, loop: false },
    },
    layers: [],
    motion: {
      idleAnimation: 'idle',
      blinkAnimation: 'blink',
      clickAnimation: 'happy',
      privacyAnimation: 'shy',
      dragAnimation: null,
      mouseLean: -14,
      gazeSmoothing: 13,
      dragLift: 20,
      dragSway: 7,
      dragTiltDeg: 4.5,
    },
    audio: { purr: null },
    manifestFile: 'legacy:skin.json',
  };
}
