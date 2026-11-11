import gsap from 'gsap';
import chinuFaceUrl from '../../chinu.jpeg';
import priyanshuFaceUrl from '../../priyanshu.jpeg';
import { MODIJI_PORTRAIT_DATA_URL } from '../characters/CharacterFactory';
import { CharacterId, FighterHUDInfo, GameHUDState } from '../types/game';

const PORTRAIT_MAP: Record<CharacterId, string> = {
  chinu: chinuFaceUrl,
  priyanshu: priyanshuFaceUrl,
  modiji: MODIJI_PORTRAIT_DATA_URL,
};

interface FighterHUDSlotElements {
  card: HTMLElement;
  avatar: HTMLElement;
  avatarImg: HTMLImageElement;
  name: HTMLElement;
  tag: HTMLElement;
  badge: HTMLElement;
  track: HTMLElement;
  trail: HTMLElement;
  fill: HTMLElement;
  healthText: HTMLElement;
}

export interface UIActionHandlers {
  onPrimaryAction: () => void;
  onKickAction: () => void;
  onSignatureAction: () => void;
  onCounterAction: () => void;
  onMuayThaiAction: () => void;
  onBossPoseAction: () => void;
  onLoungePoseAction: () => void;
  onChampPoseAction: () => void;
  onRingEntryAction: () => void;
  onSelectCharacter: (character: CharacterId) => void;
  onSelectOpponent: (opponent: CharacterId) => void;
  onSelectMatchup: (player: CharacterId, opponent: CharacterId) => void;
  onHealPriyanshu: () => void;
  onToggleMute: () => void;
  onMoveInput: (x: number, z: number) => void;
  onCanvasPointerDown: (clientX: number, clientY: number) => void;
  onUserGesture: () => void;
}

/**
 * Pure HTML/CSS overlay & input controller separated cleanly from WebGL / physics code.
 */
export class UIManager {
  private readonly handlers: UIActionHandlers;
  private readonly canvas: HTMLCanvasElement;

  private readonly leftSlot: FighterHUDSlotElements = {
    card: document.getElementById('hud-left')!,
    avatar: document.getElementById('hud-left-avatar')!,
    avatarImg: document.getElementById('hud-left-avatar-img') as HTMLImageElement,
    name: document.getElementById('hud-left-name')!,
    tag: document.getElementById('hud-left-tag')!,
    badge: document.getElementById('badge-active-left')!,
    track: document.getElementById('hud-left-track')!,
    trail: document.getElementById('hud-left-trail')!,
    fill: document.getElementById('hud-left-fill')!,
    healthText: document.getElementById('hud-left-health-text')!,
  };

  private readonly rightSlot: FighterHUDSlotElements = {
    card: document.getElementById('hud-right')!,
    avatar: document.getElementById('hud-right-avatar')!,
    avatarImg: document.getElementById('hud-right-avatar-img') as HTMLImageElement,
    name: document.getElementById('hud-right-name')!,
    tag: document.getElementById('hud-right-tag')!,
    badge: document.getElementById('badge-active-right')!,
    track: document.getElementById('hud-right-track')!,
    trail: document.getElementById('hud-right-trail')!,
    fill: document.getElementById('hud-right-fill')!,
    healthText: document.getElementById('hud-right-health-text')!,
  };

  private readonly comboBadge = document.getElementById('combo-badge')!;
  private readonly comboCount = document.getElementById('combo-count')!;
  private readonly reliefValue = document.getElementById('relief-value')!;
  private readonly modeBanner = document.getElementById('mode-banner')!;
  private readonly quipBubble = document.getElementById('quip-bubble')!;

  private readonly playPills: Record<CharacterId, HTMLElement> = {
    chinu: document.getElementById('btn-select-chinu')!,
    priyanshu: document.getElementById('btn-select-priyanshu')!,
    modiji: document.getElementById('btn-select-modiji')!,
  };

  private readonly oppPills: Record<CharacterId, HTMLElement> = {
    chinu: document.getElementById('btn-opp-chinu')!,
    priyanshu: document.getElementById('btn-opp-priyanshu')!,
    modiji: document.getElementById('btn-opp-modiji')!,
  };

