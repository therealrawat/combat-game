import * as THREE from 'three';
import { CharacterId, FighterState } from '../types/game';

export type CpuPoseState = 'POSE' | 'LOUNGE' | 'DANCE' | 'CHAMP_POSE';

export interface CpuFrameContext {
  cpuId: CharacterId;
  playerId: CharacterId;
  cpuPos: THREE.Vector3;
  playerPos: THREE.Vector3;
  cpuState: FighterState;
  playerState: FighterState;
  isPaused: boolean;
  canCpuRun: boolean;
  availablePoseStates: CpuPoseState[];
  onSetMoveInput: (x: number, z: number) => void;
  onTriggerPose: (poseState: CpuPoseState) => void;
  onTriggerAttack: (move: 'punch' | 'kick') => void;
}

type CpuMode = 'IDLE' | 'MOVE';
type MoveIntent = 'APPROACH' | 'CIRCLE' | 'EVADE';

const STRIKE_TRIGGER_RANGE = 1.88;
const PREFERRED_MIN_RANGE = 1.18;
const PREFERRED_MAX_RANGE = 2.22;
const ROPE_AVOID_THRESHOLD = 1.72;

const PLAYER_NON_INTERRUPT_STATES = new Set<FighterState>([
  'POSE',
  'LOUNGE',
  'DANCE',
  'CHAMP_POSE',
  'ENTRY',
  'SIGNATURE',
  'MUAY_THAI',
  'KISS',
  'BLUSH',
  'SPANKED',
  'ATTEMPT_ATTACK',
  'FALL_BACK',
  'GET_UP',
]);

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Lightweight autonomous fighter brain that keeps the CPU opponent lively
 * with ring footwork, showboat poses, and attacks — except in Chinu vs Priyanshu,
 * where Priyanshu strictly only runs, poses, lounges, and admires Chinu.
 */
export class CpuAiController {
  private mode: CpuMode = 'IDLE';
  private moveIntent: MoveIntent = 'CIRCLE';
  private strafeSign: 1 | -1 = 1;
  private speedScale = 0.78;
  private moveEndAt = 0;
  private nextDecisionAt = 0;
  private nextAttackAllowedAt = 0;
  private wasBusyInAction = false;
  private lastPoseState: CpuPoseState | null = null;

  public static canCpuAttack(cpuId: CharacterId, playerId: CharacterId): boolean {
    // Priyanshu can never initiate attacks against Chinu.
    return !(cpuId === 'priyanshu' && playerId === 'chinu');
  }

  public reset(nowMs: number, graceDelayMs = 1350): void {
    this.mode = 'IDLE';
    this.wasBusyInAction = false;
    this.lastPoseState = null;
    this.nextDecisionAt = nowMs + graceDelayMs;
    this.nextAttackAllowedAt = nowMs + graceDelayMs + 550;
  }

  public onCpuInterrupted(nowMs: number, stunMs = 750): void {
    this.mode = 'IDLE';
    this.nextDecisionAt = Math.max(this.nextDecisionAt, nowMs + stunMs);
    this.nextAttackAllowedAt = Math.max(this.nextAttackAllowedAt, nowMs + stunMs + 450);
  }

  public onPlayerAction(nowMs: number, reactionBeatMs = 900): void {
    this.nextAttackAllowedAt = Math.max(this.nextAttackAllowedAt, nowMs + reactionBeatMs);
  }

  public update(nowMs: number, ctx: CpuFrameContext): void {
    const stopMoving = (): void => {
      this.mode = 'IDLE';
      ctx.onSetMoveInput(0, 0);
    };

    if (ctx.isPaused) {
      stopMoving();
      this.wasBusyInAction = false;
      return;
    }

    const inLocomotion = ctx.cpuState === 'IDLE' || ctx.cpuState === 'RUN';
    if (!inLocomotion) {
      stopMoving();
      this.wasBusyInAction = true;
      return;
    }

    if (this.wasBusyInAction) {
      this.wasBusyInAction = false;
      this.nextDecisionAt = Math.max(this.nextDecisionAt, nowMs + randomBetween(420, 820));
      stopMoving();
      return;
    }

    const dx = ctx.playerPos.x - ctx.cpuPos.x;
    const dz = ctx.playerPos.z - ctx.cpuPos.z;
    const dist = Math.hypot(dx, dz);
    const allowAttack =
      CpuAiController.canCpuAttack(ctx.cpuId, ctx.playerId) &&
      !PLAYER_NON_INTERRUPT_STATES.has(ctx.playerState);

    if (this.mode === 'MOVE') {
      if (
        allowAttack &&
        this.moveIntent === 'APPROACH' &&
        dist <= STRIKE_TRIGGER_RANGE &&
        nowMs >= this.nextAttackAllowedAt
      ) {
        stopMoving();
        this.launchAttack(nowMs, ctx);
        return;
      }

      if (nowMs < this.moveEndAt && ctx.canCpuRun) {
        const [vx, vz] = this.computeSteeringVector(ctx.cpuPos, dx, dz, dist);
        ctx.onSetMoveInput(vx, vz);
        return;
      }

      stopMoving();
      this.nextDecisionAt = nowMs + randomBetween(380, 850);
      return;
    }

    ctx.onSetMoveInput(0, 0);
    if (nowMs < this.nextDecisionAt) {
      return;
    }

    this.chooseNextAction(nowMs, dist, allowAttack, ctx);
  }

