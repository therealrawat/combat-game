import { CharacterId, FighterState } from '../types/game';

export interface NativeGLBClipSpec {
  state: FighterState;
  url: string;
  clipName: string;
  speed: number;
  repeatCount?: number;
  yawOffsetRad?: number;
  hipsYOffset?: number;
  holdDurationSec?: number;
  stripHorizontalRootMotion?: boolean;
}

interface ConventionMoveRule {
  state: FighterState;
  clipSuffix: string;
  moveKeys: readonly string[];
  defaultSpeed: number;
  stripHorizontalRootMotion?: boolean;
}

const MODEL_GLOB_URLS = import.meta.glob<string>('../../models/*/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});

/**
 * Indexes `models/<character>/<character>-<move>.glb` files into a lookup:
 * characterName -> moveKey (with `<character>-` prefix and `.glb` stripped) -> Vite asset URL.
 */
function buildModelAssetIndex(): Map<string, Record<string, string>> {
  const index = new Map<string, Record<string, string>>();

  for (const [rawPath, url] of Object.entries(MODEL_GLOB_URLS)) {
    const normalized = rawPath.replace(/\\/g, '/');
    const match = /models\/([^/]+)\/([^/]+)\.glb$/i.exec(normalized);
    if (!match) continue;

    const charKey = match[1].toLowerCase();
    const fileStem = match[2].toLowerCase();
    const prefix = `${charKey}-`;
    const moveKey = fileStem.startsWith(prefix) ? fileStem.slice(prefix.length) : fileStem;

    const existing = index.get(charKey) ?? {};
    existing[moveKey] = url;
    index.set(charKey, existing);
  }

  return index;
}

const MODEL_ASSET_INDEX = buildModelAssetIndex();

const STANDARD_CONVENTION_RULES: readonly ConventionMoveRule[] = [
  { state: 'IDLE', clipSuffix: 'Idle', moveKeys: ['idle-1', 'idle'], defaultSpeed: 1.0 },
  { state: 'RUN', clipSuffix: 'Run', moveKeys: ['run'], defaultSpeed: 1.35 },
  {
    state: 'ENTRY',
    clipSuffix: 'Entry',
    moveKeys: ['entry'],
    defaultSpeed: 1.25,
    stripHorizontalRootMotion: true,
  },
  { state: 'PUNCH', clipSuffix: 'Punch', moveKeys: ['punch'], defaultSpeed: 2.35 },
  { state: 'KICK', clipSuffix: 'Kick', moveKeys: ['kick'], defaultSpeed: 2.1 },
  {
    state: 'MUAY_THAI',
    clipSuffix: 'MuayThai',
    moveKeys: ['kick-punch-mix', 'kick-punch', 'puch-kick-mix', 'muay-thai'],
    defaultSpeed: 1.7,
  },
  {
    state: 'POSE',
    clipSuffix: 'Pose',
    moveKeys: ['cheer-1', 'pushups', 'pose'],
    defaultSpeed: 1.35,
  },
  {
    state: 'DANCE',
    clipSuffix: 'Dance',
    moveKeys: ['cheer-2', 'dance'],
    defaultSpeed: 1.3,
  },
  {
    state: 'LASER_EYES',
    clipSuffix: 'LaserEyes',
    moveKeys: ['laser-eyes', 'signature'],
    defaultSpeed: 1.0,
  },
];

const CHARACTER_SPEC_OVERRIDES: Partial<
  Record<CharacterId, Partial<Record<FighterState, Partial<Omit<NativeGLBClipSpec, 'state' | 'url'>>>>>
> = {
  chinu: {
    IDLE: { yawOffsetRad: 0.45 },
    CHAMP_POSE: { clipName: 'ChinuNativeChampPose', speed: 1.0, holdDurationSec: 2.2 },
    DANCE: { clipName: 'ChinuNativeBoxerDance', speed: 1.45, stripHorizontalRootMotion: false },
    POSE: { speed: 1.45, stripHorizontalRootMotion: false },
  },
  priyanshu: {
    IDLE: { yawOffsetRad: 0.55 },
    LOUNGE: {
      clipName: 'PriyanshuNativeLoungePose',
      speed: 1.0,
      hipsYOffset: 0.075,
      holdDurationSec: 2.35,
    },
    PUNCH: { speed: 2.4 },
    KICK: { speed: 2.2 },
    MUAY_THAI: { clipName: 'PriyanshuNativeKickPunch', speed: 2.35 },
    POSE: { clipName: 'PriyanshuNativePushups', speed: 1.45, repeatCount: 2 },
  },
  modiji: {
    IDLE: { speed: 1.0 },
    KICK: { speed: 2.05 },
    MUAY_THAI: { speed: 1.75 },
    POSE: { clipName: 'ModijiNativeAerial', speed: 1.25, stripHorizontalRootMotion: true },
    DANCE: { clipName: 'ModijiNativeCheer', speed: 1.3, stripHorizontalRootMotion: true },
  },
};

/** Returns all discovered `<character>-<move>.glb` move URLs keyed by canonical `<move>`. */
export function getCharacterMoveMap(characterId: string): Record<string, string> {
  return MODEL_ASSET_INDEX.get(characterId.toLowerCase()) ?? {};
}

/** Resolves all available base model GLB candidate URLs in priority order (`avatar`, `animation`, `body`). */
export function getCharacterAvatarUrls(characterId: string): string[] {
  const moves = getCharacterMoveMap(characterId);
  return ['avatar', 'animation', 'body']
    .map((key) => moves[key])
    .filter((url): url is string => Boolean(url));
}

/**
 * Builds native GLB animation clip specs automatically from `models/<name>/<name>-<move>.glb`
 * files plus character-specific timing/root-motion adjustments.
 */
export function buildConventionNativeClipSpecs(id: CharacterId): NativeGLBClipSpec[] {
  const moves = getCharacterMoveMap(id);
  const overrides = CHARACTER_SPEC_OVERRIDES[id] ?? {};
  const labelPrefix = `${id.charAt(0).toUpperCase()}${id.slice(1)}Native`;
  const specs: NativeGLBClipSpec[] = [];

  for (const rule of STANDARD_CONVENTION_RULES) {
    let resolvedUrl: string | undefined;
    for (const moveKey of rule.moveKeys) {
      if (moves[moveKey]) {
        resolvedUrl = moves[moveKey];
        break;
      }
    }
    if (!resolvedUrl) continue;

    const custom = overrides[rule.state] ?? {};
    specs.push({
      state: rule.state,
      url: resolvedUrl,
      clipName: custom.clipName ?? `${labelPrefix}${rule.clipSuffix}`,
      speed: custom.speed ?? rule.defaultSpeed,
      repeatCount: custom.repeatCount,
      yawOffsetRad: custom.yawOffsetRad,
      hipsYOffset: custom.hipsYOffset,
      holdDurationSec: custom.holdDurationSec,
      stripHorizontalRootMotion: custom.stripHorizontalRootMotion ?? rule.stripHorizontalRootMotion,
    });
  }

  // Secondary idle (`<name>-idle-2.glb`) maps cleanly to LOUNGE (Priyanshu) or CHAMP_POSE (Chinu / others).
  if (moves['idle-2']) {
    const idle2State: FighterState = id === 'priyanshu' ? 'LOUNGE' : 'CHAMP_POSE';
    const custom = overrides[idle2State] ?? {};
    specs.push({
      state: idle2State,
      url: moves['idle-2'],
      clipName:
        custom.clipName ?? `${labelPrefix}${idle2State === 'LOUNGE' ? 'LoungePose' : 'ChampPose'}`,
      speed: custom.speed ?? 1.0,
      repeatCount: custom.repeatCount,
      yawOffsetRad: custom.yawOffsetRad,
      hipsYOffset: custom.hipsYOffset,
      holdDurationSec: custom.holdDurationSec,
      stripHorizontalRootMotion: custom.stripHorizontalRootMotion,
    });
  }

  // Priyanshu special derived clips sharing idle-1 (ADMIRE) and punch (ATTEMPT_ATTACK)
  if (id === 'priyanshu') {
    if (moves['idle-1']) {
      specs.push({
        state: 'ADMIRE',
        url: moves['idle-1'],
        clipName: 'PriyanshuNativeAdmirePose',
        speed: 1.15,
        yawOffsetRad: 0.55,
      });
    }
    if (moves['punch']) {
      specs.push({
        state: 'ATTEMPT_ATTACK',
        url: moves['punch'],
        clipName: 'PriyanshuNativeAttemptAttack',
        speed: 2.1,
      });
    }
  }

  return specs;
}
