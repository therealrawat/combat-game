import * as THREE from 'three';
import { FighterState } from '../types/game';

interface PoseFrame {
  time: number;
  hipsPos: [number, number, number];
  hipsRot: [number, number, number];
  torsoRot: [number, number, number];
  headRot: [number, number, number];
  armLRot: [number, number, number];
  armRRot: [number, number, number];
  legLRot: [number, number, number];
  legRRot: [number, number, number];
}

const NEUTRAL_HIPS_Y = 0.95;

function toQuaternionValues(rotations: Array<[number, number, number]>): number[] {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const quat = new THREE.Quaternion();
  const values: number[] = [];

  for (const [rx, ry, rz] of rotations) {
    euler.set(rx, ry, rz, 'YXZ');
    quat.setFromEuler(euler);
    values.push(quat.x, quat.y, quat.z, quat.w);
  }

  return values;
}

function buildClipFromPoseFrames(name: string, frames: PoseFrame[]): THREE.AnimationClip {
  const times = frames.map((f) => f.time);

  const hipsPosValues: number[] = [];
  for (const f of frames) {
    hipsPosValues.push(f.hipsPos[0], f.hipsPos[1], f.hipsPos[2]);
  }

  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack('Hips.position', times, hipsPosValues),
    new THREE.QuaternionKeyframeTrack(
      'Hips.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.hipsRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'Torso.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.torsoRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'Head.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.headRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'ArmL.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.armLRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'ArmR.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.armRRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'LegL.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.legLRot))
    ),
    new THREE.QuaternionKeyframeTrack(
      'LegR.quaternion',
      times,
      toQuaternionValues(frames.map((f) => f.legRRot))
    ),
  ];

  return new THREE.AnimationClip(name, times[times.length - 1], tracks);
}

/**
 * Generates procedural THREE.AnimationClip assets for all fighter states.
 * Negative X rotation swings hanging limbs (+Y down) forward toward +Z.
 */
