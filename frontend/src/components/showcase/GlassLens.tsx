'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import * as THREE from 'three';

interface GlassLensProps {
  className?: string;
}

/**
 * GlassLens — Three.js refractive glass sphere floating in a showroom environment.
 *
 * What it does:
 *   - A translucent glass sphere with complex IOR / env map refraction
 *   - A wireframe org-node graph floats inside the sphere, rotating slowly
 *   - Scene floor: deep polished black with a subtle ice-blue rim light
 *   - Camera slowly orbits the sphere (6°/min)
 *
 * Aesthetic: Cold Luxury (charcoal + chrome + ice-blue accent).
 *
 * Notes:
 *   - Reduced-motion users get a static rendered SphereGeometry with env-map only (no rotation)
 *   - The canvas is a fixed overlay inside the wrapping div (fills the container)
 *   - Uses a simple env map generated from an equirect gradient (no external HDR load needed)
 */
export function GlassLens({ className = '' }: GlassLensProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // --- scene ---
    const scene = new THREE.Scene();
    scene.background = null; // transparent — CSS background shows through

    // --- camera ---
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 3.8);

    // --- renderer ---
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // --- lights ---
    const ambient = new THREE.AmbientLight(0x222244, 0.6);
    scene.add(ambient);

    // key light — ice-blue accent from upper-right
    const key = new THREE.DirectionalLight(0x6fb6ff, 2.8);
    key.position.set(2.5, 3, 2);
    scene.add(key);

    // fill — warm fill from lower-left
    const fill = new THREE.DirectionalLight(0xffeedd, 1.2);
    fill.position.set(-2, 1, 2);
    scene.add(fill);

    // rim — cold rim from back
    const rim = new THREE.DirectionalLight(0x4488ff, 0.8);
    rim.position.set(0, 1.5, -3);
    scene.add(rim);

    // --- env map: synthetic IBL gradient ---
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const ctx = envCanvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#14171c');
    grad.addColorStop(0.3, '#1e2230');
    grad.addColorStop(0.6, '#2a3040');
    grad.addColorStop(0.8, '#14171c');
    grad.addColorStop(1, '#0a0b0e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // bright specular spot
    ctx.fillStyle = '#6fb6ff';
    ctx.beginPath();
    ctx.arc(300, 80, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffffee';
    ctx.beginPath();
    ctx.arc(300, 80, 20, 0, Math.PI * 2);
    ctx.fill();

    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularRefractionMapping;

    // --- glass sphere ---
    const sphereGeo = new THREE.SphereGeometry(1, 64, 64);
    const sphereMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.05,
      metalness: 0.0,
      transparent: true,
      opacity: 0.75,
      ior: 1.54,
      envMap: envTexture,
      envMapIntensity: 1.8,
      clearcoat: 0.3,
      clearcoatRoughness: 0.15,
      side: THREE.DoubleSide,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.2;
    scene.add(sphere);

    // --- thin chrome rim (outer shell for edge refraction) ---
    const rimGeo = new THREE.SphereGeometry(1.01, 48, 48);
    const rimMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.2,
      metalness: 1.0,
      transparent: true,
      opacity: 0.15,
      envMap: envTexture,
      envMapIntensity: 0.8,
      wireframe: false,
      side: THREE.BackSide,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.2;
    scene.add(rimMesh);

    // --- inner wireframe: org-node graph abstraction ---
    const graphGroup = new THREE.Group();
    graphGroup.position.y = 0.2;

    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0x6fb6ff,
      transparent: true,
      opacity: 0.25,
    });
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x6fb6ff,
      transparent: true,
      opacity: 0.12,
    });

    // nodes
    const nodePositions: THREE.Vector3[] = [];
    const numNodes = 16;
    for (let i = 0; i < numNodes; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 0.35 + Math.random() * 0.45;
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
      nodePositions.push(pos);

      const node = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), nodeMat);
      node.position.copy(pos);
      graphGroup.add(node);
    }

    // edges (random minimal spanning tree-ish connectivity)
    for (let i = 0; i < numNodes; i++) {
      const connections = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < connections; c++) {
        const j = Math.floor(Math.random() * numNodes);
        if (i === j) continue;
        const points = [nodePositions[i], nodePositions[j]];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, edgeMat);
        graphGroup.add(line);
      }
    }
    scene.add(graphGroup);

    // --- ground ring (pedestal glow) ---
    const ringGeo = new THREE.RingGeometry(0.68, 1.1, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6fb6ff,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.35;
    scene.add(ring);

    // --- animation ---
    let frameId: number;
    let time = 0;

    function animate() {
      frameId = requestAnimationFrame(animate);
      time += 0.005;

      // slow rotation
      graphGroup.rotation.y += 0.002;

      // sphere very slow bob
      const bob = Math.sin(time * 0.5) * 0.008;
      sphere.position.y = 0.2 + bob;
      rimMesh.position.y = 0.2 + bob;

      // camera orbit
      const camAngle = time * 0.008;
      camera.position.x = 3.2 * Math.sin(camAngle);
      camera.position.z = 3.2 * Math.cos(camAngle);
      camera.lookAt(0, 0.2, 0);

      renderer.render(scene, camera);
    }

    if (!reduce) {
      animate();
    } else {
      // reduced motion: single render frame, no rotation
      renderer.render(scene, camera);
    }

    // --- resize ---
    function handleResize() {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', handleResize);

    // --- cleanup ---
    const el = container;
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      if (el && renderer.domElement.parentNode === el) {
        el.removeChild(renderer.domElement);
      }
      renderer.dispose();
      // dispose geometries
      sphereGeo.dispose();
      sphereMat.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      nodeMat.dispose();
      edgeMat.dispose();
      envTexture.dispose();
    };
  }, [reduce]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ minHeight: 280, minWidth: 240 }}
      aria-hidden="true"
    />
  );
}
