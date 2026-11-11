import * as THREE from 'three';

export const RING_HALF_WIDTH = 3.35;
export const RING_SURFACE_Y = 0;

function createRingMatTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Bright cheerful canvas mat
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle comic grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
  ctx.lineWidth = 4;
  for (let i = 128; i < 1024; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Outer colorful ring border
  ctx.strokeStyle = '#ff3b7f';
  ctx.lineWidth = 28;
  ctx.strokeRect(46, 46, 932, 932);

  ctx.strokeStyle = '#2d8cff';
  ctx.lineWidth = 10;
  ctx.strokeRect(72, 72, 880, 880);

  // Center arena circle
  ctx.beginPath();
  ctx.arc(512, 512, 230, 0, Math.PI * 2);
  ctx.fillStyle = '#e0f2fe';
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#171923';
  ctx.stroke();

  // Inner comic star emblem
  ctx.save();
  ctx.translate(512, 512);
  ctx.beginPath();
  const spikes = 8;
  const outerR = 135;
  const innerR = 72;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd426';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#171923';
  ctx.stroke();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Constructs the central colorful fighting ring platform, ropes, corner posts,
 * and surrounding studio arena floor.
 */
export class ArenaBuilder {
  public static build(scene: THREE.Scene): THREE.Group {
    const arenaGroup = new THREE.Group();
    arenaGroup.name = 'Arena';

    // Surrounding bright studio floor
    const floorGeo = new THREE.CircleGeometry(28, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xbde8ff,
      roughness: 0.9,
      metalness: 0.02,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.78;
    floor.receiveShadow = true;
    arenaGroup.add(floor);

    // Subtle decorative floor ring beneath platform
    const underRing = new THREE.Mesh(
      new THREE.RingGeometry(4.8, 5.3, 48),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide })
    );
    underRing.rotation.x = -Math.PI / 2;
    underRing.position.y = -0.77;
    arenaGroup.add(underRing);

    // Main raised ring platform (top surface aligns precisely with y = 0)
    const platformWidth = RING_HALF_WIDTH * 2;
    const platformHeight = 0.78;

    const matTexture = createRingMatTexture();
    const topMat = new THREE.MeshStandardMaterial({
      map: matTexture,
      roughness: 0.55,
      metalness: 0.05,
    });
    const apronMat = new THREE.MeshStandardMaterial({
      color: 0xff3b7f,
      roughness: 0.5,
      metalness: 0.08,
    });
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
    });

    // Ring canvas deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(platformWidth, 0.18, platformWidth),
      [apronMat, apronMat, topMat, baseMat, apronMat, apronMat]
    );
    deck.position.y = -0.09;
    deck.receiveShadow = true;
    deck.castShadow = true;
    arenaGroup.add(deck);

    // Ring skirt / apron box
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(platformWidth - 0.16, platformHeight - 0.18, platformWidth - 0.16),
      baseMat
    );
    skirt.position.y = -0.18 - (platformHeight - 0.18) / 2;
    skirt.receiveShadow = true;
    skirt.castShadow = true;
    arenaGroup.add(skirt);

    // Corner posts + turnbuckles
    const postOffset = RING_HALF_WIDTH - 0.12;
    const cornerPositions: Array<{ x: number; z: number; color: number }> = [
      { x: -postOffset, z: -postOffset, color: 0xff3b7f },
      { x: -postOffset, z: postOffset, color: 0xff3b7f },
      { x: postOffset, z: -postOffset, color: 0x2d8cff },
      { x: postOffset, z: postOffset, color: 0x2d8cff },
    ];

    const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 1.35, 16);
    const padGeo = new THREE.CapsuleGeometry(0.14, 0.35, 6, 12);

    for (const corner of cornerPositions) {
      const post = new THREE.Mesh(
        postGeo,
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4 })
      );
      post.position.set(corner.x, 0.56, corner.z);
      post.castShadow = true;
      arenaGroup.add(post);

      const pad = new THREE.Mesh(
        padGeo,
        new THREE.MeshStandardMaterial({ color: corner.color, roughness: 0.45 })
      );
      pad.position.set(corner.x, 0.65, corner.z);
      pad.castShadow = true;
      arenaGroup.add(pad);
    }

    // Ring ropes (kept low enough on front +Z to never occlude characters from camera angle)
    const ropeHeights = [0.3, 0.58, 0.86];
    const ropeColors = [0xff3b7f, 0xffffff, 0x2d8cff];
    const ropeLength = postOffset * 2;
    const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, ropeLength, 10);

    ropeHeights.forEach((y, index) => {
      const ropeMat = new THREE.MeshStandardMaterial({
        color: ropeColors[index],
        roughness: 0.35,
        metalness: 0.1,
      });

      // Back (-Z) and Front (+Z)
      for (const zSide of [-postOffset, postOffset]) {
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.rotation.z = Math.PI / 2;
        rope.position.set(0, y, zSide);
        rope.castShadow = true;
        arenaGroup.add(rope);
      }

      // Left (-X) and Right (+X)
      for (const xSide of [-postOffset, postOffset]) {
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.rotation.x = Math.PI / 2;
        rope.position.set(xSide, y, 0);
        rope.castShadow = true;
        arenaGroup.add(rope);
      }
    });

    scene.add(arenaGroup);
    return arenaGroup;
  }
}

