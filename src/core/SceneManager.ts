import * as THREE from 'three';
import gsap from 'gsap';
import { FighterRig } from '../types/game';

/**
 * Owns WebGLRenderer, PerspectiveCamera, bright arcade lighting,
 * mouse parallax, 3D fighter raycasting, and GSAP-driven shake / dramatic zoom.
 */
export class SceneManager {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly baseCameraPos = new THREE.Vector3(0, 3.35, 7.6);
  private readonly baseLookAt = new THREE.Vector3(0, 1.1, 0);
  private readonly shakeOffset = new THREE.Vector3();
  private readonly currentLookAt = new THREE.Vector3(0, 1.1, 0);
  private readonly zoomTargetPos = new THREE.Vector3().copy(this.baseCameraPos);

  private readonly pointerNDC = new THREE.Vector2();
  private readonly targetParallax = new THREE.Vector2();
  private readonly smoothParallax = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9be2ff);
    this.scene.fog = new THREE.Fog(0x9be2ff, 16, 36);

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
    this.camera.position.copy(this.baseCameraPos);
    this.camera.lookAt(this.baseLookAt);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.setupLighting();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xe0f7ff, 0xffd6ba, 0.85);
    hemi.position.set(0, 12, 0);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff9eb, 1.85);
    keyLight.position.set(5.5, 11.5, 7.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.75);
    rimLight.position.set(-6, 6, -6);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfff5eb, 0.6);
    fillLight.position.set(-5.5, 3.8, 6.5);
    this.scene.add(fillLight);
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const nx = (event.clientX / window.innerWidth) * 2 - 1;
    const ny = (event.clientY / window.innerHeight) * 2 - 1;
    this.targetParallax.set(nx * 0.38, -ny * 0.16);
  };

  /**
   * Raycasts pointer coordinates against fighter meshes & hurtboxes so users
   * can click directly on Priyanshu or Chinu in 3D space.
   */
  public pickFighterAt(
    clientX: number,
    clientY: number,
    rigs: FighterRig[]
  ): { rig: FighterRig; point: THREE.Vector3 } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    let closestHit: { rig: FighterRig; distance: number; point: THREE.Vector3 } | null = null;
    for (const rig of rigs) {
      const targets: THREE.Object3D[] = [...rig.bodyMeshes, rig.hurtboxMesh];
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        if (!closestHit || hit.distance < closestHit.distance) {
          closestHit = { rig, distance: hit.distance, point: hit.point.clone() };
        }
      }
    }

    return closestHit ? { rig: closestHit.rig, point: closestHit.point } : null;
  }

  public triggerShake(intensity = 0.16, duration = 0.24): void {
    gsap.killTweensOf(this.shakeOffset);
    const state = { power: intensity };
    gsap.to(state, {
      power: 0,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        this.shakeOffset.set(
          (Math.random() - 0.5) * 2 * state.power,
          (Math.random() - 0.5) * 2 * state.power,
          0
        );
      },
      onComplete: () => {
        this.shakeOffset.set(0, 0, 0);
      },
    });
  }

  public triggerDramaticZoom(focusPoint: THREE.Vector3, holdSeconds = 0.42): void {
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    const zoomPos = new THREE.Vector3(
      focusPoint.x * 0.45,
      this.baseCameraPos.y - 0.65,
      this.baseCameraPos.z - 2.1
    );

    const tl = gsap.timeline();
    tl.to(this.zoomTargetPos, {
      x: zoomPos.x,
      y: zoomPos.y,
      z: zoomPos.z,
      duration: 0.14,
      ease: 'power3.out',
    });
    tl.to(
      this.currentLookAt,
      {
        x: focusPoint.x * 0.35,
        y: focusPoint.y + 0.1,
        z: 0,
        duration: 0.14,
        ease: 'power3.out',
      },
      '<'
    );

    tl.to(this.zoomTargetPos, {
      x: this.baseCameraPos.x,
      y: this.baseCameraPos.y,
      z: this.baseCameraPos.z,
      delay: holdSeconds,
      duration: 0.42,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: 0.42,
        ease: 'power2.inOut',
      },
      '<'
    );
  }

  public triggerRomanticCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    holdSeconds = 0.88
  ): void {
    this.animateSideCloseUp(center, pairDir, 3.22, 2.12, 1.98, 0.34, holdSeconds, 0.46);
  }

  public triggerSpankCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    holdSeconds = 1.05
  ): void {
    this.animateSideCloseUp(center, pairDir, 4.15, 2.04, 1.78, 0.25, holdSeconds, 0.44);
  }

  private animateSideCloseUp(
    center: THREE.Vector3,
    pairDir: THREE.Vector3,
    distance: number,
    camY: number,
    lookY: number,
    inDuration: number,
    holdSeconds: number,
    outDuration: number
  ): void {
    gsap.killTweensOf(this.zoomTargetPos);
    gsap.killTweensOf(this.currentLookAt);

    // Pick perpendicular side profile on the front (+Z) camera half of the ring
    const side = new THREE.Vector3(-pairDir.z, 0, pairDir.x);
    if (side.lengthSq() < 0.0001) {
      side.set(0, 0, 1);
    } else {
      side.normalize();
      if (side.z < 0) side.negate();
    }

    const closePos = new THREE.Vector3(
      center.x + side.x * distance,
      camY,
      Math.max(center.z + side.z * distance, 1.65)
    );
    const lookTarget = new THREE.Vector3(center.x, lookY, center.z);

    const tl = gsap.timeline();
    tl.to(this.zoomTargetPos, {
      x: closePos.x,
      y: closePos.y,
      z: closePos.z,
      duration: inDuration,
      ease: 'power2.out',
    });
    tl.to(
      this.currentLookAt,
      {
        x: lookTarget.x,
        y: lookTarget.y,
        z: lookTarget.z,
        duration: inDuration,
        ease: 'power2.out',
      },
      '<'
    );

    tl.to(this.zoomTargetPos, {
      x: this.baseCameraPos.x,
      y: this.baseCameraPos.y,
      z: this.baseCameraPos.z,
      delay: holdSeconds,
      duration: outDuration,
      ease: 'power2.inOut',
    });
    tl.to(
      this.currentLookAt,
      {
        x: this.baseLookAt.x,
        y: this.baseLookAt.y,
        z: this.baseLookAt.z,
        duration: outDuration,
        ease: 'power2.inOut',
      },
      '<'
    );
  }

  public render(): void {
    this.smoothParallax.lerp(this.targetParallax, 0.08);
    this.camera.position
      .copy(this.zoomTargetPos)
      .add(this.shakeOffset)
      .add(new THREE.Vector3(this.smoothParallax.x, this.smoothParallax.y, 0));
    this.camera.lookAt(this.currentLookAt);
    this.renderer.render(this.scene, this.camera);
  }

  private readonly handleResize = (): void => {
    const parent = this.renderer.domElement.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.dispose();
  }
}
