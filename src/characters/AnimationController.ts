import * as THREE from 'three';
import { FighterRig, FighterState } from '../types/game';
import { createProceduralClips } from './ProceduralClips';

const ONE_SHOT_STATES = new Set<FighterState>([
  'PUNCH',
  'KICK',
  'SIGNATURE',
  'MUAY_THAI',
  'POSE',
  'LOUNGE',
  'DANCE',
  'CHAMP_POSE',
  'ENTRY',
  'SPANKED',
  'KISS',
  'BLUSH',
  'LASER_EYES',
  'HIT',
  'ATTEMPT_ATTACK',
  'FALL_BACK',
  'GET_UP',
]);

const CLAMP_STATES = new Set<FighterState>(['FALL_BACK', 'ATTEMPT_ATTACK', 'SPANKED', 'LASER_EYES']);

export type AnimationFinishedHandler = (finishedState: FighterState) => void;

/**
 * Modular AnimationMixer state machine wrapper.
 * Owns THREE.AnimationMixer, cross-fades between FighterStates, and supports
 * replacing procedural clips with GLTF/GLB clips when real models are integrated.
 */
export class AnimationController {
  private readonly mixer: THREE.AnimationMixer;
  private readonly rootObject: THREE.Object3D;
  private readonly actions = new Map<FighterState, THREE.AnimationAction>();
  private readonly clipSpeeds = new Map<FighterState, number>();
  private currentState: FighterState = 'IDLE';
  private onFinishedCallback?: AnimationFinishedHandler;

  constructor(rig: FighterRig, onFinished?: AnimationFinishedHandler) {
    this.rootObject = rig.modelRoot;
    this.mixer = new THREE.AnimationMixer(rig.modelRoot);
    this.onFinishedCallback = onFinished;

    const clips = createProceduralClips();
    this.registerClips(clips);

    // Start in IDLE
    const idleAction = this.actions.get('IDLE');
    idleAction?.play();

    this.mixer.addEventListener('finished', (event) => {
      const finishedAction = event.action;
      for (const [state, action] of this.actions.entries()) {
        if (action === finishedAction && state === this.currentState) {
          this.onFinishedCallback?.(state);
          break;
        }
      }
    });
  }

  public getState(): FighterState {
    return this.currentState;
  }

  public hasState(state: FighterState): boolean {
    return this.actions.has(state);
  }

  public setOnFinished(callback: AnimationFinishedHandler): void {
    this.onFinishedCallback = callback;
  }

  /**
   * Registers or replaces AnimationClips (usable for both procedural clips and GLB clips).
   */
  public registerClips(
    clips: Partial<Record<FighterState, THREE.AnimationClip>>,
    clipSpeeds?: Partial<Record<FighterState, number>>,
    clipRepetitions?: Partial<Record<FighterState, number>>
  ): void {
    for (const [stateKey, clip] of Object.entries(clips) as Array<
      [FighterState, THREE.AnimationClip | undefined]
    >) {
      if (!clip) continue;
      const existing = this.actions.get(stateKey);
      const isCurrentlyActive = stateKey === this.currentState;
      if (existing) {
        existing.stop();
        this.mixer.uncacheAction(existing.getClip());
      }

      const action = this.mixer.clipAction(clip);
      const speed = clipSpeeds?.[stateKey] ?? 1;
      const reps = clipRepetitions?.[stateKey] ?? 1;
      this.clipSpeeds.set(stateKey, speed);
      action.setEffectiveTimeScale(speed);
      if (ONE_SHOT_STATES.has(stateKey)) {
        action.setLoop(reps > 1 ? THREE.LoopRepeat : THREE.LoopOnce, reps);
        action.clampWhenFinished = CLAMP_STATES.has(stateKey);
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      this.actions.set(stateKey, action);

      if (isCurrentlyActive) {
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.reset();
        action.play();
      }
    }
  }

  /**
   * Uncaches procedural bindings when a fighter's rig is swapped with a GLB skeleton,
   * binds the replacement clips, and smoothly resumes playback.
   */
  public swapRigClips(
    clips: Partial<Record<FighterState, THREE.AnimationClip>>,
    resumeState: FighterState = 'IDLE',
    clipSpeeds?: Partial<Record<FighterState, number>>,
    clipRepetitions?: Partial<Record<FighterState, number>>
  ): void {
    this.mixer.stopAllAction();
    for (const action of this.actions.values()) {
      this.mixer.uncacheAction(action.getClip());
    }
    this.actions.clear();
    this.clipSpeeds.clear();
    this.mixer.uncacheRoot(this.rootObject);

    this.registerClips(clips, clipSpeeds, clipRepetitions);

    const targetState = this.actions.has(resumeState) ? resumeState : 'IDLE';
    const nextAction = this.actions.get(targetState);
    if (nextAction) {
      nextAction.enabled = true;
      nextAction.setEffectiveTimeScale(this.clipSpeeds.get(targetState) ?? 1);
      nextAction.reset();
      nextAction.play();
      this.currentState = targetState;
    }
  }

  /**
   * Transitions cleanly to a target FighterState using AnimationMixer crossFading.
   */
  public transitionTo(
    nextState: FighterState,
    fadeDuration = 0.08,
    restartIfSame = false
  ): void {
    if (nextState === this.currentState && !restartIfSame) {
      return;
    }

    const prevAction = this.actions.get(this.currentState);
    const nextAction = this.actions.get(nextState);
    if (!nextAction) return;

    nextAction.enabled = true;
    const speed = this.clipSpeeds.get(nextState) ?? 1;
    nextAction.setEffectiveTimeScale(speed);
    nextAction.setEffectiveWeight(1);
    nextAction.reset();
    nextAction.play();

    if (prevAction && prevAction !== nextAction) {
      prevAction.enabled = true;
      prevAction.crossFadeTo(nextAction, fadeDuration, false);
    }

    this.currentState = nextState;
  }

  public update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds);
  }
}