export function createProceduralClips(): Partial<Record<FighterState, THREE.AnimationClip>> {
  // 1. Bouncy arcade fighting guard idle
  const IDLE = buildClipFromPoseFrames('IDLE', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.35,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.06, 0],
      hipsRot: [0.04, 0.18, 0],
      torsoRot: [0.1, 0.12, 0.03],
      headRot: [-0.08, -0.22, -0.03],
      armLRot: [-1.05, 0.22, 0.22],
      armRRot: [-1.2, -0.26, -0.22],
      legLRot: [-0.22, 0, 0.1],
      legRRot: [0.22, 0, -0.1],
    },
    {
      time: 0.7,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 2. Explosive Punch
  const PUNCH = buildClipFromPoseFrames('PUNCH', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.08,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.07, -0.06],
      hipsRot: [0, -0.25, 0],
      torsoRot: [0.05, -0.35, 0],
      headRot: [0, 0.35, 0],
      armLRot: [-1.15, 0.2, 0.3],
      armRRot: [0.45, -0.1, -0.35],
      legLRot: [-0.2, 0, 0.08],
      legRRot: [0.25, 0, -0.08],
    },
    {
      time: 0.17,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.03, 0.26],
      hipsRot: [0.06, 0.35, 0],
      torsoRot: [0.15, 0.55, -0.06],
      headRot: [-0.1, -0.65, 0.05],
      armLRot: [-0.45, 0.25, 0.45],
      armRRot: [-1.62, 0.08, 0.06],
      legLRot: [-0.35, 0, 0.08],
      legRRot: [0.42, 0, -0.08],
    },
    {
      time: 0.27,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.02, 0.18],
      hipsRot: [0.04, 0.28, 0],
      torsoRot: [0.1, 0.4, -0.04],
      headRot: [-0.08, -0.45, 0],
      armLRot: [-0.65, 0.2, 0.3],
      armRRot: [-1.52, 0.04, 0],
      legLRot: [-0.25, 0, 0.08],
      legRRot: [0.3, 0, -0.08],
    },
    {
      time: 0.38,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 3. Boss High Kick Override
  const KICK = buildClipFromPoseFrames('KICK', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.1,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.06, -0.04],
      hipsRot: [-0.08, -0.2, -0.08],
      torsoRot: [-0.12, -0.18, 0.08],
      headRot: [0.12, 0.28, 0],
      armLRot: [-0.6, 0.2, 0.85],
      armRRot: [-0.6, -0.2, -0.85],
      legLRot: [0.05, 0, 0.05],
      legRRot: [-0.95, 0, -0.15],
    },
    {
      time: 0.22,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.16, 0.24],
      hipsRot: [-0.24, 0.15, -0.14],
      torsoRot: [-0.28, 0.22, 0.12],
      headRot: [0.22, -0.25, 0],
      armLRot: [-0.4, 0.1, 1.1],
      armRRot: [-0.5, -0.1, -1.05],
      legLRot: [0.18, 0, 0.04],
      legRRot: [-1.78, 0.1, -0.2],
    },
    {
      time: 0.36,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.08, 0.15],
      hipsRot: [-0.15, 0.12, -0.08],
      torsoRot: [-0.16, 0.14, 0.08],
      headRot: [0.12, -0.18, 0],
      armLRot: [-0.7, 0.15, 0.6],
      armRRot: [-0.8, -0.15, -0.6],
      legLRot: [0.08, 0, 0.05],
      legRRot: [-1.35, 0.05, -0.12],
    },
    {
      time: 0.5,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 4. Comical Hit / Flinch Reaction
  const HIT = buildClipFromPoseFrames('HIT', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.09,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.1, -0.16],
      hipsRot: [-0.14, -0.18, 0.08],
      torsoRot: [-0.45, -0.25, -0.12],
      headRot: [-0.48, 0.22, 0.15],
      armLRot: [-0.35, 0, 0.95],
      armRRot: [-0.35, 0, -0.95],
      legLRot: [-0.28, 0, 0.14],
      legRRot: [0.05, 0, -0.14],
    },
    {
      time: 0.22,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.05, -0.1],
      hipsRot: [-0.08, -0.08, 0.04],
      torsoRot: [-0.26, -0.12, -0.06],
      headRot: [-0.24, 0.12, 0.08],
      armLRot: [-0.55, 0.1, 0.65],
      armRRot: [-0.55, -0.1, -0.65],
      legLRot: [-0.2, 0, 0.1],
      legRRot: [0.1, 0, -0.1],
    },
    {
      time: 0.36,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 5. Priyanshu Attempt Attack (telegraphed wind-up before Chinu interrupts)
  const ATTEMPT_ATTACK = buildClipFromPoseFrames('ATTEMPT_ATTACK', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.18,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.08, 0.06],
      hipsRot: [0, -0.35, 0],
      torsoRot: [0.1, -0.42, 0],
      headRot: [-0.05, 0.45, 0],
      armLRot: [-1.25, 0.15, 0.25],
      armRRot: [0.75, -0.15, -0.55],
      legLRot: [-0.28, 0, 0.1],
      legRRot: [0.3, 0, -0.1],
    },
    {
      time: 0.38,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.04, 0.2],
      hipsRot: [0.05, 0.08, 0],
      torsoRot: [0.12, 0.14, 0],
      headRot: [-0.05, -0.14, 0],
      armLRot: [-0.7, 0.2, 0.35],
      armRRot: [-0.5, -0.1, -0.25],
      legLRot: [-0.28, 0, 0.1],
      legRRot: [0.28, 0, -0.1],
    },
  ]);

  // 6. Priyanshu Falls Back Flat on the Ring Mat (clamped when finished)
  const FALL_BACK = buildClipFromPoseFrames('FALL_BACK', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0, 0],
      torsoRot: [-0.25, 0, 0],
      headRot: [-0.35, 0, 0],
      armLRot: [-0.3, 0, 0.9],
      armRRot: [-0.3, 0, -0.9],
      legLRot: [-0.3, 0, 0.15],
      legRRot: [-0.3, 0, -0.15],
    },
    {
      time: 0.2,
      hipsPos: [0, 0.72, -0.25],
      hipsRot: [-0.95, 0, 0.1],
      torsoRot: [-0.25, 0, 0],
      headRot: [0.1, 0.15, 0],
      armLRot: [-0.1, 0, 1.3],
      armRRot: [-0.1, 0, -1.3],
      legLRot: [-0.55, 0, 0.2],
      legRRot: [-0.7, 0, -0.2],
    },
    {
      time: 0.42,
      hipsPos: [0, 0.24, -0.45],
      hipsRot: [-1.52, 0, 0.04],
      torsoRot: [-0.04, 0, 0],
      headRot: [0.2, -0.12, 0],
      armLRot: [0.05, 0, 1.38],
      armRRot: [0.05, 0, -1.38],
      legLRot: [-0.18, 0, 0.16],
      legRRot: [-0.28, 0, -0.18],
    },
  ]);

  // 7. Groggy Get Up
  const GET_UP = buildClipFromPoseFrames('GET_UP', [
    {
      time: 0,
      hipsPos: [0, 0.24, -0.45],
      hipsRot: [-1.52, 0, 0.04],
      torsoRot: [-0.04, 0, 0],
      headRot: [0.2, -0.12, 0],
      armLRot: [0.05, 0, 1.38],
      armRRot: [0.05, 0, -1.38],
      legLRot: [-0.18, 0, 0.16],
      legRRot: [-0.28, 0, -0.18],
    },
    {
      time: 0.28,
      hipsPos: [0, 0.56, -0.18],
      hipsRot: [-0.55, 0, 0],
      torsoRot: [0.35, 0, 0],
      headRot: [-0.15, 0, 0],
      armLRot: [-0.9, 0, 0.35],
      armRRot: [-0.9, 0, -0.35],
      legLRot: [-0.55, 0, 0.12],
      legRRot: [-0.35, 0, -0.12],
    },
    {
      time: 0.55,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 8. Signature Move: Chinu Spanks Priyanshu (3 rhythmic slaps)
  const SIGNATURE = buildClipFromPoseFrames('SIGNATURE', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.05, 0],
      torsoRot: [0.16, 0, 0],
      headRot: [-0.08, 0, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [0.95, 0, -0.45],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    // Windup 1
    {
      time: 0.14,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.03, 0],
      hipsRot: [0, -0.18, 0],
      torsoRot: [0.22, -0.25, 0],
      headRot: [-0.1, 0.15, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [1.18, -0.1, -0.55],
      legLRot: [-0.16, 0, 0.08],
      legRRot: [0.18, 0, -0.08],
    },
    // SLAP 1
    {
      time: 0.24,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.05, 0.08],
      hipsRot: [0.05, 0.22, 0],
      torsoRot: [0.28, 0.42, -0.08],
      headRot: [-0.14, -0.22, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [-1.08, 0.15, 0.18],
      legLRot: [-0.2, 0, 0.08],
      legRRot: [0.22, 0, -0.08],
    },
    // Windup 2
    {
      time: 0.36,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.02, 0],
      hipsRot: [0, -0.2, 0],
      torsoRot: [0.22, -0.28, 0],
      headRot: [-0.1, 0.16, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [1.22, -0.1, -0.58],
      legLRot: [-0.16, 0, 0.08],
      legRRot: [0.18, 0, -0.08],
    },
    // SLAP 2
    {
      time: 0.46,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.05, 0.08],
      hipsRot: [0.05, 0.24, 0],
      torsoRot: [0.28, 0.45, -0.08],
      headRot: [-0.14, -0.24, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [-1.1, 0.15, 0.18],
      legLRot: [-0.2, 0, 0.08],
      legRRot: [0.22, 0, -0.08],
    },
    // HUGE Windup 3
    {
      time: 0.6,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.04, -0.05],
      hipsRot: [-0.04, -0.35, 0],
      torsoRot: [0.18, -0.45, 0.08],
      headRot: [-0.08, 0.3, 0],
      armLRot: [-0.3, 0.25, 0.72],
      armRRot: [1.52, -0.15, -0.68],
      legLRot: [-0.14, 0, 0.1],
      legRRot: [0.2, 0, -0.1],
    },
    // MEGA SPANK 3
    {
      time: 0.72,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.06, 0.16],
      hipsRot: [0.08, 0.34, 0],
      torsoRot: [0.34, 0.56, -0.12],
      headRot: [-0.18, -0.35, 0],
      armLRot: [-0.25, 0.25, 0.65],
      armRRot: [-1.22, 0.2, 0.25],
      legLRot: [-0.24, 0, 0.08],
      legRRot: [0.26, 0, -0.08],
    },
    {
      time: 0.98,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 8b. Priyanshu Bent Over Receiving Spanks (synced to SIGNATURE slaps at 0.24, 0.46, 0.72)
  const SPANKED = buildClipFromPoseFrames('SPANKED', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.08, 0],
      hipsRot: [0.08, 0, 0],
      torsoRot: [1.05, 0, 0],
      headRot: [-0.55, 0, 0],
      armLRot: [-0.65, 0, 0.22],
      armRRot: [-0.65, 0, -0.22],
      legLRot: [-0.22, 0, 0.1],
      legRRot: [-0.22, 0, -0.1],
    },
    {
      time: 0.21,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.08, 0],
      hipsRot: [0.08, 0, 0],
      torsoRot: [1.05, 0, 0],
      headRot: [-0.55, 0, 0],
      armLRot: [-0.65, 0, 0.22],
      armRRot: [-0.65, 0, -0.22],
      legLRot: [-0.22, 0, 0.1],
      legRRot: [-0.22, 0, -0.1],
    },
    // Flinch 1
    {
      time: 0.26,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.06, 0.08],
      hipsRot: [0.22, 0, 0.08],
      torsoRot: [1.26, 0, 0.1],
      headRot: [-0.72, 0.2, 0],
      armLRot: [-0.4, 0, 0.75],
      armRRot: [-0.4, 0, -0.75],
      legLRot: [-0.08, 0, 0.12],
      legRRot: [-0.08, 0, -0.12],
    },
    {
      time: 0.42,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.08, 0],
      hipsRot: [0.08, 0, 0],
      torsoRot: [1.05, 0, 0],
      headRot: [-0.55, 0, 0],
      armLRot: [-0.65, 0, 0.22],
      armRRot: [-0.65, 0, -0.22],
      legLRot: [-0.22, 0, 0.1],
      legRRot: [-0.22, 0, -0.1],
    },
    // Flinch 2
    {
      time: 0.48,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.08, 0.08],
      hipsRot: [0.24, 0, -0.08],
      torsoRot: [1.28, 0, -0.1],
      headRot: [-0.74, -0.22, 0],
      armLRot: [-0.35, 0, 0.85],
      armRRot: [-0.35, 0, -0.85],
      legLRot: [-0.06, 0, 0.12],
      legRRot: [-0.06, 0, -0.12],
    },
    {
      time: 0.68,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.08, 0],
      hipsRot: [0.08, 0, 0],
      torsoRot: [1.05, 0, 0],
      headRot: [-0.55, 0, 0],
      armLRot: [-0.65, 0, 0.22],
      armRRot: [-0.65, 0, -0.22],
      legLRot: [-0.22, 0, 0.1],
      legRRot: [-0.22, 0, -0.1],
    },
    // MEGA Flinch 3
    {
      time: 0.74,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.2, 0.14],
      hipsRot: [0.34, 0, 0],
      torsoRot: [1.38, 0, 0],
      headRot: [-0.85, 0, 0],
      armLRot: [-0.2, 0, 1.15],
      armRRot: [-0.2, 0, -1.15],
      legLRot: [0.08, 0, 0.14],
      legRRot: [0.08, 0, -0.14],
    },
  ]);

  // 9. Chinu Kisses Priyanshu
  const KISS = buildClipFromPoseFrames('KISS', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.05, 0],
      torsoRot: [0.04, 0, 0],
      headRot: [0, 0, 0],
      armLRot: [-0.5, 0, 0.2],
      armRRot: [-0.5, 0, -0.2],
      legLRot: [-0.05, 0, 0.05],
      legRRot: [0.05, 0, -0.05],
    },
    {
      time: 0.25,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.06, 0.14],
      hipsRot: [0.08, 0, 0],
      torsoRot: [0.24, 0, 0],
      headRot: [0.12, 0, -0.08],
      armLRot: [0.35, -0.2, 0.3],
      armRRot: [0.35, 0.2, -0.3],
      legLRot: [0.12, 0, 0.06],
      legRRot: [0.28, 0, -0.06],
    },
    {
      time: 0.72,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.08, 0.18],
      hipsRot: [0.1, 0, 0],
      torsoRot: [0.28, 0, 0],
      headRot: [0.14, 0, -0.1],
      armLRot: [0.4, -0.25, 0.32],
      armRRot: [0.4, 0.25, -0.32],
      legLRot: [0.14, 0, 0.06],
      legRRot: [0.32, 0, -0.06],
    },
    {
      time: 1.05,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 10. Priyanshu Blushes & Swoons
  const BLUSH = buildClipFromPoseFrames('BLUSH', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0, 0],
      torsoRot: [0, 0, 0],
      headRot: [0, 0, 0],
      armLRot: [-0.7, 0.2, 0.2],
      armRRot: [-0.7, -0.2, -0.2],
      legLRot: [-0.05, 0, 0.05],
      legRRot: [0.05, 0, -0.05],
    },
    {
      time: 0.28,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.05, -0.02],
      hipsRot: [-0.06, 0, 0],
      torsoRot: [-0.08, 0, 0.06],
      headRot: [-0.08, 0, 0.16],
      armLRot: [-1.35, -0.45, -0.35],
      armRRot: [-1.35, 0.45, 0.35],
      legLRot: [0.05, 0, 0.06],
      legRRot: [0.05, 0, -0.06],
    },
    {
      time: 0.72,
      hipsPos: [0, NEUTRAL_HIPS_Y + 0.09, -0.02],
      hipsRot: [-0.08, 0, 0],
      torsoRot: [-0.1, 0, -0.06],
      headRot: [-0.1, 0, -0.15],
      armLRot: [-1.42, -0.48, -0.35],
      armRRot: [-1.42, 0.48, 0.35],
      legLRot: [0.08, 0, 0.06],
      legRRot: [0.08, 0, -0.06],
    },
    {
      time: 1.05,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.14, 0],
      torsoRot: [0.06, 0.1, 0],
      headRot: [-0.04, -0.18, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
  ]);

  // 11. Laser Eyes Power Stare
  const LASER_EYES = buildClipFromPoseFrames('LASER_EYES', [
    {
      time: 0,
      hipsPos: [0, NEUTRAL_HIPS_Y, 0],
      hipsRot: [0, 0.08, 0],
      torsoRot: [0.06, 0, 0],
      headRot: [-0.04, 0, 0],
      armLRot: [-0.95, 0.18, 0.2],
      armRRot: [-1.1, -0.22, -0.2],
      legLRot: [-0.14, 0, 0.08],
      legRRot: [0.16, 0, -0.08],
    },
    {
      time: 0.22,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.04, 0.06],
      hipsRot: [0.05, 0, 0],
      torsoRot: [0.12, 0, 0],
      headRot: [-0.06, 0, 0],
      armLRot: [-0.35, -0.2, 0.42],
      armRRot: [-0.35, 0.2, -0.42],
      legLRot: [-0.22, 0, 0.14],
      legRRot: [0.22, 0, -0.14],
    },
    {
      time: 1.25,
      hipsPos: [0, NEUTRAL_HIPS_Y - 0.04, 0.06],
      hipsRot: [0.05, 0, 0],
      torsoRot: [0.12, 0, 0],
      headRot: [-0.06, 0, 0],
      armLRot: [-0.35, -0.2, 0.42],
      armRRot: [-0.35, 0.2, -0.42],
      legLRot: [-0.22, 0, 0.14],
      legRRot: [0.22, 0, -0.14],
    },
  ]);

  return {
    IDLE,
    PUNCH,
    KICK,
    SIGNATURE,
    SPANKED,
    KISS,
    BLUSH,
    LASER_EYES,
    HIT,
    ATTEMPT_ATTACK,
    FALL_BACK,
    GET_UP,
  };
}

