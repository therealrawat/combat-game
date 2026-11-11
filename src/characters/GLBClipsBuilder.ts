import * as THREE from 'three';
import { FighterState } from '../types/game';

interface BoneRestData {
  node: THREE.Object3D;
  localQuat: THREE.Quaternion;
  worldQuatInv: THREE.Quaternion;
  worldQuat: THREE.Quaternion;
  restPos: THREE.Vector3;
}

type CharEulerMap = Record<string, [number, number, number]>;

interface GLBPoseKeyframe {
  time: number;
  hipsOffset?: [number, number, number];
  bones: CharEulerMap;
}

const ANIMATED_BONE_NAMES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
] as const;

/**
 * Generates retargeted THREE.AnimationClips for Mixamo/Avaturn humanoid GLB rigs
 * by mapping character-space Euler pose deltas onto each bone's exact rest orientation.
 */
export function createHumanoidGLBClips(
  gltfScene: THREE.Object3D
): Partial<Record<FighterState, THREE.AnimationClip>> {
  gltfScene.updateMatrixWorld(true);

  // Strip parent/root transforms (e.g. modelRoot facing yaw) so bone rest orientations
  // stay strictly in GLTF character-local space (+Y up, +Z forward, +X left).
  const sceneWorldQuat = new THREE.Quaternion();
  gltfScene.getWorldQuaternion(sceneWorldQuat);
  const sceneWorldQuatInv = sceneWorldQuat.clone().invert();

  const boneRest = new Map<string, BoneRestData>();
  const activeBoneNames: string[] = [];

  for (const name of ANIMATED_BONE_NAMES) {
    const node = gltfScene.getObjectByName(name);
    if (!node) continue;

    const worldQuat = new THREE.Quaternion();
    node.getWorldQuaternion(worldQuat);
    worldQuat.premultiply(sceneWorldQuatInv);

    boneRest.set(name, {
      node,
      localQuat: node.quaternion.clone(),
      worldQuat,
      worldQuatInv: worldQuat.clone().invert(),
      restPos: node.position.clone(),
    });
    activeBoneNames.push(name);
  }

  const hipsRest = boneRest.get('Hips');
  const hipsRestPos = hipsRest ? hipsRest.restPos.clone() : new THREE.Vector3(0, 0.96, 0);

  const eulerTmp = new THREE.Euler(0, 0, 0, 'XYZ');
  const charDeltaTmp = new THREE.Quaternion();
  const localDeltaTmp = new THREE.Quaternion();
  const finalQuatTmp = new THREE.Quaternion();

  const toLocalQuat = (boneName: string, rx = 0, ry = 0, rz = 0): [number, number, number, number] => {
    const rest = boneRest.get(boneName);
    if (!rest) return [0, 0, 0, 1];

    if (rx === 0 && ry === 0 && rz === 0) {
      return [rest.localQuat.x, rest.localQuat.y, rest.localQuat.z, rest.localQuat.w];
    }

    // Target local = localRest * (worldRest^-1 * deltaChar * worldRest)
    eulerTmp.set(rx, ry, rz, 'XYZ');
    charDeltaTmp.setFromEuler(eulerTmp);
    localDeltaTmp
      .copy(rest.worldQuatInv)
      .multiply(charDeltaTmp)
      .multiply(rest.worldQuat);

    finalQuatTmp.copy(rest.localQuat).multiply(localDeltaTmp).normalize();
    return [finalQuatTmp.x, finalQuatTmp.y, finalQuatTmp.z, finalQuatTmp.w];
  };

  const buildClip = (name: string, keyframes: GLBPoseKeyframe[]): THREE.AnimationClip => {
    const times = keyframes.map((kf) => kf.time);
    const tracks: THREE.KeyframeTrack[] = [];

    // Animate Hips.position relative to rest position
    if (hipsRest) {
      const posValues: number[] = [];
      for (const kf of keyframes) {
        const [dx, dy, dz] = kf.hipsOffset ?? [0, 0, 0];
        posValues.push(hipsRestPos.x + dx, hipsRestPos.y + dy, hipsRestPos.z + dz);
      }
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, posValues));
    }

    for (const boneName of activeBoneNames) {
      const quatValues: number[] = [];
      for (const kf of keyframes) {
        const rot = kf.bones[boneName];
        const q = rot ? toLocalQuat(boneName, rot[0], rot[1], rot[2]) : toLocalQuat(boneName);
        quatValues.push(q[0], q[1], q[2], q[3]);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, quatValues));
    }

    return new THREE.AnimationClip(name, times[times.length - 1], tracks);
  };

  // Shared orthodox boxing guard pose (slightly open toward camera while facing opponent)
  const guardPose = (bob = 0): CharEulerMap => ({
    Hips: [0.02, 0.26, 0],
    Spine: [0.05, -0.04, 0],
    Spine1: [0.05, -0.04, 0],
    Spine2: [0.04, -0.04, 0],
    Neck: [-0.04, 0.06, 0],
    Head: [-0.04, 0.14 + bob * 0.03, 0],
    LeftArm: [-0.32 - bob * 0.06, 0.22, -1.25],
    LeftForeArm: [0, -1.28 - bob * 0.05, 0],
    LeftHand: [0, 0, 0.12],
    RightArm: [-0.38 - bob * 0.06, -0.22, 1.25],
    RightForeArm: [0, 1.32 + bob * 0.05, 0],
    RightHand: [0, 0, -0.12],
    LeftUpLeg: [-0.18 - bob * 0.08, 0.04, 0.1],
    LeftLeg: [0.28 + bob * 0.14, 0, 0],
    LeftFoot: [-0.1, 0, 0],
    RightUpLeg: [0.14 - bob * 0.06, -0.04, -0.1],
    RightLeg: [0.18 + bob * 0.12, 0, 0],
    RightFoot: [-0.28, 0, 0],
  });

  // 1. IDLE bouncy fighter guard
  const IDLE = buildClip('IDLE', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.4, hipsOffset: [0, -0.065, 0], bones: guardPose(1) },
    { time: 0.8, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // 2. HIT comical flinch recoil
  const HIT = buildClip('HIT', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    {
      time: 0.1,
      hipsOffset: [0, -0.06, -0.14],
      bones: {
        ...guardPose(0),
        Hips: [-0.12, 0.14, 0.06],
        Spine: [-0.18, -0.12, -0.06],
        Spine1: [-0.18, -0.1, -0.04],
        Spine2: [-0.16, -0.08, -0.04],
        Neck: [-0.2, 0.12, 0.05],
        Head: [-0.28, 0.18, 0.1],
        LeftArm: [-0.35, 0, -0.65],
        LeftForeArm: [0, -0.9, 0],
        RightArm: [-0.35, 0, 0.65],
        RightForeArm: [0, 0.9, 0],
      },
    },
    {
      time: 0.23,
      hipsOffset: [0, -0.04, -0.08],
      bones: {
        ...guardPose(0),
        Hips: [-0.06, 0.06, 0],
        Spine: [-0.08, -0.04, 0],
        Spine2: [-0.08, 0, 0],
        Head: [-0.14, 0.08, 0.04],
        LeftArm: [-0.45, 0, -0.9],
        LeftForeArm: [0, -1.25, 0],
        RightArm: [-0.45, 0, 0.9],
        RightForeArm: [0, 1.25, 0],
      },
    },
    { time: 0.36, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // 3. ATTEMPT_ATTACK (Priyanshu's cocky wind-up right before Chinu kicks him)
  const ATTEMPT_ATTACK = buildClip('ATTEMPT_ATTACK', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    {
      time: 0.18,
      hipsOffset: [0, -0.05, 0.05],
      bones: {
        ...guardPose(0),
        Hips: [0.04, 0.32, 0],
        Spine: [0.06, 0.22, 0],
        Spine2: [0.06, 0.22, 0],
        Head: [-0.04, -0.42, 0],
        LeftArm: [-0.75, 0.1, -1.1],
        LeftForeArm: [0, -1.7, 0],
        RightArm: [0.48, -0.15, 0.85],
        RightForeArm: [0, 1.35, 0],
      },
    },
    {
      time: 0.38,
      hipsOffset: [0, -0.04, 0.18],
      bones: {
        ...guardPose(0),
        Hips: [0.06, -0.15, 0],
        Spine: [0.1, -0.18, 0],
        Spine2: [0.12, -0.22, 0],
        Head: [-0.06, 0.25, 0],
        RightArm: [-1.15, -0.1, 1.35],
        RightForeArm: [0, 0.65, 0],
      },
    },
  ]);

  // 4. SIGNATURE & SPANKED (Chinu braces waist with left hand & lands 3 whipping right open-palm slaps at 0.24, 0.46, 0.72)
  const spankWindupRight = (power = 1): CharEulerMap => ({
    Hips: [0.06, -0.24 * power, 0],
    Spine: [0.08, -0.18 * power, 0],
    Spine1: [0.08, -0.16 * power, 0],
    Spine2: [0.08, -0.16 * power, 0],
    Neck: [-0.04, 0.22 * power, 0],
    Head: [-0.04, 0.26 * power, 0],
    // Left arm reaches gently onto Priyanshu's waist/back to steady him
    LeftArm: [-0.82, -0.18, -1.16],
    LeftForeArm: [0, -0.78, 0],
    LeftHand: [0, 0, 0.12],
    // Right arm coils cleanly back behind Chinu for a visible open-palm swing
    RightArm: [0.68 * power, -0.52 * power, 0.72],
    RightForeArm: [0, 0.62 * power, 0],
    RightHand: [0.22, 0, -0.35],
    LeftUpLeg: [-0.18, 0.06, 0.1],
    LeftLeg: [0.28, 0, 0],
    LeftFoot: [-0.1, 0, 0],
    RightUpLeg: [0.16, -0.06, -0.1],
    RightLeg: [0.22, 0, 0],
    RightFoot: [-0.26, 0, 0],
  });

  const spankImpactRight = (power = 1): CharEulerMap => ({
    Hips: [0.12, 0.12 * power, 0],
    Spine: [0.12, 0.1 * power, 0],
    Spine1: [0.1, 0.08 * power, 0],
    Spine2: [0.1, 0.08 * power, 0],
    Neck: [-0.05, -0.1 * power, 0],
    Head: [-0.05, -0.12 * power, 0],
    LeftArm: [-0.82, -0.2, -1.18],
    LeftForeArm: [0, -0.82, 0],
    LeftHand: [0, 0, 0.12],
    // Camera-side right arm whips strongly forward & inward straight across Priyanshu's rear
    RightArm: [-1.06 - 0.06 * power, 0.24, 1.18],
    RightForeArm: [0, 0.42, 0],
    RightHand: [0.28, 0, -0.45],
    LeftUpLeg: [-0.22, 0.04, 0.1],
    LeftLeg: [0.3, 0, 0],
    LeftFoot: [-0.08, 0, 0],
    RightUpLeg: [0.16, -0.04, -0.1],
    RightLeg: [0.2, 0, 0],
    RightFoot: [-0.24, 0, 0],
  });

  const SIGNATURE = buildClip('SIGNATURE', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.12, hipsOffset: [0, -0.04, -0.02], bones: spankWindupRight(1) },
    { time: 0.24, hipsOffset: [0, -0.02, 0.09], bones: spankImpactRight(1) },
    { time: 0.35, hipsOffset: [0, -0.04, -0.02], bones: spankWindupRight(1.05) },
    { time: 0.46, hipsOffset: [0, -0.02, 0.09], bones: spankImpactRight(1.05) },
    { time: 0.59, hipsOffset: [0, -0.06, -0.05], bones: spankWindupRight(1.28) },
    { time: 0.72, hipsOffset: [0, -0.01, 0.14], bones: spankImpactRight(1.25) },
    { time: 0.88, hipsOffset: [0, -0.02, 0.06], bones: spankImpactRight(0.55) },
    { time: 0.98, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  const spankWaitPose = (glanceSide = 1): CharEulerMap => ({
    Hips: [0.46, 0, 0],
    Spine: [0.32, 0, 0],
    Spine1: [0.28, 0, 0],
    Spine2: [0.24, 0, 0],
    Neck: [-0.32, -0.26 * glanceSide, 0],
    Head: [-0.38, -0.34 * glanceSide, 0.08 * glanceSide],
    // Bracing both hands firmly on bent thighs/knees
    LeftArm: [-1.14, 0.12, -1.25],
    LeftForeArm: [0, -0.35, 0],
    RightArm: [-1.14, -0.12, 1.25],
    RightForeArm: [0, 0.35, 0],
    LeftUpLeg: [-0.52, 0, 0.14],
    LeftLeg: [0.76, 0, 0],
    LeftFoot: [-0.24, 0, 0],
    RightUpLeg: [-0.52, 0, -0.14],
    RightLeg: [0.76, 0, 0],
    RightFoot: [-0.24, 0, 0],
  });

  const spankRecoilPose = (power: number, glanceSide = 1): CharEulerMap => ({
    // Remains clearly bent forward while hip/lower-back snaps sharply on impact
    Hips: [0.24, 0.12 * glanceSide, 0.06 * glanceSide],
    Spine: [0.28, 0, 0.04 * glanceSide],
    Spine1: [0.26, 0, 0],
    Spine2: [0.24, 0, 0],
    Neck: [-0.38 - 0.05 * power, -0.28 * glanceSide, 0],
    Head: [-0.46 - 0.06 * power, -0.34 * glanceSide, 0.1 * glanceSide],
    // Left hand braces bent thigh while right hand reaches back toward his stung hip
    LeftArm: [-1.1, 0.1, -1.25],
    LeftForeArm: [0, -0.4, 0],
    RightArm: [0.92, 0.24, 1.12],
    RightForeArm: [0, 1.38, 0],
    LeftUpLeg: [-0.46, 0, 0.14],
    LeftLeg: [0.66, 0, 0],
    LeftFoot: [-0.2, 0, 0],
    RightUpLeg: [-0.46, 0, -0.14],
    RightLeg: [0.66, 0, 0],
    RightFoot: [-0.2, 0, 0],
  });

  const SPANKED = buildClip('SPANKED', [
    { time: 0, hipsOffset: [0, -0.15, 0], bones: spankWaitPose(1) },
    { time: 0.21, hipsOffset: [0, -0.15, 0], bones: spankWaitPose(1) },
    { time: 0.25, hipsOffset: [0, -0.07, 0.13], bones: spankRecoilPose(1, 1) },
    { time: 0.42, hipsOffset: [0, -0.15, 0], bones: spankWaitPose(-1) },
    { time: 0.47, hipsOffset: [0, -0.06, 0.14], bones: spankRecoilPose(1.15, -1) },
    { time: 0.67, hipsOffset: [0, -0.16, -0.02], bones: spankWaitPose(1) },
    { time: 0.74, hipsOffset: [0, 0.03, 0.2], bones: spankRecoilPose(1.4, 1) },
  ]);

  // 5. KISS & BLUSH (Authentic close embrace: Chinu rises on tiptoes cupping jawline; Priyanshu leans down holding her waist)
  const chinuKissPose = (depth: number): CharEulerMap => ({
    Hips: [0.04 + depth * 0.02, 0, 0],
    Spine: [0.07 + depth * 0.02, 0, 0],
    Spine1: [0.08 + depth * 0.02, 0, 0],
    Spine2: [0.07 + depth * 0.02, 0, 0],
    Neck: [-0.15 - depth * 0.02, 0, 0.05],
    Head: [-0.26 - depth * 0.03, 0, 0.14],
    LeftArm: [-1.14 - depth * 0.04, -0.12, -0.92],
    LeftForeArm: [0, -1.86 - depth * 0.06, 0],
    LeftHand: [0, 0, -0.14],
    RightArm: [-1.14 - depth * 0.04, 0.12, 0.92],
    RightForeArm: [0, 1.86 + depth * 0.06, 0],
    RightHand: [0, 0, 0.14],
    LeftUpLeg: [0.04, 0, 0.05],
    LeftLeg: [0.04, 0, 0],
    LeftFoot: [0.38, 0, 0],
    RightUpLeg: [0.04, 0, -0.05],
    RightLeg: [0.04, 0, 0],
    RightFoot: [0.38, 0, 0],
  });

  const KISS = buildClip('KISS', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.18, hipsOffset: [0, 0.05, 0.042], bones: chinuKissPose(0) },
    { time: 0.5, hipsOffset: [0, 0.056, 0.048], bones: chinuKissPose(0.55) },
    { time: 0.84, hipsOffset: [0, 0.05, 0.042], bones: chinuKissPose(0.2) },
    { time: 1.04, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  const priyanshuKissPose = (depth: number): CharEulerMap => ({
    Hips: [0.05 + depth * 0.015, 0, 0],
    Spine: [0.09 + depth * 0.015, 0, 0],
    Spine1: [0.09 + depth * 0.015, 0, 0],
    Spine2: [0.08 + depth * 0.015, 0, 0],
    Neck: [0.05 + depth * 0.015, 0, 0.05],
    Head: [0.07 + depth * 0.015, 0, 0.14],
    LeftArm: [-0.52, 0.36, -1.04],
    LeftForeArm: [0, -1.88 - depth * 0.04, 0],
    LeftHand: [0, 0, 0.12],
    RightArm: [-0.52, -0.36, 1.04],
    RightForeArm: [0, 1.88 + depth * 0.04, 0],
    RightHand: [0, 0, -0.12],
    LeftUpLeg: [-0.16, 0, 0.06],
    LeftLeg: [0.3, 0, 0],
    LeftFoot: [-0.14, 0, 0],
    RightUpLeg: [-0.16, 0, -0.06],
    RightLeg: [0.3, 0, 0],
    RightFoot: [-0.14, 0, 0],
  });

  const blushSwoonPose = (tilt: number): CharEulerMap => ({
    Hips: [-0.03, 0, 0],
    Spine: [-0.02, 0, tilt * 0.03],
    Spine1: [-0.02, 0, tilt * 0.03],
    Spine2: [-0.02, 0, tilt * 0.03],
    Neck: [-0.02, 0, tilt * 0.06],
    Head: [-0.05, 0, tilt * 0.11],
    LeftArm: [-0.48, 0.22, -1.2],
    LeftForeArm: [0, -1.45, 0],
    RightArm: [-0.48, -0.22, 1.2],
    RightForeArm: [0, 1.45, 0],
    LeftUpLeg: [-0.08, 0, 0.08],
    LeftLeg: [0.14, 0, 0],
    LeftFoot: [-0.06, 0, 0],
    RightUpLeg: [-0.08, 0, -0.08],
    RightLeg: [0.14, 0, 0],
    RightFoot: [-0.06, 0, 0],
  });

  const BLUSH = buildClip('BLUSH', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.18, hipsOffset: [0, -0.046, 0.036], bones: priyanshuKissPose(0) },
    { time: 0.5, hipsOffset: [0, -0.048, 0.044], bones: priyanshuKissPose(0.55) },
    { time: 0.84, hipsOffset: [0, -0.046, 0.036], bones: priyanshuKissPose(0.2) },
    { time: 1.08, hipsOffset: [0, 0.02, -0.02], bones: blushSwoonPose(0.8) },
    { time: 1.32, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // 6. FALL_BACK (Priyanshu launches backwards flat onto the mat)
  const fallenPose: CharEulerMap = {
    Hips: [-1.48, 0, 0.04],
    Spine: [-0.04, 0, 0],
    Spine1: [-0.04, 0, 0],
    Spine2: [-0.04, 0, 0],
    Neck: [0.14, 0, 0],
    Head: [0.18, -0.12, 0],
    LeftArm: [-0.1, 0, -0.22],
    LeftForeArm: [0, -0.35, 0],
    RightArm: [-0.1, 0, 0.22],
    RightForeArm: [0, 0.35, 0],
    LeftUpLeg: [-0.16, 0, 0.14],
    LeftLeg: [0.22, 0, 0],
    LeftFoot: [0.1, 0, 0],
    RightUpLeg: [-0.26, 0, -0.16],
    RightLeg: [0.34, 0, 0],
    RightFoot: [0.1, 0, 0],
  };

  const FALL_BACK = buildClip('FALL_BACK', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    {
      time: 0.2,
      hipsOffset: [0, -0.24, -0.2],
      bones: {
        ...guardPose(0),
        Hips: [-0.88, 0, 0.08],
        Spine: [-0.15, 0, 0],
        Head: [0.1, 0.14, 0],
        LeftArm: [-0.2, 0, -0.35],
        LeftForeArm: [0, -0.45, 0],
        RightArm: [-0.2, 0, 0.35],
        RightForeArm: [0, 0.45, 0],
        LeftUpLeg: [-0.45, 0, 0.18],
        LeftLeg: [0.55, 0, 0],
        RightUpLeg: [-0.62, 0, -0.18],
        RightLeg: [0.68, 0, 0],
      },
    },
    { time: 0.44, hipsOffset: [0, -0.78, -0.38], bones: fallenPose },
  ]);

  // 7. GET_UP (groggy stand up back into fighting guard)
  const GET_UP = buildClip('GET_UP', [
    { time: 0, hipsOffset: [0, -0.78, -0.38], bones: fallenPose },
    {
      time: 0.28,
      hipsOffset: [0, -0.4, -0.15],
      bones: {
        ...guardPose(0),
        Hips: [-0.48, 0, 0],
        Spine: [0.25, 0, 0],
        Spine2: [0.2, 0, 0],
        Head: [-0.12, 0, 0],
        LeftArm: [-0.75, 0, -1.05],
        LeftForeArm: [0, -0.65, 0],
        RightArm: [-0.75, 0, 1.05],
        RightForeArm: [0, 0.65, 0],
        LeftUpLeg: [-0.6, 0, 0.12],
        LeftLeg: [0.75, 0, 0],
        RightUpLeg: [-0.38, 0, -0.12],
        RightLeg: [0.45, 0, 0],
      },
    },
    { time: 0.55, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // Fallback clips for remaining FighterState keys (in case Priyanshu ever triggers them directly)
  const PUNCH = buildClip('PUNCH', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    {
      time: 0.17,
      hipsOffset: [0, -0.04, 0.2],
      bones: {
        ...guardPose(0),
        Hips: [0.06, 0.26, 0],
        Spine: [0.1, 0.2, 0],
        Spine2: [0.12, 0.24, 0],
        Head: [-0.1, -0.45, 0],
        RightArm: [-1.42, -0.12, 1.48],
        RightForeArm: [0, 0.18, 0],
      },
    },
    { time: 0.38, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  const KICK = buildClip('KICK', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    {
      time: 0.22,
      hipsOffset: [0, 0.04, 0.14],
      bones: {
        ...guardPose(0),
        Hips: [-0.18, 0.18, -0.1],
        Spine: [-0.14, 0.12, 0.08],
        Head: [0.12, -0.22, 0],
        RightUpLeg: [-1.45, 0.1, -0.18],
        RightLeg: [0.2, 0, 0],
      },
    },
    { time: 0.5, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // 8. Athletic looping RUN stride (used by humanoid fighters without a native Mixamo RUN override, e.g. Modiji)
  const runStrideFrame = (leadSide: 1 | -1): CharEulerMap => {
    const lSwing = leadSide;
    const rSwing = -leadSide;
    return {
      ...guardPose(0),
      Hips: [0.14, leadSide * 0.08, 0],
      Spine: [0.1, -leadSide * 0.08, 0],
      Spine1: [0.08, -leadSide * 0.06, 0],
      Spine2: [0.06, -leadSide * 0.06, 0],
      Neck: [-0.08, leadSide * 0.04, 0],
      Head: [-0.14, leadSide * 0.04, 0],
      LeftArm: [lSwing * 0.52 - 0.1, 0.18, -1.28],
      LeftForeArm: [0, -1.48, 0],
      RightArm: [rSwing * 0.52 - 0.1, -0.18, 1.28],
      RightForeArm: [0, 1.48, 0],
      LeftUpLeg: [leadSide === 1 ? -0.68 : 0.48, 0, 0.05],
      LeftLeg: [leadSide === 1 ? 0.42 : 0.62, 0, 0],
      LeftFoot: [leadSide === 1 ? -0.16 : 0.2, 0, 0],
      RightUpLeg: [leadSide === -1 ? -0.68 : 0.48, 0, -0.05],
      RightLeg: [leadSide === -1 ? 0.42 : 0.62, 0, 0],
      RightFoot: [leadSide === -1 ? -0.16 : 0.2, 0, 0],
    };
  };

  const runPassFrame = (liftSide: 1 | -1): CharEulerMap => ({
    ...guardPose(0),
    Hips: [0.14, 0, 0],
    Spine: [0.1, 0, 0],
    Spine1: [0.08, 0, 0],
    Spine2: [0.06, 0, 0],
    Head: [-0.14, 0, 0],
    LeftArm: [-0.15, 0.16, -1.28],
    LeftForeArm: [0, -1.5, 0],
    RightArm: [-0.15, -0.16, 1.28],
    RightForeArm: [0, 1.5, 0],
    LeftUpLeg: [liftSide === 1 ? -0.44 : -0.06, 0, 0.05],
    LeftLeg: [liftSide === 1 ? 1.12 : 0.28, 0, 0],
    LeftFoot: [-0.08, 0, 0],
    RightUpLeg: [liftSide === -1 ? -0.44 : -0.06, 0, -0.05],
    RightLeg: [liftSide === -1 ? 1.12 : 0.28, 0, 0],
    RightFoot: [-0.08, 0, 0],
  });

  const RUN = buildClip('RUN', [
    { time: 0, hipsOffset: [0, -0.06, 0], bones: runStrideFrame(1) },
    { time: 0.15, hipsOffset: [0, 0.015, 0], bones: runPassFrame(-1) },
    { time: 0.3, hipsOffset: [0, -0.06, 0], bones: runStrideFrame(-1) },
    { time: 0.45, hipsOffset: [0, 0.015, 0], bones: runPassFrame(1) },
    { time: 0.6, hipsOffset: [0, -0.06, 0], bones: runStrideFrame(1) },
  ]);

  // 9. Dramatic showboat taunt / blessing pose for humanoid rigs
  const tauntPose = (sway: number): CharEulerMap => ({
    ...guardPose(0),
    Hips: [-0.04, 0.08 * sway, 0],
    Spine: [-0.05, 0, sway * 0.04],
    Spine2: [-0.06, 0, sway * 0.04],
    Head: [-0.1, 0.12 * sway, 0],
    LeftArm: [-0.45, 0.22, -0.78],
    LeftForeArm: [0, -1.52, 0],
    RightArm: [-0.45, -0.22, 0.78],
    RightForeArm: [0, 1.52, 0],
    LeftUpLeg: [-0.14, 0.06, 0.14],
    LeftLeg: [0.22, 0, 0],
    RightUpLeg: [0.06, -0.06, -0.14],
    RightLeg: [0.16, 0, 0],
  });

  const POSE = buildClip('POSE', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.24, hipsOffset: [0, 0.01, 0], bones: tauntPose(1) },
    { time: 0.72, hipsOffset: [0, 0.025, 0], bones: tauntPose(-0.6) },
    { time: 1.15, hipsOffset: [0, 0.01, 0], bones: tauntPose(0.5) },
    { time: 1.4, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
  ]);

  // 10. Intense Laser Eyes signature power stare (squarely locks eyes onto opponent)
  const laserStarePose: CharEulerMap = {
    ...guardPose(0),
    Hips: [0.04, 0, 0],
    Spine: [0.07, 0, 0],
    Spine1: [0.05, 0, 0],
    Spine2: [0.05, 0, 0],
    Neck: [-0.04, 0, 0],
    Head: [-0.08, 0, 0],
    LeftShoulder: [0, 0, 0.08],
    LeftArm: [-0.26, 0.22, -1.04],
    LeftForeArm: [0, -0.75, 0],
    RightShoulder: [0, 0, -0.08],
    RightArm: [-0.26, -0.22, 1.04],
    RightForeArm: [0, 0.75, 0],
    LeftUpLeg: [-0.22, 0.04, 0.14],
    LeftLeg: [0.34, 0, 0],
    LeftFoot: [-0.12, 0, 0],
    RightUpLeg: [0.12, -0.04, -0.14],
    RightLeg: [0.22, 0, 0],
    RightFoot: [-0.12, 0, 0],
  };

  const LASER_EYES = buildClip('LASER_EYES', [
    { time: 0, hipsOffset: [0, -0.025, 0], bones: guardPose(0) },
    { time: 0.22, hipsOffset: [0, -0.04, 0.04], bones: laserStarePose },
    { time: 0.72, hipsOffset: [0, -0.035, 0.05], bones: laserStarePose },
    { time: 1.25, hipsOffset: [0, -0.04, 0.04], bones: laserStarePose },
  ]);

  return {
    IDLE,
    RUN,
    POSE,
    LASER_EYES,
    PUNCH,
    KICK,
    SIGNATURE,
    SPANKED,
    KISS,
    BLUSH,
    HIT,
    ATTEMPT_ATTACK,
    FALL_BACK,
    GET_UP,
  };
}