  private readonly btnPunch = document.getElementById('btn-punch') as HTMLButtonElement;
  private readonly btnPunchLabel = document.getElementById('btn-punch-label')!;
  private readonly btnKick = document.getElementById('btn-kick') as HTMLButtonElement;
  private readonly btnKickLabel = document.getElementById('btn-kick-label')!;
  private readonly btnSignature = document.getElementById('btn-signature') as HTMLButtonElement;
  private readonly btnSignatureLabel = document.getElementById('btn-signature-label')!;
  private readonly btnSignatureSub = document.getElementById('btn-signature-sub')!;
  private readonly btnCounter = document.getElementById('btn-counter') as HTMLButtonElement;
  private readonly btnCounterLabel = document.getElementById('btn-counter-label')!;
  private readonly btnCounterSub = document.getElementById('btn-counter-sub')!;
  private readonly btnSoundToggle = document.getElementById('btn-sound-toggle')!;
  private readonly btnOpenSelect = document.getElementById('btn-open-select')!;
  private readonly btnMuayThai = document.getElementById('btn-muay-thai') as HTMLButtonElement;
  private readonly btnBossPose = document.getElementById('btn-boss-pose') as HTMLButtonElement;
  private readonly btnLoungePose = document.getElementById('btn-lounge-pose') as HTMLButtonElement;
  private readonly btnChampPose = document.getElementById('btn-champ-pose') as HTMLButtonElement;
  private readonly btnRingEntry = document.getElementById('btn-ring-entry') as HTMLButtonElement;
  private readonly btnResetHp = document.getElementById('btn-reset-hp') as HTMLButtonElement;

  private readonly charModalBackdrop = document.getElementById('char-modal-backdrop')!;
  private readonly modalPickChinu = document.getElementById('modal-pick-chinu')!;
  private readonly modalPickPriyanshu = document.getElementById('modal-pick-priyanshu')!;
  private readonly modalPickModiji = document.getElementById('modal-pick-modiji')!;

  private readonly bossToastBackdrop = document.getElementById('boss-toast-backdrop')!;
  private readonly bossToast = document.getElementById('boss-toast')!;
  private readonly koBanner = document.getElementById('ko-banner')!;
  private readonly koTitle = document.getElementById('ko-title')!;
  private readonly koSub = document.getElementById('ko-sub')!;

  private readonly pressedKeys = new Set<string>();
  private toastTimeline?: gsap.core.Timeline;
  private quipHideTimer?: number;
  private previousCombo = 0;
  private lastQuip = '';

  constructor(canvas: HTMLCanvasElement, handlers: UIActionHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.populateAvatars();
    this.bindEvents();
  }

  private populateAvatars(): void {
    const modalChinu = document.getElementById('modal-avatar-chinu') as HTMLImageElement | null;
    const modalPriyanshu = document.getElementById('modal-avatar-priyanshu') as HTMLImageElement | null;
    const modalModiji = document.getElementById('modal-avatar-modiji') as HTMLImageElement | null;

    if (modalChinu) modalChinu.src = chinuFaceUrl;
    if (modalPriyanshu) modalPriyanshu.src = priyanshuFaceUrl;
    if (modalModiji) modalModiji.src = MODIJI_PORTRAIT_DATA_URL;

    this.leftSlot.avatarImg.src = chinuFaceUrl;
    this.rightSlot.avatarImg.src = priyanshuFaceUrl;
  }

