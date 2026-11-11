import * as THREE from 'three';
import gsap from 'gsap';
import { SoundManager } from '../audio/SoundManager';
import { AnimationController } from '../characters/AnimationController';
import { CharacterFactory, LoadedNativeGLBClips } from '../characters/CharacterFactory';
import { createHumanoidGLBClips } from '../characters/GLBClipsBuilder';
import { CpuAiController, CpuPoseState } from '../combat/CpuAiController';
import { PhysicsCombatSystem } from '../combat/PhysicsCombatSystem';
import { EffectsManager } from '../effects/EffectsManager';
import { CharacterId, FighterRig } from '../types/game';
import { UIManager } from '../ui/UIManager';
import { ArenaBuilder } from './ArenaBuilder';
import { SceneManager } from './SceneManager';

const FIGHTER_MAX_HP = 100;
const PUNCH_DAMAGE = 15;
const DIRECT_KICK_DAMAGE = 22;
const CPU_PUNCH_DAMAGE = 10;
const CPU_KICK_DAMAGE = 14;
const COUNTER_KICK_DAMAGE = 25;
const OPPONENT_STRIKE_DAMAGE = 16;
const SIGNATURE_SLAP_1_DAMAGE = 10;
const SIGNATURE_SLAP_2_DAMAGE = 10;
const SIGNATURE_SLAP_3_DAMAGE = 25;
const FREEZE_TIME_SCALE = 0.03;
const FREEZE_DURATION_MS = 440;

const FIGHTER_META: Record<
  CharacterId,
  { displayName: string; defaultTag: string; isBossInfinite: boolean }
> = {
  chinu: { displayName: 'Chinu', defaultTag: 'REAL BOSS', isBossInfinite: true },
  priyanshu: { displayName: 'Priyanshu', defaultTag: 'TARGET', isBossInfinite: false },
  modiji: { displayName: 'Modiji', defaultTag: 'LASER TITAN', isBossInfinite: false },
};

const PRIYANSHU_HIT_QUIPS = [
  'Ow! Watch the glasses!',
  'Okay okay, my bad!!',
  'Why am I always the target?!',
  'Wait—time out!!',
  'Tell Chinu I surrender!',
  'Not the face!',
] as const;

const MODIJI_HIT_QUIPS = [
  'Whoa—watch the spectacles!! 👓',
  'Mitrooon—not the kurta!! 😅',
  'My Laser Eyes are warming up!! 🔥',
  'Temporary tactical retreat!! 😵',
  'That was uncalled for!! ⚡',
] as const;

const MODIJI_STRIKE_QUIPS = [
  'Precision strike incoming!! ⚡',
  'Mitron, duck this!! 🥊',
  'Superpower uppercut!! 💥',
] as const;

const MODIJI_LASER_QUIPS = [
  'MITRON!! WITNESS LASER EYES!! 👁️🔥',
  'THERMAL LASER VISION — FULL POWER!! 🔥⚡',
  'NOBODY DODGES THE GAZE!! 😎🔥',
] as const;

const PRIYANSHU_BOSS_QUIPS = [
  'Okay, you ARE the real boss!',
  'Instant regret!!',
  'Lesson learned, ma’am!',
] as const;

const PRIYANSHU_KISS_QUIPS = [
  'Worth every single punch!! 💖',
  'Mwah!! Best boss ever!',
  'o yeah mommy 💕',
] as const;

/**
 * Central orchestrator connecting SceneManager, SoundManager, AnimationControllers,
 * PhysicsCombatSystem, EffectsManager, and UIManager.
 */
export class GameController {
  private readonly sceneManager: SceneManager;
  private readonly sound: SoundManager;
  private readonly physics: PhysicsCombatSystem;
  private readonly cpuAi = new CpuAiController();
  private readonly effects: EffectsManager;
  private readonly ui: UIManager;

  private readonly rigs = new Map<CharacterId, FighterRig>();
  private readonly anims = new Map<CharacterId, AnimationController>();
  private readonly fighterHp = new Map<CharacterId, number>([
    ['chinu', FIGHTER_MAX_HP],
    ['priyanshu', FIGHTER_MAX_HP],
    ['modiji', FIGHTER_MAX_HP],
  ]);

  private selectedCharacter: CharacterId = 'chinu';
  private opponentCharacter: CharacterId = 'priyanshu';
  private leftFighterId: CharacterId = 'chinu';
  private rightFighterId: CharacterId = 'priyanshu';

  private comboHits = 0;
  private stressReliefPercent = 0;
  private targetQuip = '';
  private targetQuipSpeaker = 'Priyanshu';
  private lastPlayerQuipAt = 0;
  private quipIndex = 0;
  private isCinematicActive = false;
  private pendingPriyanshuLounge = false;
  private pendingChinuEntry = false;
  private chinuEntryTween?: gsap.core.Tween;
  private disposed = false;
  private gameTimeScale = 1;
  private animFrameId = 0;
  private lastTimestamp = 0;

  private activeTimeouts: number[] = [];
  private koRecoveryTimeoutId: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.sceneManager = new SceneManager(canvas);
    this.sound = new SoundManager();
    ArenaBuilder.build(this.sceneManager.scene);

    this.physics = new PhysicsCombatSystem();
    this.effects = new EffectsManager(this.sceneManager.scene);

    const chinuRig = CharacterFactory.createFighter('chinu', new THREE.Vector3(-1.15, 0, 0), 1);
    const priyanshuRig = CharacterFactory.createFighter(
      'priyanshu',
      new THREE.Vector3(1.15, 0, 0),
      -1
    );
    const modijiRig = CharacterFactory.createFighter('modiji', new THREE.Vector3(1.15, 0, 0), -1);
    modijiRig.root.visible = false;

    const allRigs: FighterRig[] = [chinuRig, priyanshuRig, modijiRig];
    for (const rig of allRigs) {
      this.rigs.set(rig.id, rig);
      this.sceneManager.scene.add(rig.root);
      this.physics.registerFighter(rig);

      const anim = new AnimationController(rig, (finishedState) => {
        if (
          finishedState === 'HIT' ||
          finishedState === 'BLUSH' ||
          finishedState === 'GET_UP'
        ) {
          this.physics.setKnockedDown(rig.id, false);
        }
        if (
          finishedState === 'POSE' ||
          finishedState === 'LOUNGE' ||
          finishedState === 'DANCE' ||
          finishedState === 'CHAMP_POSE' ||
          finishedState === 'ENTRY' ||
          finishedState === 'HIT'
        ) {
          this.physics.setLocomotionState(rig.id, false, null);
        }
        if (
          rig.id === 'chinu' &&
          (finishedState === 'POSE' || finishedState === 'DANCE' || finishedState === 'CHAMP_POSE')
        ) {
          this.resetPriyanshuAdmire();
        }
        if (
          finishedState === 'PUNCH' ||
          finishedState === 'KICK' ||
          finishedState === 'SIGNATURE' ||
          finishedState === 'MUAY_THAI' ||
          finishedState === 'POSE' ||
          finishedState === 'LOUNGE' ||
          finishedState === 'DANCE' ||
          finishedState === 'CHAMP_POSE' ||
          finishedState === 'ENTRY' ||
          finishedState === 'KISS' ||
          finishedState === 'HIT' ||
          finishedState === 'BLUSH' ||
          finishedState === 'GET_UP'
        ) {
          anim.transitionTo('IDLE', 0.08);
        }
      });
      this.anims.set(rig.id, anim);
    }

    this.physics.setActivePair(this.leftFighterId, this.rightFighterId, false);
    this.physics.setOnRopeBounce((_id, impactPos) => {
      this.sound.playRopeBoing();
      this.effects.spawnRopeBoing(impactPos);
    });

    this.ui = new UIManager(canvas, {
      onPrimaryAction: () => this.handlePrimaryAction(),
      onKickAction: () => this.handleKickAction(),
      onSignatureAction: () => this.handleSignatureAction(),
      onCounterAction: () => this.handleCounterAction(),
      onMuayThaiAction: () => this.triggerMuayThaiAction(),
      onBossPoseAction: () => this.triggerPoseAction(),
      onLoungePoseAction: () => this.triggerSecondaryPoseAction(),
      onChampPoseAction: () => this.triggerChinuChampPoseAction(),
      onRingEntryAction: () => this.triggerRingEntryAction(false),
      onSelectCharacter: (char) => this.selectCharacter(char),
      onSelectOpponent: (opp) => this.selectOpponent(opp),
      onSelectMatchup: (player, opp) => this.setMatchup(player, opp),
      onHealPriyanshu: () => this.handleHealAction(),
      onToggleMute: () => {
        this.sound.toggleMute();
        this.syncHUD();
      },
      onMoveInput: (x, z) => this.physics.setMoveInput(this.selectedCharacter, x, z),
      onCanvasPointerDown: (clientX, clientY) => this.handleCanvasClick(clientX, clientY),
      onUserGesture: () => this.sound.unlock(),
    });

