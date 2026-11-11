import * as THREE from 'three';

export type CharacterId = 'chinu' | 'priyanshu' | 'modiji';

export type FighterState =
  | 'IDLE'
  | 'RUN'
  | 'ADMIRE'
  | 'PUNCH'
  | 'KICK'
  | 'SIGNATURE'
  | 'MUAY_THAI'
  | 'POSE'
  | 'LOUNGE'
  | 'DANCE'
  | 'CHAMP_POSE'
  | 'ENTRY'
  | 'SPANKED'
  | 'KISS'
  | 'BLUSH'
  | 'LASER_EYES'
  | 'HIT'
  | 'ATTEMPT_ATTACK'
  | 'FALL_BACK'
  | 'GET_UP';

export type CharacterBoneName =
  | 'Hips'
  | 'Torso'
  | 'Head'
  | 'ArmL'
  | 'ArmR'
  | 'LegL'
  | 'LegR';

export interface FighterRig {
  id: CharacterId;
  displayName: string;
  root: THREE.Group;
  modelRoot: THREE.Group;
  bones: Record<CharacterBoneName, THREE.Group>;
  hurtboxMesh: THREE.Mesh;
  hurtbox: THREE.Box3;
  fistAnchor: THREE.Object3D;
  footAnchor: THREE.Object3D;
  headAnchor: THREE.Object3D;
  leftEyeAnchor: THREE.Object3D;
  rightEyeAnchor: THREE.Object3D;
  headVisualGroup?: THREE.Group;
  homePosition: THREE.Vector3;
  facingDirection: 1 | -1;
  bodyMeshes: THREE.Mesh[];
}

export interface FighterPhysicsBody {
  id: CharacterId;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  moveInput: THREE.Vector2;
  radius: number;
  knockedDown: boolean;
  isRunning?: boolean;
  customYaw?: number | null;
}

export interface CombatHitEvent {
  attacker: CharacterId;
  defender: CharacterId;
  move: 'punch' | 'kick';
  damage: number;
  impactPoint: THREE.Vector3;
}

export interface FighterHUDInfo {
  id: CharacterId;
  displayName: string;
  roleTag: string;
  isBossInfinite: boolean;
  hp: number;
  maxHp: number;
}

export interface GameHUDState {
  selectedCharacter: CharacterId;
  opponentCharacter: CharacterId;
  leftFighter: FighterHUDInfo;
  rightFighter: FighterHUDInfo;
  comboHits: number;
  stressReliefPercent: number;
  targetQuip: string;
  targetQuipSpeaker: string;
  isMuted: boolean;
  isCounterSequenceActive: boolean;
  isModalOpen: boolean;
}
