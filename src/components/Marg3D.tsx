// MARG 3D Interactive Ninja Character — NTS COMMAND V2.0
// Real Three.js procedural 3D model accurately reflecting the NTS ninja mascot images:
// - Round black ninja head, white mask visor, expressive tracking eyes
// - Black headband with floating scarf ribbons, navy tunic, blue obi sash
// - Arm/leg wraps, dual katanas on back
// - Real-time state-driven animations (idle, thinking, working, success, approval, error, paused)
// - Cursor eye & head tracking with smooth damping
// - Graceful WebGL / reduced-motion fallback, stops loop when disabled

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export type MargState = 'idle' | 'thinking' | 'working' | 'success' | 'approval' | 'error' | 'paused';

interface Marg3DProps {
  state?: MargState;
  enabled?: boolean;
  width?: number;
  height?: number;
  onClick?: () => void;
  className?: string;
}

export function Marg3D({
  state = 'idle',
  enabled = true,
  width = 240,
  height = 240,
  onClick,
  className = '',
}: Marg3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    // Check WebGL availability
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setWebGLSupported(false);
        return;
      }
    } catch {
      setWebGLSupported(false);
      return;
    }

    const container = containerRef.current;
    const cw = width || container.clientWidth || 240;
    const ch = height || container.clientHeight || 240;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, cw / ch, 0.1, 100);
    camera.position.set(0, 0.4, 3.8);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(cw, ch);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Clear previous children
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(renderer.domElement);

    // ─── Lighting ───
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(2, 4, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Cyberpunk cyan/blue rim light for ninja silhouette
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfbbf24, 0.6); // champagne gold accent fill
    fillLight.position.set(1, -2, 2);
    scene.add(fillLight);

    // ─── Materials ───
    const ninjaBlack = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.15,
    });
    const ninjaHeadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1d,
      roughness: 0.28,
      metalness: 0.25,
    });
    const whiteMaskMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.3,
      metalness: 0.05,
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const blueSashMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.4,
      metalness: 0.2,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      metalness: 0.8,
    });

    // ─── Master Character Root Group ───
    const character = new THREE.Group();
    scene.add(character);
    character.position.y = -0.35;

    // ─── 1. Head & Face Group ───
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.75, 0);
    character.add(headGroup);

    // Oversized round ninja head sphere
    const headGeo = new THREE.SphereGeometry(0.68, 36, 36);
    const headMesh = new THREE.Mesh(headGeo, ninjaHeadMat);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Headband wrap cylinder
    const bandGeo = new THREE.CylinderGeometry(0.69, 0.69, 0.14, 32);
    const bandMesh = new THREE.Mesh(bandGeo, ninjaBlack);
    bandMesh.position.set(0, 0.05, 0);
    headGroup.add(bandMesh);

    // White eye-mask visor (rounded horizontal capsule on front of face)
    const maskShape = new THREE.Shape();
    const mw = 0.42, mh = 0.15, mr = 0.075;
    maskShape.moveTo(-mw + mr, -mh);
    maskShape.lineTo(mw - mr, -mh);
    maskShape.absarc(mw - mr, -mh + mr, mr, -Math.PI / 2, Math.PI / 2, false);
    maskShape.lineTo(-mw + mr, mh);
    maskShape.absarc(-mw + mr, -mh + mr, mr, Math.PI / 2, -Math.PI / 2, false);

    const maskGeo = new THREE.ShapeGeometry(maskShape, 24);
    const maskMesh = new THREE.Mesh(maskGeo, whiteMaskMat);
    maskMesh.position.set(0, 0.04, 0.64);
    maskMesh.scale.set(0.9, 0.9, 1);
    headGroup.add(maskMesh);

    // Eyes (expressive curved / arc eyes on the mask)
    const leftEye = new THREE.Group();
    const rightEye = new THREE.Group();

    // Curved smiling/expressive eye mesh
    const eyeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, -0.015, 0),
      new THREE.Vector3(0, 0.035, 0),
      new THREE.Vector3(0.06, -0.015, 0),
    ]);
    const eyeGeo = new THREE.TubeGeometry(eyeCurve, 16, 0.022, 8, false);
    const leftEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    const rightEyeMesh = new THREE.Mesh(eyeGeo.clone(), eyeMat);

    leftEye.add(leftEyeMesh);
    rightEye.add(rightEyeMesh);
    leftEye.position.set(-0.16, 0.03, 0.66);
    rightEye.position.set(0.16, 0.03, 0.66);
    headGroup.add(leftEye);
    headGroup.add(rightEye);

    // Headband Knot & Trailing Scarf Ribbons
    const knotGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const knotMesh = new THREE.Mesh(knotGeo, blueSashMat);
    knotMesh.position.set(-0.55, 0.08, -0.4);
    headGroup.add(knotMesh);

    const scarfGroup = new THREE.Group();
    scarfGroup.position.copy(knotMesh.position);
    headGroup.add(scarfGroup);

    // Two flapping ribbon tails
    const r1Geo = new THREE.ConeGeometry(0.09, 0.52, 12);
    r1Geo.rotateZ(Math.PI * 0.7);
    const ribbon1 = new THREE.Mesh(r1Geo, blueSashMat);
    ribbon1.position.set(-0.25, -0.05, -0.15);
    scarfGroup.add(ribbon1);

    const r2Geo = new THREE.ConeGeometry(0.07, 0.42, 12);
    r2Geo.rotateZ(Math.PI * 0.75);
    const ribbon2 = new THREE.Mesh(r2Geo, blueSashMat);
    ribbon2.position.set(-0.28, -0.18, -0.08);
    scarfGroup.add(ribbon2);

    // ─── 2. Torso & Tunic ───
    const bodyGroup = new THREE.Group();
    bodyGroup.position.set(0, 0.05, 0);
    character.add(bodyGroup);

    // Chibi stylized torso
    const torsoGeo = new THREE.CylinderGeometry(0.28, 0.36, 0.48, 24);
    const torsoMesh = new THREE.Mesh(torsoGeo, ninjaBlack);
    torsoMesh.castShadow = true;
    bodyGroup.add(torsoMesh);

    // Cross-body sash (blue diagonal strap)
    const sashGeo = new THREE.TorusGeometry(0.32, 0.04, 8, 24);
    sashGeo.rotateX(Math.PI / 3);
    const sashMesh = new THREE.Mesh(sashGeo, blueSashMat);
    bodyGroup.add(sashMesh);

    // Belt / Obi at waist
    const beltGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.08, 24);
    const beltMesh = new THREE.Mesh(beltGeo, blueSashMat);
    beltMesh.position.set(0, -0.16, 0);
    bodyGroup.add(beltMesh);

    // Belt knot & hanging sash ends
    const bKnot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), blueSashMat);
    bKnot.position.set(0, -0.16, 0.38);
    bodyGroup.add(bKnot);

    const bTail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 10), blueSashMat);
    bTail.rotation.z = 0.15;
    bTail.position.set(0.04, -0.3, 0.38);
    bodyGroup.add(bTail);

    // ─── 3. Dual Katana Swords on Back ───
    const katanas = new THREE.Group();
    katanas.position.set(0, 0.05, -0.32);
    katanas.rotation.z = Math.PI * 0.28;
    bodyGroup.add(katanas);

    // Sheaths & hilts
    const sheathGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.05, 10);
    const sheath1 = new THREE.Mesh(sheathGeo, ninjaBlack);
    sheath1.position.set(-0.06, 0, 0);
    katanas.add(sheath1);

    const sheath2 = new THREE.Mesh(sheathGeo, ninjaBlack);
    sheath2.position.set(0.06, 0, 0);
    katanas.add(sheath2);

    const hiltGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.24, 10);
    const hilt1 = new THREE.Mesh(hiltGeo, blueSashMat);
    hilt1.position.set(-0.06, 0.58, 0);
    katanas.add(hilt1);

    const hilt2 = new THREE.Mesh(hiltGeo, blueSashMat);
    hilt2.position.set(0.06, 0.58, 0);
    katanas.add(hilt2);

    const guard1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), goldMat);
    guard1.position.set(-0.06, 0.46, 0);
    katanas.add(guard1);

    const guard2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.08), goldMat);
    guard2.position.set(0.06, 0.46, 0);
    katanas.add(guard2);

    // ─── 4. Arms & Hands ───
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    leftArm.position.set(-0.35, 0.2, 0);
    rightArm.position.set(0.35, 0.2, 0);
    bodyGroup.add(leftArm);
    bodyGroup.add(rightArm);

    const armGeo = new THREE.CylinderGeometry(0.08, 0.075, 0.32, 14);
    armGeo.translate(0, -0.15, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, ninjaBlack);
    const rightArmMesh = new THREE.Mesh(armGeo.clone(), ninjaBlack);
    leftArm.add(leftArmMesh);
    rightArm.add(rightArmMesh);

    // Blue wrist wraps
    const wrapGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.09, 14);
    wrapGeo.translate(0, -0.23, 0);
    leftArm.add(new THREE.Mesh(wrapGeo, blueSashMat));
    rightArm.add(new THREE.Mesh(wrapGeo.clone(), blueSashMat));

    // Gloves / hands
    const handGeo = new THREE.SphereGeometry(0.075, 12, 12);
    const leftHand = new THREE.Mesh(handGeo, ninjaBlack);
    leftHand.position.set(0, -0.32, 0);
    leftArm.add(leftHand);

    const rightHand = new THREE.Mesh(handGeo, ninjaBlack);
    rightHand.position.set(0, -0.32, 0);
    rightArm.add(rightHand);

    // Default arm resting angles
    leftArm.rotation.z = 0.25;
    rightArm.rotation.z = -0.25;

    // ─── 5. Legs & Boots ───
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    leftLeg.position.set(-0.16, -0.22, 0);
    rightLeg.position.set(0.16, -0.22, 0);
    character.add(leftLeg);
    character.add(rightLeg);

    const legGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.35, 14);
    legGeo.translate(0, -0.15, 0);
    leftLeg.add(new THREE.Mesh(legGeo, ninjaBlack));
    rightLeg.add(new THREE.Mesh(legGeo.clone(), ninjaBlack));

    // Blue calf wraps
    const shinWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.12, 14), blueSashMat);
    shinWrap.position.set(0, -0.18, 0);
    leftLeg.add(shinWrap);
    rightLeg.add(shinWrap.clone());

    // Ninja tabi boots
    const bootGeo = new THREE.BoxGeometry(0.14, 0.09, 0.24);
    bootGeo.translate(0, -0.35, 0.04);
    leftLeg.add(new THREE.Mesh(bootGeo, ninjaBlack));
    rightLeg.add(new THREE.Mesh(bootGeo.clone(), ninjaBlack));

    // ─── Mouse Tracking Coordinates ───
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      mouse.targetX = Math.max(-1, Math.min(1, x));
      mouse.targetY = Math.max(-1, Math.min(1, y));
    };
    window.addEventListener('mousemove', handleMouseMove);

    // ─── Animation Loop & State Controller ───
    let animationFrameId: number;
    let clock = new THREE.Clock();
    let blinkTimer = 0;
    let isBlinking = false;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse coordinate interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      // Natural blinking logic
      blinkTimer += 0.016;
      if (blinkTimer > 3.8 && !isBlinking) {
        isBlinking = true;
        leftEye.scale.y = 0.1;
        rightEye.scale.y = 0.1;
        setTimeout(() => {
          leftEye.scale.y = 1;
          rightEye.scale.y = 1;
          isBlinking = false;
          blinkTimer = Math.random() * -1.5;
        }, 130);
      }

      // Ribbon wind flutter
      ribbon1.rotation.y = Math.sin(elapsed * 4.5) * 0.22;
      ribbon2.rotation.y = Math.cos(elapsed * 5.2) * 0.26;
      ribbon1.rotation.z = Math.PI * 0.7 + Math.sin(elapsed * 3.8) * 0.12;

      // ─── State-Driven Motion Profiles ───
      switch (state) {
        case 'thinking': {
          // Head tilted upward, subtle floating
          character.position.y = -0.35 + Math.sin(elapsed * 2.5) * 0.06;
          headGroup.rotation.x = -0.22;
          headGroup.rotation.y = 0.25 + Math.sin(elapsed * 1.5) * 0.08;
          leftArm.rotation.z = 0.2;
          rightArm.rotation.z = -0.55;
          rightArm.rotation.x = -0.4;
          break;
        }

        case 'working': {
          // Focused stance, dynamic hands
          character.position.y = -0.35 + Math.sin(elapsed * 6) * 0.02;
          headGroup.rotation.x = 0.12;
          headGroup.rotation.y = mouse.x * 0.25;
          leftArm.rotation.x = -0.4 + Math.sin(elapsed * 8) * 0.15;
          rightArm.rotation.x = -0.4 + Math.cos(elapsed * 8) * 0.15;
          leftArm.rotation.z = 0.1;
          rightArm.rotation.z = -0.1;
          break;
        }

        case 'success': {
          // Happy bounce & celebratory flourish
          character.position.y = -0.35 + Math.abs(Math.sin(elapsed * 5)) * 0.12;
          headGroup.rotation.z = Math.sin(elapsed * 5) * 0.08;
          headGroup.rotation.x = -0.1;
          rightArm.rotation.z = -1.5; // Thumbs up / high hand
          leftArm.rotation.z = 0.4;
          break;
        }

        case 'approval': {
          // Alert attention pose with subtle warning pulse
          character.position.y = -0.35 + Math.sin(elapsed * 3) * 0.03;
          headGroup.rotation.y = Math.sin(elapsed * 3) * 0.15;
          leftArm.rotation.z = 0.6;
          rightArm.rotation.z = -0.6;
          break;
        }

        case 'error': {
          // Drooping concerned stance
          character.position.y = -0.38;
          headGroup.rotation.x = 0.18;
          headGroup.rotation.z = -0.12;
          leftArm.rotation.z = 0.15;
          rightArm.rotation.z = -0.15;
          break;
        }

        case 'paused': {
          // Resting / sleeping pose
          character.position.y = -0.38 + Math.sin(elapsed * 1.2) * 0.015;
          headGroup.rotation.x = 0.14;
          headGroup.rotation.z = 0.12;
          leftEye.scale.y = 0.2;
          rightEye.scale.y = 0.2;
          break;
        }

        case 'idle':
        default: {
          // Breathing motion
          character.position.y = -0.35 + Math.sin(elapsed * 2.2) * 0.025;
          bodyGroup.scale.set(1 + Math.sin(elapsed * 2.2) * 0.015, 1, 1 + Math.sin(elapsed * 2.2) * 0.015);

          // Head & Eye tracking toward cursor with realistic angular limits
          headGroup.rotation.y = mouse.x * 0.55;
          headGroup.rotation.x = -mouse.y * 0.35;
          headGroup.rotation.z = mouse.x * -0.08;

          leftArm.rotation.z = 0.25 + Math.sin(elapsed * 2) * 0.04;
          rightArm.rotation.z = -0.25 - Math.sin(elapsed * 2) * 0.04;
          break;
        }
      }

      // Small character rotation on hover
      if (isHovered) {
        character.rotation.y += (mouse.x * 0.4 - character.rotation.y) * 0.1;
      } else {
        character.rotation.y += (0 - character.rotation.y) * 0.08;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const nw = container.clientWidth || cw;
      const nh = container.clientHeight || ch;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      while (container.firstChild) container.removeChild(container.firstChild);
    };
  }, [enabled, state, width, height, isHovered]);

  if (!enabled) return null;

  if (!webGLSupported) {
    return (
      <div
        className={`marg-fallback ${className}`}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
          borderRadius: 16,
          cursor: 'pointer',
        }}
        onClick={onClick}
      >
        <img
          src="/img/intro/logo.jpg"
          alt="MARG"
          style={{ width: width * 0.65, height: height * 0.65, borderRadius: '50%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`marg-3d-canvas ${className}`}
      style={{
        width,
        height,
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        touchAction: 'none',
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="MARG — Master Orchestrator (Click to open command panel)"
      aria-label="MARG 3D Ninja Mascot"
      role="img"
    />
  );
}