    this.cpuAi.reset(performance.now(), 1350);
    this.syncHUD();
    void this.initAllCharactersGLB();
  }

  private async initAllCharactersGLB(): Promise<void> {
    // Stage 1: Load and swap all 3 base GLB models immediately before heavy animation bundles
    await Promise.all((['chinu', 'priyanshu', 'modiji'] as CharacterId[]).map((id) => this.initCharacterBaseGLB(id)));
    if (this.disposed) return;

    // Stage 2: Register native Mixamo/convention GLB animation overrides progressively
    await Promise.all((['chinu', 'priyanshu', 'modiji'] as CharacterId[]).map((id) => this.initCharacterNativeClips(id)));
  }

  private async initCharacterBaseGLB(id: CharacterId): Promise<void> {
    const scene = await CharacterFactory.loadCharacterGLBModel(id);
    if (!scene || this.disposed) return;

    const rig = this.rigs.get(id);
    const anim = this.anims.get(id);
    if (!rig || !anim) return;

    const baseClips = createHumanoidGLBClips(scene);
    const applySwap = (): void => {
      if (this.disposed) return;
      if (this.isCinematicActive) {
        this.scheduleUnscaled(applySwap, 120);
        return;
      }

      const activeState = anim.getState();
      CharacterFactory.swapWithGLBModel(rig, scene);
      anim.swapRigClips(baseClips, activeState);
    };

    applySwap();
  }

  private async initCharacterNativeClips(id: CharacterId): Promise<void> {
    const anim = this.anims.get(id);
    if (!anim) return;

    const applyBatch = (batch: LoadedNativeGLBClips): void => {
      if (this.disposed) return;
      if (this.isCinematicActive) {
        this.scheduleUnscaled(() => applyBatch(batch), 120);
        return;
      }
      anim.registerClips(batch.clips, batch.clipSpeeds, batch.clipRepetitions);
      if (
        id === 'priyanshu' &&
        this.pendingPriyanshuLounge &&
        anim.hasState('LOUNGE') &&
        this.selectedCharacter === 'priyanshu'
      ) {
        this.pendingPriyanshuLounge = false;
        this.triggerLoungePoseAction();
      }
      if (
        id === 'chinu' &&
        this.pendingChinuEntry &&
        anim.hasState('ENTRY') &&
        this.selectedCharacter === 'chinu'
      ) {
        this.pendingChinuEntry = false;
        this.triggerChinuEntryAction(false);
      }
    };

    await CharacterFactory.loadNativeGLBClips(id, applyBatch);
  }

  public start(): void {
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  private readonly loop = (now: number): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const rawDelta = Math.min((now - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = now;

    const scaledDelta = rawDelta * this.gameTimeScale;

    this.updateCpuAi();
    this.updateLocomotionAnimations();
    this.anims.get(this.leftFighterId)?.update(scaledDelta);
    this.anims.get(this.rightFighterId)?.update(scaledDelta);
    this.physics.step(scaledDelta, this.selectedCharacter);

    this.sceneManager.render();
  };

  private updateCpuAi(): void {
    const cpuId = this.opponentCharacter;
    const playerId = this.selectedCharacter;
    const cpuAnim = this.anims.get(cpuId);
    const playerAnim = this.anims.get(playerId);
    const cpuPos = this.physics.getBodyPosition(cpuId);
    const playerPos = this.physics.getBodyPosition(playerId);
    if (!cpuAnim || !playerAnim || !cpuPos || !playerPos) return;

    const candidatePoses: CpuPoseState[] = ['POSE', 'LOUNGE', 'DANCE', 'CHAMP_POSE'];
    const availablePoseStates = candidatePoses.filter((state) => cpuAnim.hasState(state));

    this.cpuAi.update(performance.now(), {
      cpuId,
      playerId,
      cpuPos,
      playerPos,
      cpuState: cpuAnim.getState(),
      playerState: playerAnim.getState(),
      isPaused:
        this.disposed ||
        this.isCinematicActive ||
        this.ui.isModalOpen() ||
        this.koRecoveryTimeoutId !== null ||
        this.physics.isKnockedDown(cpuId) ||
        this.physics.isKnockedDown(playerId),
      canCpuRun: cpuAnim.hasState('RUN'),
      availablePoseStates,
      onSetMoveInput: (x, z) => this.physics.setMoveInput(cpuId, x, z),
      onTriggerPose: (poseState) => this.triggerCpuPose(cpuId, poseState),
      onTriggerAttack: (move) => this.triggerCpuAttack(cpuId, playerId, move),
    });
  }

  private updateLocomotionAnimations(): void {
    for (const id of [this.leftFighterId, this.rightFighterId]) {
      const anim = this.anims.get(id);
      if (!anim) continue;

      const currentState = anim.getState();
      const moveInput = this.physics.getMoveInput(id);
      const isMoving = Boolean(
        !this.isCinematicActive &&
          !this.physics.isKnockedDown(id) &&
          moveInput &&
          moveInput.lengthSq() > 0.001
      );
      const canStartRun =
        currentState === 'IDLE' ||
        currentState === 'RUN' ||
        (id === this.selectedCharacter &&
          (currentState === 'ADMIRE' || currentState === 'ENTRY'));

      if (isMoving && moveInput && anim.hasState('RUN') && canStartRun) {
        if (id === 'chinu' && currentState === 'ENTRY') {
          this.cancelChinuEntry();
        }
        const moveYaw = Math.atan2(moveInput.x, moveInput.y);
        this.physics.setLocomotionState(id, true, moveYaw);
        anim.transitionTo('RUN', 0.1);
      } else if (!isMoving && currentState === 'RUN') {
        this.physics.setLocomotionState(id, false, null);
        anim.transitionTo('IDLE', 0.14);
      }
    }
  }

  private scheduleUnscaled(callback: () => void, delayMs: number): void {
    const id = window.setTimeout(callback, delayMs);
    this.activeTimeouts.push(id);
  }

  public setMatchup(player: CharacterId, opponent: CharacterId): void {
    const nextOpponent: CharacterId =
      opponent === player ? (player === 'priyanshu' ? 'modiji' : 'priyanshu') : opponent;

    this.pendingPriyanshuLounge = false;
    this.pendingChinuEntry = false;
    this.cancelChinuEntry();
    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }
    this.ui.showKOBanner(false);
    this.physics.setMoveInput(this.selectedCharacter, 0, 0);

    const prevPairSet = new Set([this.leftFighterId, this.rightFighterId]);
    const pairChanged = !prevPairSet.has(player) || !prevPairSet.has(nextOpponent);

    let newLeft: CharacterId;
    let newRight: CharacterId;
    if (player === 'chinu' || nextOpponent === 'chinu') {
      newLeft = 'chinu';
      newRight = player === 'chinu' ? nextOpponent : player;
    } else if (!pairChanged) {
      newLeft = this.leftFighterId;
      newRight = this.rightFighterId;
    } else {
      newLeft = player;
      newRight = nextOpponent;
    }

    this.selectedCharacter = player;
    this.opponentCharacter = nextOpponent;
    this.leftFighterId = newLeft;
    this.rightFighterId = newRight;

    for (const [id, rig] of this.rigs.entries()) {
      rig.root.visible = id === newLeft || id === newRight;
      this.physics.setMoveInput(id, 0, 0);
      this.physics.setLocomotionState(id, false, null);
      if (pairChanged) {
        this.physics.setKnockedDown(id, false);
        this.anims.get(id)?.transitionTo('IDLE', 0.05, true);
        if (!FIGHTER_META[id].isBossInfinite) {
          this.fighterHp.set(id, FIGHTER_MAX_HP);
        }
      }
    }

    this.physics.setActivePair(newLeft, newRight, pairChanged);
    this.sound.playClick();
    this.syncHUD();

    const hasAutoEntry = player === 'chinu' && this.anims.get('chinu')?.hasState('ENTRY');
    this.cpuAi.reset(performance.now(), hasAutoEntry ? 1650 : 1350);
    if (hasAutoEntry) {
      this.triggerChinuEntryAction(true);
    }
  }

  public selectCharacter(character: CharacterId): void {
    if (this.isCinematicActive) return;
    if (character === this.selectedCharacter) {
      this.sound.playClick();
      return;
    }
    const nextOpp =
      character === this.opponentCharacter ? this.selectedCharacter : this.opponentCharacter;
    this.setMatchup(character, nextOpp);
  }

  public selectOpponent(opponent: CharacterId): void {
    if (this.isCinematicActive) return;
    if (opponent === this.opponentCharacter) {
      this.sound.playClick();
      return;
    }
    const nextPlayer =
      opponent === this.selectedCharacter ? this.opponentCharacter : this.selectedCharacter;
    this.setMatchup(nextPlayer, opponent);
  }

  private handleCanvasClick(clientX: number, clientY: number): void {
    const leftRig = this.rigs.get(this.leftFighterId);
    const rightRig = this.rigs.get(this.rightFighterId);
    const activeRigs = [leftRig, rightRig].filter((r): r is FighterRig => Boolean(r));

    const hit = this.sceneManager.pickFighterAt(clientX, clientY, activeRigs);
    if (!hit) return;

    if (hit.rig.id === this.opponentCharacter) {
      if (this.opponentCharacter === 'chinu') {
        this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      } else {
        this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, 'punch', hit.point);
      }
    } else if (hit.rig.id === this.selectedCharacter) {
      this.triggerPoseAction(hit.point);
    }
  }

  private handlePrimaryAction(): void {
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, 'punch');
  }

  private handleKickAction(): void {
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    this.triggerStandardAttack(this.selectedCharacter, this.opponentCharacter, 'kick');
  }

  private handleSignatureAction(): void {
    if (this.opponentCharacter === 'chinu') {
      this.triggerAction2Counter(this.selectedCharacter, 'chinu');
      return;
    }
    if (this.selectedCharacter === 'chinu') {
      this.triggerSignatureMove(this.opponentCharacter);
      return;
    }
    if (this.selectedCharacter === 'modiji') {
      this.triggerModijiLaserSignature(this.opponentCharacter);
      return;
    }
    this.triggerTurboComboSignature(this.selectedCharacter, this.opponentCharacter);
  }

  private handleCounterAction(): void {
    if (this.selectedCharacter === 'chinu' || this.opponentCharacter === 'chinu') {
      const challenger =
        this.opponentCharacter === 'chinu' ? this.selectedCharacter : this.opponentCharacter;
      this.triggerAction2Counter(challenger, 'chinu');
      return;
    }
    this.triggerOpponentStrikeBack(this.opponentCharacter, this.selectedCharacter);
  }

  private handleHealAction(): void {
    const isChinuPriyanshu =
      (this.leftFighterId === 'chinu' && this.rightFighterId === 'priyanshu') ||
      (this.leftFighterId === 'priyanshu' && this.rightFighterId === 'chinu');
    if (isChinuPriyanshu) {
      this.triggerKissHealSequence();
    } else {
      this.triggerMatchHealReset();
    }
  }

  private getStrikeImpactDelayMs(attackerId: CharacterId, isKick: boolean): number {
    if (attackerId === 'chinu') return isKick ? 380 : 260;
    if (attackerId === 'priyanshu') return isKick ? 320 : 250;
    if (attackerId === 'modiji') return isKick ? 330 : 280;
    return isKick ? 190 : 150;
  }

  private setQuip(speaker: string, text: string, fromPlayerAction = true): void {
    this.targetQuipSpeaker = speaker;
    this.targetQuip = text;
    if (fromPlayerAction) {
      this.lastPlayerQuipAt = performance.now();
    }
  }

  private canShowCpuQuip(): boolean {
    return performance.now() - this.lastPlayerQuipAt > 2800;
  }

  private applyNonBossStrikeHit(
    defenderId: CharacterId,
    attackerId: CharacterId,
    defenderRig: FighterRig,
    defenderAnim: AnimationController,
    impactPoint: THREE.Vector3,
    damage: number,
    opts: {
      knockback: number;
      jitter: number;
      label?: string;
      comboNote: number;
      shakeIntensity: number;
      shakeDuration: number;
    }
  ): void {
    this.physics.setLocomotionState(defenderId, false, null);
    defenderAnim.transitionTo('HIT', 0.04, true);
    this.physics.applyDirectionalImpulse(
      defenderId,
      attackerId,
      opts.knockback,
      (Math.random() - 0.5) * opts.jitter
    );
    this.flashTintFeedback(defenderRig, 0xffffff, 0.72, 0.22);
    this.wobbleHeadOnImpact(defenderRig);
    this.effects.spawnPunchImpact(impactPoint, damage, opts.label);
    this.sound.playPunchHit(opts.comboNote);
    this.sceneManager.triggerShake(opts.shakeIntensity, opts.shakeDuration);
  }

  /**
   * Standard Punch or Kick attack from attacker to non-boss defender.
   */
  public triggerStandardAttack(
    attackerId: CharacterId,
    defenderId: CharacterId,
    move: 'punch' | 'kick',
    clickedPoint?: THREE.Vector3
  ): void {
    if (this.isCinematicActive) return;
    if (attackerId === 'priyanshu' && defenderId === 'chinu') {
      this.triggerAction2Counter('priyanshu', 'chinu');
      return;
    }

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (defenderState === 'FALL_BACK' || defenderState === 'GET_UP') {
      return;
    }

    const isKick = move === 'kick';
    const damage = isKick ? DIRECT_KICK_DAMAGE : PUNCH_DAMAGE;

    this.cancelChinuEntry();
    if (attackerId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    if (attackerId === this.selectedCharacter) {
      this.cpuAi.onPlayerAction(performance.now(), 950);
    }
    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.sound.playWhoosh(isKick ? 0.85 : 1.05);
    attackerAnim.transitionTo(isKick ? 'KICK' : 'PUNCH', 0.05, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, isKick ? 2.9 : 2.4);

    const impactDelayMs = this.getStrikeImpactDelayMs(attackerId, isKick);

    this.scheduleUnscaled(() => {
      if (this.isCinematicActive || this.disposed) return;

      const currentState = defenderAnim.getState();
      if (currentState === 'FALL_BACK' || currentState === 'GET_UP') return;

      const hit = this.physics.resolveStrike(attackerId, defenderId, move, damage);
      const impactPoint =
        clickedPoint ??
        (hit
          ? hit.impactPoint
          : defenderRig.root.position.clone().setY(isKick ? 1.4 : 1.5));

      if (defenderId === this.opponentCharacter) {
        this.cpuAi.onCpuInterrupted(performance.now(), 750);
      }
      this.applyNonBossStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, impactPoint, damage, {
        knockback: isKick ? -6.6 : -4.4,
        jitter: isKick ? 1.8 : 1.4,
        label: isKick ? 'SMACK!' : undefined,
        comboNote: this.comboHits + (isKick ? 3 : 1),
        shakeIntensity: isKick ? 0.2 : 0.14,
        shakeDuration: isKick ? 0.26 : 0.2,
      });

      this.recordHitQuip(defenderId);
      this.applyDamageToFighter(defenderId, attackerId, damage, false);
    }, impactDelayMs);
  }

  private triggerCpuAttack(
    attackerId: CharacterId,
    defenderId: CharacterId,
    move: 'punch' | 'kick'
  ): void {
    if (this.isCinematicActive || !CpuAiController.canCpuAttack(attackerId, defenderId)) {
      return;
    }

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (defenderState === 'FALL_BACK' || defenderState === 'GET_UP') return;

    const isKick = move === 'kick';
    const damage = isKick ? CPU_KICK_DAMAGE : CPU_PUNCH_DAMAGE;

    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.sound.playWhoosh(isKick ? 0.9 : 1.08);
    attackerAnim.transitionTo(isKick ? 'KICK' : 'PUNCH', 0.06, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, isKick ? 2.5 : 2.1);

    const impactDelayMs = this.getStrikeImpactDelayMs(attackerId, isKick);

    this.scheduleUnscaled(() => {
      if (
        this.isCinematicActive ||
        this.disposed ||
        attackerId !== this.opponentCharacter ||
        defenderId !== this.selectedCharacter
      ) {
        return;
      }

      const currentState = defenderAnim.getState();
      if (currentState === 'FALL_BACK' || currentState === 'GET_UP') return;

      const hit = this.physics.resolveStrike(attackerId, defenderId, move, damage);
      if (!hit) return;

      if (FIGHTER_META[defenderId].isBossInfinite) {
        // Real Boss armor shrugs off CPU strikes without damage or hit-stun
        this.flashTintFeedback(defenderRig, 0xffd426, 0.5, 0.2);
        this.effects.spawnPunchImpact(hit.impactPoint, 0, 'UNBREAKABLE! 👑');
        this.sound.playPunchHit(1);
        if (this.canShowCpuQuip()) {
          this.setQuip(
            FIGHTER_META[attackerId].displayName,
            attackerId === 'modiji' ? 'My spectacles!! Pure steel Boss!! 😵' : 'Zero effect on the Boss!',
            false
          );
          this.syncHUD();
        }
        return;
      }

      this.applyNonBossStrikeHit(defenderId, attackerId, defenderRig, defenderAnim, hit.impactPoint, damage, {
        knockback: isKick ? -5.2 : -3.8,
        jitter: 1.1,
        label: isKick ? 'POW!' : undefined,
        comboNote: isKick ? 3 : 1,
        shakeIntensity: isKick ? 0.16 : 0.11,
        shakeDuration: 0.18,
      });

      if (this.canShowCpuQuip()) {
        const speaker = FIGHTER_META[attackerId].displayName;
        const quip =
          attackerId === 'chinu'
            ? 'Watch yourself around the Real Boss! 👑'
            : attackerId === 'modiji'
              ? MODIJI_STRIKE_QUIPS[this.quipIndex % MODIJI_STRIKE_QUIPS.length]
              : 'Gotcha cleanly!! 🥊';
        this.quipIndex += 1;
        this.setQuip(speaker, quip, false);
      }

      this.applyDamageToFighter(defenderId, attackerId, damage, false, false);
    }, impactDelayMs);
  }

  private cancelChinuEntry(): void {
    if (this.chinuEntryTween) {
      this.chinuEntryTween.kill();
      this.chinuEntryTween = undefined;
    }
  }

  private resetPriyanshuAdmire(): void {
    const priyanshuAnim = this.anims.get('priyanshu');
    if (priyanshuAnim?.getState() === 'ADMIRE') {
      this.physics.setLocomotionState('priyanshu', false, null);
      priyanshuAnim.transitionTo('IDLE', 0.14);
    }
  }

  private triggerPriyanshuAdmireOnChinuPose(): void {
    if (this.leftFighterId !== 'priyanshu' && this.rightFighterId !== 'priyanshu') return;
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!priyanshuAnim) return;
    if (this.selectedCharacter === 'priyanshu' && priyanshuAnim.getState() !== 'IDLE') {
      return;
    }
    if (this.opponentCharacter === 'priyanshu') {
      this.cpuAi.onCpuInterrupted(performance.now(), 600);
    }
    // Priyanshu specifically drops into calm admiring idle (priyanshu-idle-1.glb) when Chinu poses
    this.physics.setKnockedDown('priyanshu', false);
    this.physics.setMoveInput('priyanshu', 0, 0);
    this.physics.setLocomotionState('priyanshu', false, null);
    priyanshuAnim.transitionTo('ADMIRE', 0.14, true);
  }

  private getPoseVisualMeta(
    fighterId: CharacterId,
    state: CpuPoseState
  ): { customYaw: number | null; sparkleY: number } {
    if (state === 'DANCE') return { customYaw: -0.1, sparkleY: 1.65 };
    if (state === 'CHAMP_POSE') return { customYaw: 0.25, sparkleY: 1.75 };
    if (state === 'LOUNGE') return { customYaw: 0.18, sparkleY: 0.55 };
    return { customYaw: null, sparkleY: fighterId === 'priyanshu' ? 0.65 : 1.55 };
  }

  private triggerCpuPose(cpuId: CharacterId, state: CpuPoseState): void {
    if (this.isCinematicActive || this.disposed || cpuId !== this.opponentCharacter) return;

    const cpuRig = this.rigs.get(cpuId);
    const cpuAnim = this.anims.get(cpuId);
    if (!cpuRig || !cpuAnim || !cpuAnim.hasState(state)) return;

    const meta = this.getPoseVisualMeta(cpuId, state);
    this.physics.setKnockedDown(cpuId, false);
    this.physics.setMoveInput(cpuId, 0, 0);
    this.physics.setLocomotionState(cpuId, false, meta.customYaw);
    cpuAnim.transitionTo(state, 0.12, true);

    if (cpuId === 'chinu') {
      this.triggerPriyanshuAdmireOnChinuPose();
    }

    this.effects.spawnBossFlexSparkle(cpuRig.root.position.clone().setY(meta.sparkleY));

    if (this.canShowCpuQuip()) {
      const speaker = FIGHTER_META[cpuId].displayName;
      let quip = 'Staying sharp in the ring! 💪';
      if (cpuId === 'priyanshu') {
        quip =
          state === 'LOUNGE'
            ? 'Just lounging like your Ring Champ! 😎🛋️'
            : '200 pushups daily—never skipping! 💪🔥';
      } else if (cpuId === 'chinu') {
        quip =
          state === 'DANCE'
            ? 'Boss cardio footwork! 💃🥊'
            : state === 'CHAMP_POSE'
              ? 'Born to reign this ring! 🏆👑'
              : 'Just chilling like the Real Boss 😎✨';
      } else if (cpuId === 'modiji') {
        quip =
          state === 'DANCE'
            ? 'Victory cheer for the crowd!! 🙌✨'
            : 'Aerial flip style!! 🤸🔥';
      }
      this.setQuip(speaker, quip, false);
      this.syncHUD();
    }
  }

  private triggerChinuShowboatPose(
    state: 'POSE' | 'DANCE' | 'CHAMP_POSE',
    customYaw: number | null,
    sparkleHeight: number,
    quipText: string,
    sparklePoint?: THREE.Vector3
  ): void {
    if (this.isCinematicActive || this.selectedCharacter !== 'chinu') return;

    const chinuRig = this.rigs.get('chinu');
    const chinuAnim = this.anims.get('chinu');
    if (!chinuRig || !chinuAnim || !chinuAnim.hasState(state)) return;

    this.cancelChinuEntry();
    this.physics.setKnockedDown('chinu', false);
    this.physics.setMoveInput('chinu', 0, 0);
    this.physics.setLocomotionState('chinu', false, customYaw);
    this.sound.playClick();
    chinuAnim.transitionTo(state, 0.1, true);

    this.triggerPriyanshuAdmireOnChinuPose();

    this.effects.spawnBossFlexSparkle(
      sparklePoint ?? chinuRig.root.position.clone().setY(sparkleHeight)
    );
    this.setQuip('Chinu', quipText);
    this.syncHUD();
  }

  /**
   * Native GLB pose/flex emote (`chinu-cheer-1.glb`, `priyanshu-pushups.glb`, or `modiji-cheer-1.glb` flip).
   */
  public triggerPoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive) return;

    if (this.selectedCharacter === 'chinu') {
      this.triggerChinuShowboatPose(
        'POSE',
        null,
        1.55,
        'Just chilling like the real boss 😎✨',
        sparklePoint
      );
      return;
    }

    const activeRig = this.rigs.get(this.selectedCharacter);
    const activeAnim = this.anims.get(this.selectedCharacter);
    if (!activeRig || !activeAnim || !activeAnim.hasState('POSE')) return;

    this.physics.setKnockedDown(this.selectedCharacter, false);
    this.physics.setMoveInput(this.selectedCharacter, 0, 0);
    this.physics.setLocomotionState(this.selectedCharacter, false, null);
    this.sound.playClick();
    activeAnim.transitionTo('POSE', 0.08, true);

    if (this.selectedCharacter === 'modiji') {
      this.effects.spawnBossFlexSparkle(
        sparklePoint ?? activeRig.root.position.clone().setY(1.65)
      );
      this.setQuip('Modiji', 'Wait for the aerial flip!! 🤸🔥');
    } else {
      this.effects.spawnBossFlexSparkle(
        sparklePoint ?? activeRig.root.position.clone().setY(0.65)
      );
      this.setQuip('Priyanshu', '200 pushups daily! 💪🔥');
    }
    this.syncHUD();
  }

  /**
   * Secondary pose shortcut (`KeyL`): Priyanshu Lounge Pose (`priyanshu-idle-2.glb`),
   * Chinu Boxer Dance (`chinu-cheer-2.glb`), or Modiji Victory Cheer (`modiji-cheer-2.glb`).
   */
  public triggerSecondaryPoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive) return;
    if (this.selectedCharacter === 'chinu') {
      this.triggerChinuShowboatPose(
        'DANCE',
        -0.1,
        1.65,
        'Float like a butterfly, sting like the Boss! 💃🥊',
        sparklePoint
      );
      return;
    }
    if (this.selectedCharacter === 'modiji') {
      const modijiRig = this.rigs.get('modiji');
      const modijiAnim = this.anims.get('modiji');
      if (!modijiRig || !modijiAnim || !modijiAnim.hasState('DANCE')) return;

      this.physics.setKnockedDown('modiji', false);
      this.physics.setMoveInput('modiji', 0, 0);
      this.physics.setLocomotionState('modiji', false, 0.15);
      this.sound.playClick();
      modijiAnim.transitionTo('DANCE', 0.1, true);
      this.effects.spawnBossFlexSparkle(
        sparklePoint ?? modijiRig.root.position.clone().setY(1.65)
      );
      this.setQuip('Modiji', 'Thank you, thank you, Mitron!! 🙌🔥');
      this.syncHUD();
      return;
    }
    this.triggerLoungePoseAction(sparklePoint);
  }

  /**
   * Chinu's Champion Fist-Pump Stance (`chinu-idle-2.glb`, KeyV).
   */
  public triggerChinuChampPoseAction(sparklePoint?: THREE.Vector3): void {
    this.triggerChinuShowboatPose(
      'CHAMP_POSE',
      0.25,
      1.75,
      'Born to reign this ring! 🏆👑',
      sparklePoint
    );
  }

  public triggerRingEntryAction(fromStartCorner = false): void {
    if (this.isCinematicActive) return;

    const actorId = this.selectedCharacter;
    const actorRig = this.rigs.get(actorId);
    const actorAnim = this.anims.get(actorId);
    if (!actorRig || !actorAnim) return;
    if (!actorAnim.hasState('ENTRY')) {
      if (actorId === 'chinu' && !fromStartCorner) {
        this.pendingChinuEntry = true;
      }
      return;
    }

    if (actorId === 'chinu') {
      this.pendingChinuEntry = false;
    }
    this.cancelChinuEntry();
    this.physics.setKnockedDown(actorId, false);
    this.physics.setMoveInput(actorId, 0, 0);
    this.physics.setLocomotionState(actorId, false, null);

    let startX = -2.05;
    let startZ = 0;
    let targetX = -1.15;
    let targetZ = 0;

    if (!fromStartCorner) {
      const actorPos = this.physics.getBodyPosition(actorId);
      const oppPos = this.physics.getBodyPosition(this.opponentCharacter);
      if (actorPos && oppPos) {
        startX = actorPos.x;
        startZ = actorPos.z;
        const delta = oppPos.clone().sub(actorPos).setY(0);
        const dist = delta.length();
        const stride = THREE.MathUtils.clamp(dist - 0.85, 0, 1.15);
        if (dist > 0.001 && stride > 0) {
          delta.normalize();
          targetX = THREE.MathUtils.clamp(startX + delta.x * stride, -2.15, 2.15);
          targetZ = THREE.MathUtils.clamp(startZ + delta.z * stride, -2.15, 2.15);
        } else {
          targetX = startX;
          targetZ = startZ;
        }
      }
    } else {
      this.physics.setBodyPositionXZ(actorId, startX, startZ);
    }

    this.sound.playWhoosh(0.95);
    actorAnim.transitionTo('ENTRY', 0.08, true);

    const glide = { x: startX, z: startZ };
    this.chinuEntryTween = gsap.to(glide, {
      x: targetX,
      z: targetZ,
      duration: 0.95,
      ease: 'power2.out',
      onUpdate: () => {
        if (!this.isCinematicActive && !this.disposed) {
          this.physics.setBodyPositionXZ(actorId, glide.x, glide.z);
        }
      },
      onComplete: () => {
        this.chinuEntryTween = undefined;
      },
    });

    this.effects.spawnBossFlexSparkle(
      actorRig.root.position.clone().set(targetX, 1.15, targetZ)
    );
    const entryQuip =
      actorId === 'chinu'
        ? 'Here comes the Real Boss!! 🐆🔥'
        : actorId === 'modiji'
          ? 'Laser Titan has landed!! ⚡🔥'
          : 'Priyanshu drops into the ring!! 🔥';
    this.setQuip(FIGHTER_META[actorId].displayName, entryQuip);
    this.syncHUD();
  }

  /**
   * Chinu's crouched prowl Ring Entry stride (`chinu-entry.glb`, KeyE or character switch).
   */
  public triggerChinuEntryAction(fromStartCorner = false): void {
    if (this.selectedCharacter !== 'chinu') return;
    this.triggerRingEntryAction(fromStartCorner);
  }

  /**
   * Priyanshu's dramatic floor lounge pose (`priyanshu-idle-2.glb`).
   */
  public triggerLoungePoseAction(sparklePoint?: THREE.Vector3): void {
    if (this.isCinematicActive || this.selectedCharacter !== 'priyanshu') return;

    const priyanshuRig = this.rigs.get('priyanshu');
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!priyanshuRig || !priyanshuAnim) return;
    if (!priyanshuAnim.hasState('LOUNGE')) {
      this.pendingPriyanshuLounge = true;
      return;
    }

    this.pendingPriyanshuLounge = false;
    this.physics.setKnockedDown('priyanshu', false);
    this.physics.setMoveInput('priyanshu', 0, 0);
    // Angle face/chest toward front camera so the side-recline lounge reads cleanly
    this.physics.setLocomotionState('priyanshu', false, 0.18);
    this.sound.playClick();
    priyanshuAnim.transitionTo('LOUNGE', 0.16, true);

    this.effects.spawnBossFlexSparkle(
      sparklePoint ?? priyanshuRig.root.position.clone().setY(0.55)
    );
    this.setQuip('Priyanshu', 'Paint me like your Ring Champ! 😉🛋️');
    this.syncHUD();
  }

  public triggerChinuBossPose(sparklePoint?: THREE.Vector3): void {
    if (this.selectedCharacter === 'chinu') {
      this.triggerPoseAction(sparklePoint);
    }
  }

  /**
   * Native multi-hit Mixamo combo (`chinu-puch-kick-mix.glb` or `priyanshu-kick-punch.glb`).
   */
  public triggerMuayThaiAction(): void {
    if (this.isCinematicActive) return;

    if (this.selectedCharacter === 'chinu') {
      this.runMuayThaiSequence('chinu', this.opponentCharacter, {
        hit1DelayMs: 650,
        hit1Damage: 12,
        hit2DelayMs: 1450,
        hit2Damage: 14,
        finisherDelayMs: 2350,
        finisherDamage: 22,
      });
      return;
    }

    if (this.selectedCharacter === 'modiji') {
      if (this.opponentCharacter === 'chinu') {
        this.triggerAction2Counter('modiji', 'chinu');
        return;
      }
      this.runMuayThaiSequence('modiji', this.opponentCharacter, {
        hit1DelayMs: 650,
        hit1Damage: 12,
        hit2DelayMs: 1380,
        hit2Damage: 15,
        finisherDelayMs: 2550,
        finisherDamage: 24,
      });
      return;
    }

    if (this.selectedCharacter === 'priyanshu') {
      if (this.opponentCharacter === 'chinu') {
        this.triggerAction2Counter('priyanshu', 'chinu');
        return;
      }
      this.runMuayThaiSequence('priyanshu', this.opponentCharacter, {
        hit1DelayMs: 820,
        hit1Damage: 14,
        hit2DelayMs: 1600,
        hit2Damage: 16,
        finisherDelayMs: 2550,
        finisherDamage: 24,
      });
    }
  }

  public triggerChinuMuayThaiCombo(): void {
    if (this.selectedCharacter === 'chinu') {
      this.triggerMuayThaiAction();
    }
  }

  private runMuayThaiSequence(
    attackerId: CharacterId,
    targetId: CharacterId,
    timing: {
      hit1DelayMs: number;
      hit1Damage: number;
      hit2DelayMs: number;
      hit2Damage: number;
      finisherDelayMs: number;
      finisherDamage: number;
    }
  ): void {
    const attackerAnim = this.anims.get(attackerId);
    const targetAnim = this.anims.get(targetId);
    const targetRig = this.rigs.get(targetId);
    if (!attackerAnim || !targetAnim || !targetRig) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    if (attackerId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    this.isCinematicActive = true;
    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setMoveInput(targetId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.physics.setLocomotionState(targetId, false, null);
    this.sound.playClick();
    this.syncHUD();

    const needsStandUp = targetAnim.getState() === 'FALL_BACK';
    if (needsStandUp) {
      this.physics.setKnockedDown(targetId, false);
      targetAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = needsStandUp ? 480 : 0;

    this.scheduleUnscaled(() => {
      attackerAnim.transitionTo('MUAY_THAI', 0.06, true);
      this.physics.applyDirectionalImpulse(attackerId, targetId, 3.6);
      this.sound.playWhoosh(1.0);

      // Combo Strike 1
      this.scheduleUnscaled(() => {
        const hitPos = targetRig.root.position.clone().setY(1.52);
        targetAnim.transitionTo('HIT', 0.04, true);
        this.sound.playPunchHit(this.comboHits + 1);
        this.effects.spawnPunchImpact(hitPos, timing.hit1Damage, 'POW!');
        this.flashTintFeedback(targetRig, 0xffffff, 0.7, 0.16);
        this.sceneManager.triggerShake(0.14, 0.16);
        this.applyDamageToFighter(targetId, attackerId, timing.hit1Damage, true);
      }, timing.hit1DelayMs);

      // Combo Strike 2
      this.scheduleUnscaled(() => {
        this.physics.applyDirectionalImpulse(attackerId, targetId, 2.6);
        this.sound.playWhoosh(1.1);
        const hitPos = targetRig.root.position.clone().setY(1.48);
        targetAnim.transitionTo('HIT', 0.04, true);
        this.sound.playPunchHit(this.comboHits + 2);
        this.effects.spawnPunchImpact(hitPos, timing.hit2Damage, 'BAM!!');
        this.flashTintFeedback(targetRig, 0xffffff, 0.8, 0.18);
        this.sceneManager.triggerShake(0.18, 0.2);
        this.applyDamageToFighter(targetId, attackerId, timing.hit2Damage, true);
      }, timing.hit2DelayMs);

      // Combo Strike 3: Finisher + Hit-Stop!
      this.scheduleUnscaled(() => {
        this.gameTimeScale = FREEZE_TIME_SCALE;
        const finishPos = targetRig.root.position.clone().setY(1.42);
        this.effects.spawnKickOverrideImpact(finishPos, timing.finisherDamage);
        this.sound.playBossKickImpact();
        this.flashTintFeedback(targetRig, 0xffd426, 0.9, 0.4);
        this.sceneManager.triggerDramaticZoom(finishPos, 0.36);
        this.sceneManager.triggerShake(0.3, 0.34);

        this.recordHitQuip(targetId);
        this.applyDamageToFighter(targetId, attackerId, timing.finisherDamage, true);

        this.scheduleUnscaled(() => {
          this.gameTimeScale = 1;
          this.physics.setKnockedDown(targetId, true);
          targetAnim.transitionTo('FALL_BACK', 0.04, true);
          this.physics.applyDirectionalImpulse(targetId, attackerId, -8.2);
          this.effects.spawnDizzyStars(targetRig.headAnchor, 1.55);
          this.sound.playMatSlamAndDizzy();

          this.scheduleUnscaled(() => {
            targetAnim.transitionTo('GET_UP', 0.1, true);
            if ((this.fighterHp.get(targetId) ?? 0) <= 0) {
              this.resetFighterHPState(targetId);
            }

            this.scheduleUnscaled(() => {
              this.physics.setKnockedDown(targetId, false);
              this.isCinematicActive = false;
              this.syncHUD();
            }, 520);
          }, 1450);
        }, 360);
      }, timing.finisherDelayMs);
    }, startDelay);
  }

  /**
   * Comical AI strike back for non-Chinu matchups (e.g., Priyanshu vs Modiji).
   */
  public triggerOpponentStrikeBack(attackerId: CharacterId, defenderId: CharacterId): void {
    if (this.isCinematicActive) return;

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    const defenderState = defenderAnim.getState();
    if (defenderState === 'FALL_BACK' || defenderState === 'GET_UP') return;

    this.sound.playCounterWindup();
    attackerAnim.transitionTo('KICK', 0.05, true);
    this.physics.applyDirectionalImpulse(attackerId, defenderId, 3.1);

    this.scheduleUnscaled(() => {
      if (this.isCinematicActive) return;
      const hit = this.physics.resolveStrike(attackerId, defenderId, 'kick', OPPONENT_STRIKE_DAMAGE);
      const impactPoint = hit
        ? hit.impactPoint
        : defenderRig.root.position.clone().setY(1.45);

      defenderAnim.transitionTo('HIT', 0.04, true);
      this.physics.applyDirectionalImpulse(defenderId, attackerId, -5.2);
      this.flashTintFeedback(defenderRig, 0xffd426, 0.8, 0.24);
      this.wobbleHeadOnImpact(defenderRig);
      this.effects.spawnPunchImpact(impactPoint, OPPONENT_STRIKE_DAMAGE, 'SMITE!');
      this.sound.playBossKickImpact();
      this.sceneManager.triggerShake(0.18, 0.24);

      const attackerQuipList = attackerId === 'modiji' ? MODIJI_STRIKE_QUIPS : PRIYANSHU_HIT_QUIPS;
      this.setQuip(
        FIGHTER_META[attackerId].displayName,
        attackerQuipList[this.quipIndex % attackerQuipList.length]
      );
      this.quipIndex += 1;

      this.applyDamageToFighter(defenderId, attackerId, OPPONENT_STRIKE_DAMAGE, false);
    }, 200);
  }

  /**
   * Action 1 alias preserved for Chinu punching Priyanshu/opponent.
   */
  public triggerAction1Punch(clickedPoint?: THREE.Vector3): void {
    this.triggerStandardAttack('chinu', this.opponentCharacter === 'chinu' ? 'priyanshu' : this.opponentCharacter, 'punch', clickedPoint);
  }

  /**
   * Direct Boss Kick alias.
   */
  public triggerDirectBossKick(): void {
    this.triggerStandardAttack('chinu', this.opponentCharacter === 'chinu' ? 'priyanshu' : this.opponentCharacter, 'kick');
  }

  /**
   * Priyanshu Turbo Flurry Signature Move: rapid 3-hit arcade combo + finisher kick.
   */
  public triggerTurboComboSignature(attackerId: CharacterId, defenderId: CharacterId): void {
    if (this.isCinematicActive) return;

    const attackerAnim = this.anims.get(attackerId);
    const defenderAnim = this.anims.get(defenderId);
    const defenderRig = this.rigs.get(defenderId);
    if (!attackerAnim || !defenderAnim || !defenderRig) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    if (attackerId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    this.isCinematicActive = true;
    this.physics.setMoveInput(attackerId, 0, 0);
    this.physics.setMoveInput(defenderId, 0, 0);
    this.physics.setLocomotionState(attackerId, false, null);
    this.physics.setLocomotionState(defenderId, false, null);
    this.sound.playClick();
    this.syncHUD();

    const needsStandUp = defenderAnim.getState() === 'FALL_BACK';
    if (needsStandUp) {
      this.physics.setKnockedDown(defenderId, false);
      defenderAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = needsStandUp ? 480 : 0;

    this.scheduleUnscaled(() => {
      this.physics.applyDirectionalImpulse(attackerId, defenderId, 4.2);

      // Hit 1: Quick Jab
      this.sound.playWhoosh(1.1);
      attackerAnim.transitionTo('PUNCH', 0.04, true);

      this.scheduleUnscaled(() => {
        const hit1Pos = defenderRig.root.position.clone().setY(1.52);
        defenderAnim.transitionTo('HIT', 0.04, true);
        this.sound.playPunchHit(this.comboHits + 1);
        this.effects.spawnPunchImpact(hit1Pos, 12, 'POW!');
        this.flashTintFeedback(defenderRig, 0xffffff, 0.65, 0.16);
        this.sceneManager.triggerShake(0.12, 0.16);
        this.applyDamageToFighter(defenderId, attackerId, 12, true);
      }, 150);

      // Hit 2: Follow-up Cross
      this.scheduleUnscaled(() => {
        this.sound.playWhoosh(1.18);
        attackerAnim.transitionTo('PUNCH', 0.04, true);
        this.physics.applyDirectionalImpulse(attackerId, defenderId, 2.5);
      }, 360);

      this.scheduleUnscaled(() => {
        const hit2Pos = defenderRig.root.position.clone().setY(1.48);
        defenderAnim.transitionTo('HIT', 0.04, true);
        this.sound.playPunchHit(this.comboHits + 2);
        this.effects.spawnPunchImpact(hit2Pos, 12, 'BAM!!');
        this.flashTintFeedback(defenderRig, 0xffffff, 0.75, 0.18);
        this.sceneManager.triggerShake(0.15, 0.18);
        this.applyDamageToFighter(defenderId, attackerId, 12, true);
      }, 500);

      // Hit 3: Mega Finisher Kick + Hit-Stop!
      this.scheduleUnscaled(() => {
        this.sound.playWhoosh(0.8);
        attackerAnim.transitionTo('KICK', 0.04, true);
      }, 720);

      this.scheduleUnscaled(() => {
        this.gameTimeScale = FREEZE_TIME_SCALE;
        const finishPos = defenderRig.root.position.clone().setY(1.42);
        this.effects.spawnKickOverrideImpact(finishPos, 24);
        this.sound.playBossKickImpact();
        this.flashTintFeedback(defenderRig, 0xffd426, 0.9, 0.4);
        this.sceneManager.triggerDramaticZoom(finishPos, 0.36);
        this.sceneManager.triggerShake(0.28, 0.32);

        this.recordHitQuip(defenderId);
        this.applyDamageToFighter(defenderId, attackerId, 24, true);

        this.scheduleUnscaled(() => {
          this.gameTimeScale = 1;
          this.physics.setKnockedDown(defenderId, true);
          defenderAnim.transitionTo('FALL_BACK', 0.04, true);
          this.physics.applyDirectionalImpulse(defenderId, attackerId, -7.8);
          this.effects.spawnDizzyStars(defenderRig.headAnchor, 1.55);
          this.sound.playMatSlamAndDizzy();

          this.scheduleUnscaled(() => {
            defenderAnim.transitionTo('GET_UP', 0.1, true);
            if ((this.fighterHp.get(defenderId) ?? 0) <= 0) {
              this.resetFighterHPState(defenderId);
            }

            this.scheduleUnscaled(() => {
              this.physics.setKnockedDown(defenderId, false);
              this.isCinematicActive = false;
              this.syncHUD();
            }, 520);
          }, 1450);
        }, 360);
      }, 910);
    }, startDelay);
  }

  /**
   * Modiji's Signature Move (F key / LASER EYES! button):
   * Charges twin plasma eyes and blasts continuous red laser beams to scorch the opponent!
   */
  public triggerModijiLaserSignature(targetId: CharacterId): void {
    if (this.isCinematicActive) return;
    if (targetId === 'chinu') {
      this.triggerAction2Counter('modiji', 'chinu');
      return;
    }

    const modijiRig = this.rigs.get('modiji');
    const targetRig = this.rigs.get(targetId);
    const modijiAnim = this.anims.get('modiji');
    const targetAnim = this.anims.get(targetId);
    if (!modijiRig || !targetRig || !modijiAnim || !targetAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    this.isCinematicActive = true;
    this.physics.setMoveInput('modiji', 0, 0);
    this.physics.setMoveInput(targetId, 0, 0);
    this.physics.setLocomotionState('modiji', false, null);
    this.physics.setLocomotionState(targetId, false, null);
    this.physics.setKinematicHold(true, 1.55);
    this.sound.playClick();
    this.syncHUD();

    const needsStandUp = targetAnim.getState() === 'FALL_BACK';
    if (needsStandUp) {
      this.physics.setKnockedDown(targetId, false);
      targetAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = needsStandUp ? 480 : 0;

    this.scheduleUnscaled(() => {
      const mPos = this.physics.getBodyPosition('modiji')?.clone() ?? modijiRig.root.position.clone();
      const tPos = this.physics.getBodyPosition(targetId)?.clone() ?? targetRig.root.position.clone();
      const delta = tPos.clone().sub(mPos).setY(0);
      const dist = delta.length() || 1;
      const dir = delta.clone().divideScalar(dist);

      // Ensure clear dramatic beam distance (~2.15 ring units) across the mat
      let goalTargetX = tPos.x;
      let goalTargetZ = tPos.z;
      if (dist < 1.85 || dist > 2.9) {
        const desiredDist = THREE.MathUtils.clamp(dist, 2.05, 2.55);
        goalTargetX = THREE.MathUtils.clamp(mPos.x + dir.x * desiredDist, -2.1, 2.1);
        goalTargetZ = THREE.MathUtils.clamp(mPos.z + dir.z * desiredDist, -2.1, 2.1);
      }

      const aimDx = goalTargetX - mPos.x;
      const aimDz = goalTargetZ - mPos.z;
      const modijiYaw = Math.atan2(aimDx, aimDz);
      const targetYaw = Math.atan2(-aimDx, -aimDz);

      gsap.to(modijiRig.modelRoot.rotation, { y: modijiYaw, duration: 0.22, ease: 'power2.out' });
      gsap.to(targetRig.modelRoot.rotation, { y: targetYaw, duration: 0.22, ease: 'power2.out' });

      const slide = { x: tPos.x, z: tPos.z };
      gsap.to(slide, {
        x: goalTargetX,
        z: goalTargetZ,
        duration: 0.24,
        ease: 'power2.out',
        onUpdate: () => {
          this.physics.setBodyPositionXZ(targetId, slide.x, slide.z);
        },
      });

      // Phase 1: Power Stare + Immediate Red Eye Charge
      modijiAnim.transitionTo('LASER_EYES', 0.08, true);
      this.sound.playLaserCharge();
      this.setQuip('Modiji', MODIJI_LASER_QUIPS[this.quipIndex % MODIJI_LASER_QUIPS.length]);
      this.quipIndex += 1;

      const eyeMid = mPos.clone().lerp(new THREE.Vector3(goalTargetX, 0, goalTargetZ), 0.45).setY(1.68);
      this.sceneManager.triggerDramaticZoom(eyeMid, 0.45);

      const immediateOrigins = CharacterFactory.getEyeOriginsWorld(modijiRig);
      this.effects.spawnLaserEyeCharge(immediateOrigins.left, immediateOrigins.right);

      this.scheduleUnscaled(() => {
        const origins = CharacterFactory.getEyeOriginsWorld(modijiRig);
        this.effects.spawnLaserEyeCharge(origins.left, origins.right);
      }, 140);

      // Phase 2: Continuous Twin Crimson Laser Beams + Scorch Ticks
      this.scheduleUnscaled(() => {
        this.sound.playLaserBeam(0.84);
        this.effects.spawnLaserEyeBeam(
          () => CharacterFactory.getEyeOriginsWorld(modijiRig),
          () => targetRig.root.position.clone().setY(1.42),
          0.84
        );
        this.sceneManager.triggerShake(0.16, 0.82);
      }, 380);

      this.scheduleUnscaled(() => {
        const hitPos = targetRig.root.position.clone().setY(1.42);
        targetAnim.transitionTo('HIT', 0.04, true);
        this.flashTintFeedback(targetRig, 0xff4500, 0.88, 0.28);
        this.wobbleHeadOnImpact(targetRig);
        this.effects.spawnLaserBurnImpact(hitPos, 14, 'SEAR!', false);
        this.applyDamageToFighter(targetId, 'modiji', 14, true);
      }, 450);

      this.scheduleUnscaled(() => {
        const hitPos = targetRig.root.position.clone().setY(1.46);
        targetAnim.transitionTo('HIT', 0.04, true);
        this.flashTintFeedback(targetRig, 0xff2200, 0.94, 0.28);
        this.wobbleHeadOnImpact(targetRig);
        this.effects.spawnLaserBurnImpact(hitPos, 16, 'BURN!!', false);
        this.applyDamageToFighter(targetId, 'modiji', 16, true);
      }, 770);

      // Phase 3: Thermal Blast Finisher + Hit-Stop!
      this.scheduleUnscaled(() => {
        this.gameTimeScale = FREEZE_TIME_SCALE;
        const finishPos = targetRig.root.position.clone().setY(1.42);
        this.sound.playLaserBurnExplosion();
        this.effects.spawnLaserBurnImpact(finishPos, 24, 'FRIED! 🔥', true);
        this.flashTintFeedback(targetRig, 0xff3b00, 1.0, 0.45);
        this.sceneManager.triggerDramaticZoom(finishPos, 0.36);
        this.sceneManager.triggerShake(0.32, 0.36);

        this.recordHitQuip(targetId);
        this.applyDamageToFighter(targetId, 'modiji', 24, true);

        this.scheduleUnscaled(() => {
          this.gameTimeScale = 1;
          modijiAnim.transitionTo('IDLE', 0.14, true);
          this.physics.setKnockedDown(targetId, true);
          targetAnim.transitionTo('FALL_BACK', 0.04, true);
          this.physics.applyDirectionalImpulse(targetId, 'modiji', -8.4);
          this.effects.spawnDizzyStars(targetRig.headAnchor, 1.6);
          this.sound.playMatSlamAndDizzy();

          this.scheduleUnscaled(() => {
            targetAnim.transitionTo('GET_UP', 0.1, true);
            if ((this.fighterHp.get(targetId) ?? 0) <= 0) {
              this.resetFighterHPState(targetId);
            }

            this.scheduleUnscaled(() => {
              this.physics.setKnockedDown(targetId, false);
              this.physics.setKinematicHold(false);
              this.isCinematicActive = false;
              this.cpuAi.onCpuInterrupted(performance.now(), 1350);
              this.syncHUD();
            }, 520);
          }, 1450);
        }, 360);
      }, 1160);
    }, startDelay);
  }

  /**
   * Chinu's Signature Move (F key / SIGNATURE! button):
   * Chinu steps behind target, bends them over, and delivers 3 comical spanks!
   */
  public triggerSignatureMove(targetId: CharacterId = 'priyanshu'): void {
    if (this.isCinematicActive) return;

    const chinuRig = this.rigs.get('chinu');
    const chinuAnim = this.anims.get('chinu');
    const targetRig = this.rigs.get(targetId);
    const targetAnim = this.anims.get(targetId);
    if (!chinuRig || !chinuAnim || !targetRig || !targetAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    this.isCinematicActive = true;
    this.physics.setMoveInput('chinu', 0, 0);
    this.physics.setMoveInput(targetId, 0, 0);
    this.physics.setLocomotionState('chinu', false, null);
    this.physics.setLocomotionState(targetId, false, null);
    if (
      targetAnim.getState() === 'LOUNGE' ||
      targetAnim.getState() === 'RUN' ||
      targetAnim.getState() === 'ADMIRE'
    ) {
      targetAnim.transitionTo('IDLE', 0.08, true);
    }
    this.sound.playClick();
    this.syncHUD();

    const needsStandUp = targetAnim.getState() === 'FALL_BACK';
    if (needsStandUp) {
      this.physics.setKnockedDown(targetId, false);
      targetAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = needsStandUp ? 480 : 0;

    this.scheduleUnscaled(() => {
      const chinuPos = this.physics.getBodyPosition('chinu')?.clone() ?? new THREE.Vector3(-1, 0, 0);
      const targetPos =
        this.physics.getBodyPosition(targetId)?.clone() ?? new THREE.Vector3(1, 0, 0);

      targetPos.x = THREE.MathUtils.clamp(targetPos.x, -2.1, 2.1);
      targetPos.z = THREE.MathUtils.clamp(targetPos.z, -2.1, 2.1);
      this.physics.setBodyPositionXZ(targetId, targetPos.x, targetPos.z);

      const dirToChinu = chinuPos.clone().sub(targetPos);
      dirToChinu.y = 0;
      if (dirToChinu.lengthSq() < 0.001) {
        dirToChinu.set(-1, 0, 0);
      } else {
        dirToChinu.normalize();
      }

      const spankDist = 0.56;
      const sideDir = new THREE.Vector3(-dirToChinu.z, 0, dirToChinu.x);
      if (sideDir.lengthSq() < 0.001) {
        sideDir.set(0, 0, 1);
      } else {
        sideDir.normalize();
        if (sideDir.z < 0) sideDir.negate();
      }

      // Slightly stagger Chinu toward back-diagonal so camera sees clear open-palm swings & hip contact
      const spankSpotX = THREE.MathUtils.clamp(
        targetPos.x + dirToChinu.x * spankDist - sideDir.x * 0.22,
        -2.25,
        2.25
      );
      const spankSpotZ = THREE.MathUtils.clamp(
        targetPos.z + dirToChinu.z * spankDist - sideDir.z * 0.22,
        -2.25,
        2.25
      );
      const chinuSpankYaw = Math.atan2(targetPos.x - spankSpotX, targetPos.z - spankSpotZ);
      const targetBentYaw =
        Math.atan2(-dirToChinu.x, -dirToChinu.z) + (dirToChinu.x < 0 ? 0.16 : -0.16);

      const spankCenter = new THREE.Vector3(
        (spankSpotX + targetPos.x) * 0.5,
        1.45,
        (spankSpotZ + targetPos.z) * 0.5
      );

      this.cpuAi.onCpuInterrupted(performance.now(), 3200);
      this.physics.setKinematicHold(true, 0.44);
      chinuRig.modelRoot.rotation.y = Math.atan2(-dirToChinu.x, -dirToChinu.z);
      targetRig.modelRoot.rotation.y = targetBentYaw;
      chinuAnim.transitionTo('RUN', 0.05);
      this.sceneManager.triggerSpankCloseUp(spankCenter, dirToChinu, 1.05);

      const glideState = { x: chinuPos.x, z: chinuPos.z };
      gsap.to(glideState, {
        x: spankSpotX,
        z: spankSpotZ,
        duration: 0.25,
        ease: 'power2.out',
        onUpdate: () => {
          this.physics.setBodyPositionXZ('chinu', glideState.x, glideState.z);
        },
        onComplete: () => {
          chinuRig.modelRoot.rotation.y = chinuSpankYaw;
          targetRig.modelRoot.rotation.y = targetBentYaw;

          chinuAnim.transitionTo('SIGNATURE', 0.05, true);
          targetAnim.transitionTo('SPANKED', 0.06, true);

          const spankPoint = targetPos
            .clone()
            .add(new THREE.Vector3(dirToChinu.x * 0.22, 1.04, dirToChinu.z * 0.22));

          // Slap 1 (240ms)
          this.scheduleUnscaled(() => {
            this.sound.playSpankSlap(false);
            this.effects.spawnSpankImpact(spankPoint, 1, SIGNATURE_SLAP_1_DAMAGE, dirToChinu);
            this.flashTintFeedback(targetRig, 0xff3b7f, 0.55, 0.18);
            this.wobbleHeadOnImpact(targetRig);
            this.sceneManager.triggerShake(0.14, 0.16);
            this.setQuip(FIGHTER_META[targetId].displayName, 'HEY!! WATCH IT!! 😳');
            this.applyDamageToFighter(targetId, 'chinu', SIGNATURE_SLAP_1_DAMAGE, true);
          }, 240);

          // Slap 2 (460ms)
          this.scheduleUnscaled(() => {
            this.sound.playSpankSlap(false);
            this.effects.spawnSpankImpact(spankPoint, 2, SIGNATURE_SLAP_2_DAMAGE, dirToChinu);
            this.flashTintFeedback(targetRig, 0xff3b7f, 0.68, 0.18);
            this.wobbleHeadOnImpact(targetRig);
            this.sceneManager.triggerShake(0.18, 0.18);
            this.setQuip(FIGHTER_META[targetId].displayName, 'OWW!! STOP THAT!! 😭');
            this.applyDamageToFighter(targetId, 'chinu', SIGNATURE_SLAP_2_DAMAGE, true);
          }, 460);

          // MEGA SPANK 3 (720ms) -> Brief Hit-Stop Freeze + Launch!
          this.scheduleUnscaled(() => {
            this.gameTimeScale = 0.06;
            this.sound.playSpankSlap(true);
            this.effects.spawnSpankImpact(spankPoint, 3, SIGNATURE_SLAP_3_DAMAGE, dirToChinu);
            this.flashTintFeedback(targetRig, 0xff1e56, 0.92, 0.45);
            this.wobbleHeadOnImpact(targetRig);
            this.sceneManager.triggerShake(0.32, 0.34);

            this.setQuip(FIGHTER_META[targetId].displayName, 'OWW!! MERCY!! 🔥😭');
            this.applyDamageToFighter(targetId, 'chinu', SIGNATURE_SLAP_3_DAMAGE, true);

            this.scheduleUnscaled(() => {
              this.gameTimeScale = 1;
              this.physics.setKinematicHold(false);
              this.physics.setKnockedDown(targetId, true);
              targetRig.modelRoot.rotation.y = Math.atan2(dirToChinu.x, dirToChinu.z);
              targetAnim.transitionTo('FALL_BACK', 0.04, true);
              this.physics.applyDirectionalImpulse(targetId, 'chinu', -8.6);
              this.effects.spawnDizzyStars(targetRig.headAnchor, 1.55);
              this.sound.playMatSlamAndDizzy();

              this.scheduleUnscaled(() => {
                targetAnim.transitionTo('GET_UP', 0.1, true);
                if ((this.fighterHp.get(targetId) ?? 0) <= 0) {
                  this.resetFighterHPState(targetId);
                }

                this.scheduleUnscaled(() => {
                  this.physics.setKnockedDown(targetId, false);
                  this.isCinematicActive = false;
                  this.cpuAi.onCpuInterrupted(performance.now(), 900);
                  this.syncHUD();
                }, 520);
              }, 1450);
            }, 310);
          }, 720);
        },
      });
    }, startDelay);
  }

  /**
   * Action 2: Challenger attempts an attack -> Chinu instantly overrides with Kick ->
   * Slight action freeze + Massive comical Toast ("You can't mess with the real boss.") ->
   * Challenger falls back onto the ring mat.
   */
  public triggerAction2Counter(
    challengerId: CharacterId = 'priyanshu',
    bossId: CharacterId = 'chinu'
  ): void {
    if (this.isCinematicActive) return;

    const challengerRig = this.rigs.get(challengerId);
    const challengerAnim = this.anims.get(challengerId);
    const bossRig = this.rigs.get(bossId);
    const bossAnim = this.anims.get(bossId);
    if (!challengerRig || !challengerAnim || !bossRig || !bossAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    if (bossId === 'chinu') {
      this.resetPriyanshuAdmire();
    }
    this.isCinematicActive = true;
    this.physics.setMoveInput(challengerId, 0, 0);
    this.physics.setMoveInput(bossId, 0, 0);
    this.physics.setLocomotionState(challengerId, false, null);
    this.physics.setLocomotionState(bossId, false, null);
    this.physics.setKnockedDown(challengerId, false);
    this.syncHUD();

    // 1. Challenger initiates cocky wind-up attack
    this.sound.playCounterWindup();
    challengerAnim.transitionTo('ATTEMPT_ATTACK', 0.05, true);
    this.physics.applyDirectionalImpulse(challengerId, bossId, 2.5);

    // 2. Mid-swing, Chinu instantly overrides with a devastating Kick!
    const kickStartMs = bossId === 'chinu' ? 120 : 230;
    const kickImpactMs = bossId === 'chinu' ? 490 : 420;

    this.scheduleUnscaled(() => {
      this.sound.playWhoosh(0.8);
      bossAnim.transitionTo('KICK', 0.04, true);
      this.physics.applyDirectionalImpulse(bossId, challengerId, 2.7);
    }, kickStartMs);

    // 3. Peak kick impact -> Hit-Stop Freeze + Massive Boss Toast!
    this.scheduleUnscaled(() => {
      const hit = this.physics.resolveStrike(bossId, challengerId, 'kick', COUNTER_KICK_DAMAGE);
      const impactPoint = hit
        ? hit.impactPoint
        : bossRig.root.position.clone().lerp(challengerRig.root.position, 0.5).setY(1.45);

      this.gameTimeScale = FREEZE_TIME_SCALE;

      this.flashTintFeedback(challengerRig, 0xffffff, 0.75, 0.22);
      this.wobbleHeadOnImpact(challengerRig);
      this.effects.spawnKickOverrideImpact(impactPoint, COUNTER_KICK_DAMAGE);
      this.sound.playBossKickImpact();
      this.sceneManager.triggerDramaticZoom(impactPoint, FREEZE_DURATION_MS / 1000);
      this.sceneManager.triggerShake(0.26, 0.34);

      this.setQuip(
        FIGHTER_META[challengerId].displayName,
        PRIYANSHU_BOSS_QUIPS[this.quipIndex % PRIYANSHU_BOSS_QUIPS.length]
      );
      this.quipIndex += 1;

      this.ui.showBossToast("You can't mess with the real boss.");
      this.applyDamageToFighter(challengerId, bossId, COUNTER_KICK_DAMAGE, true);

      // 4. Resume full speed & launch challenger onto back
      this.scheduleUnscaled(() => {
        this.gameTimeScale = 1;
        this.physics.setKnockedDown(challengerId, true);
        challengerAnim.transitionTo('FALL_BACK', 0.04, true);
        this.physics.applyDirectionalImpulse(challengerId, bossId, -7.6);
        this.effects.spawnDizzyStars(challengerRig.headAnchor, 1.55);
        this.sound.playMatSlamAndDizzy();

        // 5. Challenger groggily gets back up
        this.scheduleUnscaled(() => {
          challengerAnim.transitionTo('GET_UP', 0.1, true);
          if ((this.fighterHp.get(challengerId) ?? 0) <= 0) {
            this.resetFighterHPState(challengerId);
          }

          this.scheduleUnscaled(() => {
            this.physics.setKnockedDown(challengerId, false);
            this.isCinematicActive = false;
            this.syncHUD();
          }, 520);
        }, 1450);
      }, FREEZE_DURATION_MS);
    }, kickImpactMs);
  }

  /**
   * Clicking "Heal Priyanshu 💕": Chinu glides right up to Priyanshu and kisses him
   * with 3D floating hearts, "MWAH!" burst, rosy blush, and full HP restoration!
   */
  public triggerKissHealSequence(): void {
    if (this.isCinematicActive) return;

    const chinuRig = this.rigs.get('chinu');
    const chinuAnim = this.anims.get('chinu');
    const priyanshuRig = this.rigs.get('priyanshu');
    const priyanshuAnim = this.anims.get('priyanshu');
    if (!chinuRig || !chinuAnim || !priyanshuRig || !priyanshuAnim) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.cancelChinuEntry();
    this.isCinematicActive = true;
    this.physics.setMoveInput('chinu', 0, 0);
    this.physics.setMoveInput('priyanshu', 0, 0);
    this.physics.setLocomotionState('chinu', false, null);
    this.physics.setLocomotionState('priyanshu', false, null);
    if (
      priyanshuAnim.getState() === 'LOUNGE' ||
      priyanshuAnim.getState() === 'RUN' ||
      priyanshuAnim.getState() === 'ADMIRE'
    ) {
      priyanshuAnim.transitionTo('IDLE', 0.08, true);
    }
    this.sound.playClick();
    this.syncHUD();

    const needsStandUp = priyanshuAnim.getState() === 'FALL_BACK';
    if (needsStandUp) {
      this.physics.setKnockedDown('priyanshu', false);
      priyanshuAnim.transitionTo('GET_UP', 0.08, true);
    }

    const startDelay = needsStandUp ? 480 : 0;

    this.scheduleUnscaled(() => {
      const chinuPos = this.physics.getBodyPosition('chinu')?.clone() ?? new THREE.Vector3(-1, 0, 0);
      const priyanshuPos =
        this.physics.getBodyPosition('priyanshu')?.clone() ?? new THREE.Vector3(1, 0, 0);

      const dirToChinu = chinuPos.clone().sub(priyanshuPos);
      dirToChinu.y = 0;
      if (dirToChinu.lengthSq() < 0.001) {
        dirToChinu.set(-1, 0, 0);
      } else {
        dirToChinu.normalize();
      }

      const kissDist = 0.6;
      const kissSpotX = priyanshuPos.x + dirToChinu.x * kissDist;
      const kissSpotZ = priyanshuPos.z + dirToChinu.z * kissDist;
      const returnSpotX = priyanshuPos.x + dirToChinu.x * 2.05;
      const returnSpotZ = priyanshuPos.z + dirToChinu.z * 2.05;

      const kissCenter = new THREE.Vector3(
        (kissSpotX + priyanshuPos.x) * 0.5,
        1.98,
        (kissSpotZ + priyanshuPos.z) * 0.5
      );

      this.cpuAi.onCpuInterrupted(performance.now(), 1800);
      this.physics.setKinematicHold(true, 0.44);
      chinuRig.modelRoot.rotation.y = Math.atan2(-dirToChinu.x, -dirToChinu.z);
      priyanshuRig.modelRoot.rotation.y = Math.atan2(dirToChinu.x, dirToChinu.z);
      chinuAnim.transitionTo('RUN', 0.06);
      this.sceneManager.triggerRomanticCloseUp(kissCenter, dirToChinu, 1.02);

      const glideState = { x: chinuPos.x, z: chinuPos.z };
      gsap.to(glideState, {
        x: kissSpotX,
        z: kissSpotZ,
        duration: 0.34,
        ease: 'power2.out',
        onUpdate: () => {
          this.physics.setBodyPositionXZ('chinu', glideState.x, glideState.z);
        },
        onComplete: () => {
          chinuAnim.transitionTo('KISS', 0.1, true);
          priyanshuAnim.transitionTo('BLUSH', 0.1, true);

          this.scheduleUnscaled(() => {
            const midpoint = chinuRig.root.position
              .clone()
              .lerp(priyanshuRig.root.position, 0.5)
              .setY(2.0);

            this.sound.playKissMwah();
            this.effects.spawnKissHealEffects(midpoint);
            this.flashTintFeedback(priyanshuRig, 0xff5e99, 0.58, 0.9);
            this.flashTintFeedback(chinuRig, 0xff87b2, 0.45, 0.65);

            this.setQuip(
              'Priyanshu',
              PRIYANSHU_KISS_QUIPS[this.quipIndex % PRIYANSHU_KISS_QUIPS.length]
            );
            this.quipIndex += 1;
            this.resetFighterHPState('priyanshu');
          }, 230);

          this.scheduleUnscaled(() => {
            const stepBack = { x: kissSpotX, z: kissSpotZ };
            gsap.to(stepBack, {
              x: returnSpotX,
              z: returnSpotZ,
              duration: 0.4,
              ease: 'power2.inOut',
              onUpdate: () => {
                this.physics.setBodyPositionXZ('chinu', stepBack.x, stepBack.z);
              },
              onComplete: () => {
                this.physics.setKinematicHold(false);
                this.isCinematicActive = false;
                this.cpuAi.onCpuInterrupted(performance.now(), 1350);
                this.syncHUD();
              },
            });
          }, 960);
        },
      });
    }, startDelay);
  }

  /**
   * Non-Chinu Heal / Rematch restore for active finite fighters (e.g., Priyanshu vs Modiji).
   */
  public triggerMatchHealReset(): void {
    if (this.isCinematicActive) return;

    if (this.koRecoveryTimeoutId !== null) {
      clearTimeout(this.koRecoveryTimeoutId);
      this.koRecoveryTimeoutId = null;
    }

    this.sound.playKissMwah();
    for (const id of [this.leftFighterId, this.rightFighterId]) {
      const rig = this.rigs.get(id);
      const anim = this.anims.get(id);
      if (!FIGHTER_META[id].isBossInfinite) {
        this.fighterHp.set(id, FIGHTER_MAX_HP);
      }
      if (rig) {
        this.effects.spawnBossFlexSparkle(rig.root.position.clone().setY(1.5));
        this.flashTintFeedback(rig, 0x34d399, 0.45, 0.7);
      }
      if (anim && anim.getState() === 'FALL_BACK') {
        this.physics.setKnockedDown(id, false);
        anim.transitionTo('GET_UP', 0.08, true);
      }
    }

    this.ui.showKOBanner(false);
    this.syncHUD();
  }

  private recordHitQuip(defenderId: CharacterId): void {
    const quips = defenderId === 'modiji' ? MODIJI_HIT_QUIPS : PRIYANSHU_HIT_QUIPS;
    this.setQuip(FIGHTER_META[defenderId].displayName, quips[this.quipIndex % quips.length]);
    this.quipIndex += 1;
  }

  private applyDamageToFighter(
    defenderId: CharacterId,
    attackerId: CharacterId,
    damage: number,
    fromCinematic: boolean,
    countCombo = true
  ): void {
    if (FIGHTER_META[defenderId].isBossInfinite) return;

    const prevHp = this.fighterHp.get(defenderId) ?? FIGHTER_MAX_HP;
    const nextHp = Math.max(0, prevHp - damage);
    this.fighterHp.set(defenderId, nextHp);

    if (countCombo) {
      this.comboHits += 1;
      this.stressReliefPercent = Math.min(
        100,
        this.stressReliefPercent + Math.round(damage * 0.65)
      );
    }
    this.syncHUD();

    if (prevHp > 0 && nextHp === 0) {
      const defenderName = FIGHTER_META[defenderId].displayName.toUpperCase();
      const koTitle = `${defenderName} K.O.'D!`;
      const koSub = 'Healing fighter back to 100 HP...';

      this.sound.playKOBell();
      if (fromCinematic) {
        this.scheduleUnscaled(() => {
          if ((this.fighterHp.get(defenderId) ?? FIGHTER_MAX_HP) === 0) {
            this.ui.showKOBanner(true, koTitle, koSub);
          }
        }, FREEZE_DURATION_MS + 80);
      } else {
        this.ui.showKOBanner(true, koTitle, koSub);
        this.physics.setKnockedDown(defenderId, true);
        this.anims.get(defenderId)?.transitionTo('FALL_BACK', 0.05, true);
        this.physics.applyDirectionalImpulse(defenderId, attackerId, -6.8);

        const defenderRig = this.rigs.get(defenderId);
        if (defenderRig) {
          this.effects.spawnDizzyStars(defenderRig.headAnchor, 1.7);
        }
        this.sound.playMatSlamAndDizzy();

        this.koRecoveryTimeoutId = window.setTimeout(() => {
          this.koRecoveryTimeoutId = null;
          this.anims.get(defenderId)?.transitionTo('GET_UP', 0.1, true);
          this.resetFighterHPState(defenderId);
        }, 1850);
        this.activeTimeouts.push(this.koRecoveryTimeoutId);
      }
    }
  }

  private resetFighterHPState(id: CharacterId): void {
    if (!FIGHTER_META[id].isBossInfinite) {
      this.fighterHp.set(id, FIGHTER_MAX_HP);
    }
    this.ui.showKOBanner(false);
    this.syncHUD();
  }

  private wobbleHeadOnImpact(rig: FighterRig): void {
    const head = rig.headVisualGroup;
    if (!head) return;
    gsap.killTweensOf(head.rotation);
    gsap.killTweensOf(head.scale);
    gsap.fromTo(
      head.rotation,
      { z: (Math.random() > 0.5 ? 1 : -1) * 0.28 },
      { z: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.35)' }
    );
    gsap.fromTo(
      head.scale,
      { x: 1.18, y: 0.84, z: 1.12 },
      { x: 1, y: 1, z: 1, duration: 0.45, ease: 'elastic.out(1.2, 0.4)' }
    );
  }

  private flashTintFeedback(
    rig: FighterRig,
    hexColor: number,
    intensity: number,
    duration: number
  ): void {
    const materials = new Set(
      rig.bodyMeshes.map((mesh) => mesh.material as THREE.MeshStandardMaterial)
    );

    for (const mat of materials) {
      if (!mat.emissive) continue;
      gsap.killTweensOf(mat);
      mat.emissive.setHex(hexColor);
      mat.emissiveIntensity = intensity;
      gsap.to(mat, {
        emissiveIntensity: 0,
        duration,
        ease: 'power2.out',
        onComplete: () => {
          mat.emissive.setHex(0x000000);
        },
      });
    }
  }

  private buildFighterHUDInfo(id: CharacterId) {
    const meta = FIGHTER_META[id];
    const roleTag = meta.isBossInfinite
      ? 'REAL BOSS'
      : id === this.selectedCharacter
        ? 'CHALLENGER'
        : meta.defaultTag;
    return {
      id,
      displayName: meta.displayName,
      roleTag,
      isBossInfinite: meta.isBossInfinite,
      hp: this.fighterHp.get(id) ?? FIGHTER_MAX_HP,
      maxHp: FIGHTER_MAX_HP,
    };
  }

  private syncHUD(): void {
    this.ui.renderState({
      selectedCharacter: this.selectedCharacter,
      opponentCharacter: this.opponentCharacter,
      leftFighter: this.buildFighterHUDInfo(this.leftFighterId),
      rightFighter: this.buildFighterHUDInfo(this.rightFighterId),
      comboHits: this.comboHits,
      stressReliefPercent: this.stressReliefPercent,
      targetQuip: this.targetQuip,
      targetQuipSpeaker: this.targetQuipSpeaker,
      isMuted: this.sound.isMuted(),
      isCounterSequenceActive: this.isCinematicActive,
      isModalOpen: false,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelChinuEntry();
    cancelAnimationFrame(this.animFrameId);
    for (const id of this.activeTimeouts) {
      clearTimeout(id);
    }
    this.ui.dispose();
    this.effects.dispose();
    this.sceneManager.dispose();
  }
}