  private chooseNextAction(
    nowMs: number,
    dist: number,
    allowAttack: boolean,
    ctx: CpuFrameContext
  ): void {
    const canPose = ctx.availablePoseStates.length > 0;
    const roll = Math.random();

    if (allowAttack && nowMs >= this.nextAttackAllowedAt) {
      if (dist > STRIKE_TRIGGER_RANGE + 0.16 && ctx.canCpuRun) {
        this.startMove('APPROACH', randomBetween(950, 1550), 0.88, nowMs);
        return;
      }
      if (roll < 0.5) {
        this.launchAttack(nowMs, ctx);
        return;
      }
      if (roll < 0.82 && ctx.canCpuRun) {
        const intent: MoveIntent = dist < PREFERRED_MIN_RANGE ? 'EVADE' : 'CIRCLE';
        this.startMove(intent, randomBetween(680, 1180), 0.78, nowMs);
        return;
      }
      if (canPose) {
        this.triggerVarietyPose(nowMs, ctx);
        return;
      }
    }

    // Playful / evasive / pose cadence (also the full repertoire for Priyanshu vs Chinu)
    if (ctx.canCpuRun && roll < 0.58) {
      let intent: MoveIntent = 'CIRCLE';
      if (dist < PREFERRED_MIN_RANGE) {
        intent = 'EVADE';
      } else if (dist > PREFERRED_MAX_RANGE) {
        intent = 'APPROACH';
      }
      const speed = ctx.cpuId === 'priyanshu' && ctx.playerId === 'chinu' ? 0.82 : 0.74;
      this.startMove(intent, randomBetween(850, 1500), speed, nowMs);
      return;
    }

    if (canPose && roll < 0.86) {
      this.triggerVarietyPose(nowMs, ctx);
      return;
    }

    this.nextDecisionAt = nowMs + randomBetween(550, 1050);
  }

  private startMove(
    intent: MoveIntent,
    durationMs: number,
    speedScale: number,
    nowMs: number
  ): void {
    this.mode = 'MOVE';
    this.moveIntent = intent;
    this.speedScale = speedScale;
    this.strafeSign = Math.random() < 0.5 ? 1 : -1;
    this.moveEndAt = nowMs + durationMs;
  }

  private launchAttack(nowMs: number, ctx: CpuFrameContext): void {
    if (!CpuAiController.canCpuAttack(ctx.cpuId, ctx.playerId)) return;
    const move: 'punch' | 'kick' = Math.random() < 0.58 ? 'punch' : 'kick';
    this.mode = 'IDLE';
    this.nextAttackAllowedAt = nowMs + randomBetween(2200, 3400);
    this.nextDecisionAt = nowMs + randomBetween(850, 1350);
    ctx.onTriggerAttack(move);
  }

  private triggerVarietyPose(nowMs: number, ctx: CpuFrameContext): void {
    const pool = ctx.availablePoseStates;
    if (pool.length === 0) return;

    const candidates =
      pool.length > 1 ? pool.filter((p) => p !== this.lastPoseState) : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastPoseState = chosen;
    this.mode = 'IDLE';
    this.nextDecisionAt = nowMs + randomBetween(2100, 2900);
    ctx.onTriggerPose(chosen);
  }

  private computeSteeringVector(
    cpuPos: THREE.Vector3,
    dx: number,
    dz: number,
    dist: number
  ): [number, number] {
    const safeDist = dist > 0.001 ? dist : 1;
    const rx = dist > 0.001 ? dx / safeDist : 1;
    const rz = dist > 0.001 ? dz / safeDist : 0;

    // Perpendicular tangent for circling around the player
    const tx = -rz * this.strafeSign;
    const tz = rx * this.strafeSign;

    let radialWeight = 0.1;
    let tangentWeight = 0.95;

    if (this.moveIntent === 'APPROACH') {
      radialWeight = 0.85;
      tangentWeight = 0.35;
    } else if (this.moveIntent === 'EVADE' || dist < PREFERRED_MIN_RANGE) {
      radialWeight = -0.65;
      tangentWeight = 0.85;
    } else if (dist > PREFERRED_MAX_RANGE) {
      radialWeight = 0.65;
      tangentWeight = 0.55;
    }

    let vx = rx * radialWeight + tx * tangentWeight;
    let vz = rz * radialWeight + tz * tangentWeight;

    // Gentle ring-rope containment pull so the CPU curves smoothly around the canvas
    if (Math.abs(cpuPos.x) > ROPE_AVOID_THRESHOLD) {
      vx += -Math.sign(cpuPos.x) * 0.95;
    }
    if (Math.abs(cpuPos.z) > ROPE_AVOID_THRESHOLD) {
      vz += -Math.sign(cpuPos.z) * 0.95;
    }

    const len = Math.hypot(vx, vz);
    if (len < 0.001) return [0, 0];
    return [(vx / len) * this.speedScale, (vz / len) * this.speedScale];
  }
}