  private bindEvents(): void {
    const unlockAndBlur = (el?: HTMLElement) => {
      this.handlers.onUserGesture();
      el?.blur();
    };

    this.btnPunch.addEventListener('click', () => {
      unlockAndBlur(this.btnPunch);
      this.handlers.onPrimaryAction();
    });

    this.btnKick.addEventListener('click', () => {
      unlockAndBlur(this.btnKick);
      this.handlers.onKickAction();
    });

    this.btnSignature.addEventListener('click', () => {
      unlockAndBlur(this.btnSignature);
      this.handlers.onSignatureAction();
    });

    this.btnCounter.addEventListener('click', () => {
      unlockAndBlur(this.btnCounter);
      this.handlers.onCounterAction();
    });

    (['chinu', 'priyanshu', 'modiji'] as CharacterId[]).forEach((charId) => {
      const playPill = this.playPills[charId];
      playPill.addEventListener('click', () => {
        unlockAndBlur(playPill);
        this.handlers.onSelectCharacter(charId);
      });

      const oppPill = this.oppPills[charId];
      oppPill.addEventListener('click', () => {
        unlockAndBlur(oppPill);
        this.handlers.onSelectOpponent(charId);
      });
    });

    this.modalPickChinu.addEventListener('click', () => {
      unlockAndBlur();
      this.handlers.onSelectMatchup('chinu', 'priyanshu');
      this.setModalOpen(false);
    });

    this.modalPickPriyanshu.addEventListener('click', () => {
      unlockAndBlur();
      this.handlers.onSelectMatchup('priyanshu', 'modiji');
      this.setModalOpen(false);
    });

    this.modalPickModiji.addEventListener('click', () => {
      unlockAndBlur();
      this.handlers.onSelectMatchup('modiji', 'priyanshu');
      this.setModalOpen(false);
    });

    this.btnSoundToggle.addEventListener('click', () => {
      unlockAndBlur(this.btnSoundToggle);
      this.handlers.onToggleMute();
    });

    this.btnOpenSelect.addEventListener('click', () => {
      unlockAndBlur(this.btnOpenSelect);
      this.setModalOpen(true);
    });

    this.btnMuayThai.addEventListener('click', () => {
      unlockAndBlur(this.btnMuayThai);
      this.handlers.onMuayThaiAction();
    });

    this.btnBossPose.addEventListener('click', () => {
      unlockAndBlur(this.btnBossPose);
      this.handlers.onBossPoseAction();
    });

    this.btnLoungePose.addEventListener('click', () => {
      unlockAndBlur(this.btnLoungePose);
      this.handlers.onLoungePoseAction();
    });

    this.btnChampPose.addEventListener('click', () => {
      unlockAndBlur(this.btnChampPose);
      this.handlers.onChampPoseAction();
    });

    this.btnRingEntry.addEventListener('click', () => {
      unlockAndBlur(this.btnRingEntry);
      this.handlers.onRingEntryAction();
    });

    this.btnResetHp.addEventListener('click', () => {
      unlockAndBlur(this.btnResetHp);
      this.handlers.onHealPriyanshu();
    });

    this.charModalBackdrop.addEventListener('click', (event) => {
      if (event.target === this.charModalBackdrop) {
        unlockAndBlur();
        this.setModalOpen(false);
      }
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      this.handlers.onUserGesture();
      this.handlers.onCanvasPointerDown(event.clientX, event.clientY);
    });

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.handlers.onUserGesture();

    if (this.isMovementCode(event.code)) {
      this.pressedKeys.add(event.code);
      this.emitMovementVector();
      return;
    }

    if (event.repeat) return;

    const keyActionMap: Record<string, () => void> = {
      Space: () => this.handlers.onPrimaryAction(),
      KeyK: () => this.handlers.onKickAction(),
      KeyF: () => this.handlers.onSignatureAction(),
      KeyC: () => this.handlers.onCounterAction(),
      KeyM: () => this.handlers.onMuayThaiAction(),
      KeyP: () => this.handlers.onBossPoseAction(),
      KeyL: () => this.handlers.onLoungePoseAction(),
      KeyV: () => this.handlers.onChampPoseAction(),
      KeyE: () => this.handlers.onRingEntryAction(),
    };

    const actionHandler = keyActionMap[event.code];
    if (actionHandler) {
      if (event.code === 'Space') {
        event.preventDefault();
      }
      if (!this.charModalBackdrop.classList.contains('hidden')) {
        this.setModalOpen(false);
      }
      actionHandler();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.isMovementCode(event.code)) {
      this.pressedKeys.delete(event.code);
      this.emitMovementVector();
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.pressedKeys.clear();
    this.handlers.onMoveInput(0, 0);
  };

  private isMovementCode(code: string): boolean {
    return (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    );
  }

  private emitMovementVector(): void {
    const left = this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft') ? 1 : 0;
    const right = this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight') ? 1 : 0;
    const up = this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp') ? 1 : 0;
    const down = this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown') ? 1 : 0;
    this.handlers.onMoveInput(right - left, down - up);
  }

  public setModalOpen(open: boolean): void {
    this.charModalBackdrop.classList.toggle('hidden', !open);
  }

  public isModalOpen(): boolean {
    return !this.charModalBackdrop.classList.contains('hidden');
  }

  private renderFighterSlot(
    slot: FighterHUDSlotElements,
    fighter: FighterHUDInfo,
    isPlayer: boolean
  ): void {
    slot.card.classList.toggle('fighter-hud--is-player', isPlayer);
    slot.badge.classList.toggle('hidden', !isPlayer);

    slot.name.textContent = fighter.displayName.toUpperCase();
    slot.tag.textContent = fighter.roleTag;
    slot.tag.classList.toggle('fighter-tag--boss', fighter.isBossInfinite);
    slot.tag.classList.toggle('fighter-tag--target', !fighter.isBossInfinite);

    slot.avatar.className = `fighter-avatar fighter-avatar--${fighter.id}`;
    slot.avatarImg.src = PORTRAIT_MAP[fighter.id];
    slot.avatarImg.alt = fighter.displayName;

    slot.track.classList.toggle('health-bar-track--infinite', fighter.isBossInfinite);
    slot.healthText.classList.toggle('health-value--infinite', fighter.isBossInfinite);

    if (fighter.isBossInfinite) {
      slot.trail.style.width = '100%';
      slot.fill.style.width = '100%';
      slot.fill.className = 'health-bar-fill health-bar-fill--infinite';
      slot.healthText.textContent = '∞ / ∞ UNBREAKABLE';
    } else {
      const hpPercent = Math.max(0, Math.min(100, (fighter.hp / fighter.maxHp) * 100));
      slot.trail.style.width = `${hpPercent}%`;
      slot.fill.style.width = `${hpPercent}%`;
      slot.fill.className = `health-bar-fill health-bar-fill--priyanshu${hpPercent <= 35 ? ' health-bar-fill--low' : ''}`;
      slot.healthText.textContent = `${fighter.hp} / ${fighter.maxHp} HP`;
    }
  }

  public renderState(state: GameHUDState): void {
    this.renderFighterSlot(
      this.leftSlot,
      state.leftFighter,
      state.selectedCharacter === state.leftFighter.id
    );
    this.renderFighterSlot(
      this.rightSlot,
      state.rightFighter,
      state.selectedCharacter === state.rightFighter.id
    );

    (['chinu', 'priyanshu', 'modiji'] as CharacterId[]).forEach((charId) => {
      this.playPills[charId].classList.toggle(
        'char-pill--active',
        state.selectedCharacter === charId
      );
      this.oppPills[charId].classList.toggle(
        'char-pill--active',
        state.opponentCharacter === charId
      );
    });

    this.comboCount.textContent = String(state.comboHits);
    if (state.comboHits > this.previousCombo) {
      this.comboBadge.classList.remove('combo-badge--pop');
      void this.comboBadge.offsetWidth;
      this.comboBadge.classList.add('combo-badge--pop');
      window.setTimeout(() => this.comboBadge.classList.remove('combo-badge--pop'), 180);
    }
    this.previousCombo = state.comboHits;

    this.reliefValue.textContent = `${Math.min(100, state.stressReliefPercent)}%`;
    this.btnSoundToggle.textContent = state.isMuted ? '🔇 MUTED' : '🔊 SFX ON';

    if (state.targetQuip && state.targetQuip !== this.lastQuip) {
      this.lastQuip = state.targetQuip;
      this.showQuip(state.targetQuipSpeaker, state.targetQuip);
    }

    const oppName =
      state.opponentCharacter === state.leftFighter.id
        ? state.leftFighter.displayName
        : state.rightFighter.displayName;
    const playerName =
      state.selectedCharacter === state.leftFighter.id
        ? state.leftFighter.displayName
        : state.rightFighter.displayName;

    if (state.opponentCharacter === 'chinu') {
      this.btnPunchLabel.textContent = 'ATTACK CHINU!';
      this.btnKickLabel.textContent = 'TRY KICK!';
      this.btnSignatureLabel.textContent = 'TRY FINISHER!';
      this.btnSignatureSub.textContent = 'vs Real Boss ⚡';
      this.btnCounterLabel.textContent = 'COUNTER';
      this.btnCounterSub.textContent = `${playerName} Attacks`;
      const priyanshuPoseHint =
        state.selectedCharacter === 'priyanshu'
          ? ' • <kbd>P</kbd> Pushups • <kbd>L</kbd> Lounge'
          : '';
      this.modeBanner.innerHTML =
        `Playing as <strong>${playerName}</strong> vs <strong>Chinu</strong> — Move with <kbd>WASD</kbd>${priyanshuPoseHint}, or try <kbd>Space</kbd>/<kbd>F</kbd>/clicking Chinu!`;
    } else if (state.selectedCharacter === 'chinu') {
      this.btnPunchLabel.textContent = 'PUNCH!';
      this.btnKickLabel.textContent = 'BOSS KICK!';
      this.btnSignatureLabel.textContent = 'SIGNATURE!';
      this.btnSignatureSub.textContent = 'Boss Spank 👋';
      this.btnCounterLabel.textContent = 'COUNTER';
      this.btnCounterSub.textContent = `${oppName} Attacks`;
      this.modeBanner.innerHTML =
        `<kbd>WASD</kbd> Run • <kbd>Space</kbd> Punch • <kbd>K</kbd> Kick • <kbd>F</kbd> Signature • <kbd>C</kbd> Counter • <kbd>M</kbd> Muay Thai • <kbd>P</kbd> Pose • <kbd>L</kbd> Dance • <kbd>V</kbd> Stance • <kbd>E</kbd> Entry • Or <strong>Click ${oppName}!</strong>`;
    } else if (state.selectedCharacter === 'modiji') {
      this.btnPunchLabel.textContent = 'PUNCH!';
      this.btnKickLabel.textContent = 'KICK!';
      this.btnSignatureLabel.textContent = 'LASER EYES!';
      this.btnSignatureSub.textContent = 'Burn Opponent 🔥';
      this.btnCounterLabel.textContent = `${oppName.toUpperCase()} HIT!`;
      this.btnCounterSub.textContent = `${oppName} Strikes Back 🥊`;
      this.modeBanner.innerHTML =
        `Playing as <strong>Modiji</strong> vs <strong>${oppName}</strong> — <kbd>F</kbd> Laser Eyes 🔥 • <kbd>Space</kbd> Punch • <kbd>K</kbd> Kick • <kbd>M</kbd> Mix • <kbd>P</kbd> Flip • <kbd>L</kbd> Cheer • <kbd>E</kbd> Entry!`;
    } else {
      this.btnPunchLabel.textContent = 'PUNCH!';
      this.btnKickLabel.textContent = 'DROP KICK!';
      this.btnSignatureLabel.textContent = 'SIGNATURE!';
      this.btnSignatureSub.textContent = 'Turbo Flurry ⚡';
      this.btnCounterLabel.textContent = `${oppName.toUpperCase()} HIT!`;
      this.btnCounterSub.textContent = `${oppName} Strikes Back 🥊`;
      const extraHint =
        state.selectedCharacter === 'priyanshu'
          ? ' • <kbd>M</kbd> Kick-Punch • <kbd>P</kbd> Pushups • <kbd>L</kbd> Lounge • <kbd>E</kbd> Entry'
          : '';
      this.modeBanner.innerHTML =
        `Playing as <strong>${playerName}</strong> vs <strong>${oppName}</strong> — <kbd>WASD</kbd> Run • <kbd>Space</kbd> Punch • <kbd>K</kbd> Kick • <kbd>F</kbd> Combo${extraHint} • Or <strong>Click ${oppName}!</strong>`;
    }

    const isChinuPriyanshu =
      (state.leftFighter.id === 'chinu' && state.rightFighter.id === 'priyanshu') ||
      (state.leftFighter.id === 'priyanshu' && state.rightFighter.id === 'chinu');
    this.btnResetHp.textContent = isChinuPriyanshu ? 'Heal Priyanshu 💕' : 'Heal Fighters ✨';

    const showComboAndPoseExtras = true;
    const isChinuSelected = state.selectedCharacter === 'chinu';
    this.btnMuayThai.classList.toggle('hidden', !showComboAndPoseExtras);
    this.btnBossPose.classList.toggle('hidden', !showComboAndPoseExtras);
    this.btnLoungePose.classList.toggle('hidden', !showComboAndPoseExtras);
    this.btnChampPose.classList.toggle('hidden', !isChinuSelected);
    this.btnRingEntry.classList.remove('hidden');

    if (isChinuSelected) {
      this.btnMuayThai.textContent = '🥋 Muay Thai Mix (M)';
      this.btnBossPose.textContent = '😎 Boss Pose (P)';
      this.btnLoungePose.textContent = '💃 Boxer Dance (L)';
      this.btnRingEntry.textContent = '🐆 Ring Entry (E)';
    } else if (state.selectedCharacter === 'modiji') {
      this.btnMuayThai.textContent = '🥋 Kick-Punch Mix (M)';
      this.btnBossPose.textContent = '🤸 Aerial Flip (P)';
      this.btnLoungePose.textContent = '🙌 Victory Cheer (L)';
      this.btnRingEntry.textContent = '⚡ Ring Entry (E)';
    } else {
      this.btnMuayThai.textContent = '🥊 Kick-Punch Combo (M)';
      this.btnBossPose.textContent = '💪 Pushups (P)';
      this.btnLoungePose.textContent = '🛋️ Lounge Pose (L)';
      this.btnRingEntry.textContent = '🔥 Ring Entry (E)';
    }

    this.btnPunch.disabled = state.isCounterSequenceActive;
    this.btnKick.disabled = state.isCounterSequenceActive;
    this.btnSignature.disabled = state.isCounterSequenceActive;
    this.btnCounter.disabled = state.isCounterSequenceActive;
    this.btnMuayThai.disabled = state.isCounterSequenceActive;
    this.btnBossPose.disabled = state.isCounterSequenceActive;
    this.btnLoungePose.disabled = state.isCounterSequenceActive;
    this.btnChampPose.disabled = state.isCounterSequenceActive;
    this.btnRingEntry.disabled = state.isCounterSequenceActive;
    this.btnResetHp.disabled = state.isCounterSequenceActive;
  }

  private showQuip(speaker: string, text: string): void {
    this.quipBubble.textContent = `${speaker}: "${text}"`;
    this.quipBubble.classList.remove('hidden');
    gsap.killTweensOf(this.quipBubble);
    gsap.fromTo(
      this.quipBubble,
      { scale: 0.75, opacity: 0, y: -6 },
      { scale: 1, opacity: 1, y: 0, duration: 0.2, ease: 'back.out(2)' }
    );

    if (this.quipHideTimer) clearTimeout(this.quipHideTimer);
    this.quipHideTimer = window.setTimeout(() => {
      gsap.to(this.quipBubble, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => this.quipBubble.classList.add('hidden'),
      });
    }, 1800);
  }

  public showBossToast(message = "You can't mess with the real boss."): void {
    const textEl = this.bossToast.querySelector('.boss-toast-text');
    if (textEl) {
      textEl.textContent = message;
    }

    this.toastTimeline?.kill();
    this.bossToastBackdrop.classList.remove('hidden');

    gsap.set(this.bossToast, { scale: 0.35, rotation: -12, opacity: 0, y: 24 });
    gsap.set(this.bossToastBackdrop, { opacity: 0 });

    this.toastTimeline = gsap.timeline({
      onComplete: () => {
        this.bossToastBackdrop.classList.add('hidden');
      },
    });

    this.toastTimeline
      .to(this.bossToastBackdrop, { opacity: 1, duration: 0.12, ease: 'power1.out' })
      .to(
        this.bossToast,
        {
          scale: 1,
          rotation: -2,
          opacity: 1,
          y: 0,
          duration: 0.34,
          ease: 'elastic.out(1.15, 0.55)',
        },
        0
      )
      .to(this.bossToast, {
        scale: 1.04,
        rotation: 1.5,
        duration: 0.18,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut',
        delay: 0.45,
      })
      .to([this.bossToast, this.bossToastBackdrop], {
        opacity: 0,
        scale: 0.85,
        duration: 0.28,
        delay: 0.38,
        ease: 'power2.in',
      });
  }

  public showKOBanner(show: boolean, titleText?: string, subText?: string): void {
    if (titleText) {
      this.koTitle.textContent = titleText;
    }
    if (subText) {
      this.koSub.textContent = subText;
    }
    this.koBanner.classList.toggle('hidden', !show);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    if (this.quipHideTimer) clearTimeout(this.quipHideTimer);
    this.toastTimeline?.kill();
  }
}
