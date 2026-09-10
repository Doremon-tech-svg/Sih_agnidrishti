/**
 * OrbitalGlobe.jsx — 3D interactive Earth with particle points, satellite rings, and live thermal hotspots.
 * 
 * Props:
 * - hotspots: array of { lat, lon, classification, frp, risk_score, ... }
 * - onHotspotClick: function (hotspot) => void
 * - selectedRegion, targetCoords, zoomLevel, isCardOpen, etc. (see below)
 */

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// ─── Utilities ────────────────────────────────────────────────────────────
export function latLonToTargetRotation(lat, lon) {
  const targetY = -((lon) * (Math.PI / 180)) - Math.PI * 0.5;
  const targetX = (lat) * (Math.PI / 180);
  return { x: targetX, y: targetY };
}

export function latLonToVector3(lat, lon, radius = 100) {
  const phi = (90.0 - lat) * (Math.PI / 180);
  const theta = (lon + 180.0) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// ─── Region coordinates ──────────────────────────────────────────────────
export const REGION_COORDINATES = {
  India: { lat: 21.5, lon: 78.9, zoom: 190 },
  Gujarat: { lat: 22.3, lon: 72.6, zoom: 175 },
  Simlipal: { lat: 21.8, lon: 86.3, zoom: 175 },
  Bandipur: { lat: 11.6, lon: 76.6, zoom: 175 },
  WesternGhats: { lat: 13.0, lon: 75.5, zoom: 175 },
  Himalayas: { lat: 29.8, lon: 79.3, zoom: 175 },
  Satpura: { lat: 22.4, lon: 78.4, zoom: 175 },
  Kaziranga: { lat: 26.5, lon: 93.1, zoom: 175 },
  Japan: { lat: 36.2, lon: 138.2, zoom: 185 },
  Europe: { lat: 48.8, lon: 2.3, zoom: 190 },
  USA: { lat: 37.0, lon: -95.7, zoom: 195 },
  Australia: { lat: -25.2, lon: 133.7, zoom: 190 },
  Brazil: { lat: -14.2, lon: -51.9, zoom: 190 },
  Africa: { lat: 0.0, lon: 25.0, zoom: 195 },
  INSAT3D: { lat: 0.0, lon: 74.0, zoom: 210 },
  VIIRS: { lat: 28.0, lon: 82.0, zoom: 185 },
  Sentinel3: { lat: 35.0, lon: 70.0, zoom: 190 },
};

// ─── Classification colours ──────────────────────────────────────────────
const CLASS_COLORS = {
  'Gas Flare':                  '#f59e0b',
  'Industrial Thermal Source':  '#3b82f6',
  'Industrial Fire / Accident': '#ef4444',
  'Agricultural Burning':       '#84cc16',
  'Wildfire / Forest Fire':     '#f97316',
  'Mining Thermal Activity':    '#a855f7',
  'False Positive':             '#6b7280',
};

// ─── Sprite texture generator for hotspot markers ──────────────────────
function createMarkerTexture(hexColor, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;
  const radius = size * 0.45;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, hexColor);
  gradient.addColorStop(0.6, hexColor);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  const coreGrad = ctx.createRadialGradient(center, center, 0, center, center, radius * 0.4);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.5, hexColor);
  coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(center, center, radius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── Radial Streak Shader ──────────────────────────────────────────────
const RadialStreakShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec2 uCenter;
    varying vec2 vUv;

    void main() {
      if (uStrength <= 0.001) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 dir = vUv - uCenter;
      vec4 color = vec4(0.0);
      const int SAMPLES = 8;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        vec2 sampleUv = vUv - dir * uStrength * t;
        color += texture2D(tDiffuse, sampleUv);
      }
      color /= float(SAMPLES);
      gl_FragColor = color;
    }
  `,
};

// ─── Points Shader (vertex + fragment) ─────────────────────────────────
// This is the exact shader from the original file, kept unchanged.
const PointsShader = {
  vertexShader: `
    attribute float size;
    attribute vec3 color;
    attribute float isIndia;
    attribute float randSeed;
    attribute float layerId;
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    varying float vRandSeed;
    varying float vLayerId;
    varying float vSelFactor;
    varying float vHoverFactor;
    varying float vRippleBand;
    varying float vFresnel;
    varying float vRevealGlow;
    varying float vRevealVisible;
    uniform float uTime;
    uniform float uVibrationAmp;
    uniform vec3 uSelectedDir;
    uniform float uSelectedRadius;
    uniform float uSelectedStrength;
    uniform vec3 uHoverDir;
    uniform float uHoverRadius;
    uniform float uHoverStrength;
    uniform float uHoverActive;
    uniform float uRayCount;
    uniform float uSelectionActive;
    uniform vec3 uRevealOriginDir;
    uniform float uRevealFrontRadius;
    uniform float uRevealBandWidth;
    uniform float uRevealGlowGate;
    uniform vec3 uRippleOriginDir;
    uniform float uRippleRadius;
    uniform float uRippleBandWidth;
    uniform float uRippleTrailFreq;
    uniform float uRippleTrailDecay;
    uniform float uRippleEnvelope;

    void main() {
      vColor = color;
      vIsIndia = isIndia;
      vPointPosition = position;
      vRandSeed = randSeed;
      vLayerId = layerId;

      vec3 normalDir = normalize(position);
      float seed = randSeed * 6.2831853;

      float rippleDist = acos(clamp(dot(normalDir, normalize(uRippleOriginDir)), -1.0, 1.0));
      float rippleEdge = rippleDist - uRippleRadius;
      float rippleFront = exp(-pow(rippleEdge / uRippleBandWidth, 2.0));
      float secondaryRadius = mod(uRippleRadius + 1.10, 3.3);
      float secondaryEdge = rippleDist - secondaryRadius;
      float secondaryFront = exp(-pow(secondaryEdge / (uRippleBandWidth * 1.15), 2.0));
      float tertiaryRadius = mod(uRippleRadius + 2.20, 3.3);
      float tertiaryEdge = rippleDist - tertiaryRadius;
      float tertiaryFront = exp(-pow(tertiaryEdge / (uRippleBandWidth * 1.25), 2.0));
      float behindFront = max(0.0, -rippleEdge);
      float rippleWake = max(0.0, cos(behindFront * uRippleTrailFreq)) * exp(-behindFront * uRippleTrailDecay);
      float rippleBand = clamp(rippleFront + secondaryFront * 0.42 + tertiaryFront * 0.28 + rippleWake * 0.34, 0.0, 1.0) * uRippleEnvelope;
      float bandJitter = fract(sin(randSeed * 91.7) * 43758.5453);
      rippleBand *= mix(0.75, 1.0, bandJitter);
      vRippleBand = rippleBand;

      float activeRipple = rippleBand;

      float selDot = dot(normalDir, normalize(uSelectedDir));
      float selFactor = smoothstep(cos(uSelectedRadius), 1.0, selDot);
      vec3 selDirN = normalize(uSelectedDir);
      selFactor *= uSelectionActive;
      vSelFactor = selFactor;
      vec3 selTangent = normalDir - selDirN * selDot;
      selTangent /= max(length(selTangent), 0.0001);

      float hoverDot = dot(normalDir, normalize(uHoverDir));
      float hoverFactor = smoothstep(cos(uHoverRadius), 1.0, hoverDot) * uHoverActive;
      vHoverFactor = hoverFactor;
      vec3 hoverDirN = normalize(uHoverDir);
      vec3 hoverTangent = normalDir - hoverDirN * hoverDot;
      hoverTangent /= max(length(hoverTangent), 0.0001);

      float revealGlow = 0.0;
      float revealVisible = 1.0;
      vRevealGlow = 0.0;
      vRevealVisible = 1.0;

      vec3 crestOffset = normalDir * (0.1 + rippleBand * 0.10 + revealGlow * 0.08);
      crestOffset += selTangent * selFactor * uSelectedStrength * 0.12;
      crestOffset += hoverTangent * hoverFactor * uHoverStrength * 0.10;

      float vibeMix = 0.04 + rippleBand * 0.34 + selFactor * 0.45 + hoverFactor * 0.35 + revealGlow * 0.3;
      vec3 jitter = vec3(
        sin(uTime * (0.22 + randSeed * 4.5) + seed * 1.5),
        cos(uTime * (0.28 + randSeed * 5.8) + seed * 2.2),
        sin(uTime * (0.32 + randSeed * 6.8) + seed * 3.0)
      ) * uVibrationAmp * vibeMix * 0.22 * mix(0.85, 1.05, layerId);

      vec3 vibratedPosition = position + crestOffset + jitter;
      vec4 mvPosition = modelViewMatrix * vec4(vibratedPosition, 1.0);

      vec3 viewNormalDir = normalize(normalMatrix * normalDir);
      vec3 viewDirV = normalize(-mvPosition.xyz);
      float fresnel = pow(1.0 - clamp(dot(viewNormalDir, viewDirV), 0.0, 1.0), 2.2);
      vFresnel = fresnel;

      float pulse = mix(0.72, 1.65, activeRipple);
      float layerSizeScale = layerId < 0.5 ? 1.0 : (layerId < 1.5 ? 0.56 : 0.72);
      float selSizeBoost = 1.0 + selFactor * 0.35 + hoverFactor * 0.18 + revealGlow * 0.3 + fresnel * rippleBand * 0.12;

      gl_PointSize = size * pulse * layerSizeScale * selSizeBoost * (620.0 / -mvPosition.z);
      gl_PointSize = clamp(gl_PointSize, 0.0, 16.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vIsIndia;
    varying vec3 vPointPosition;
    varying float vRandSeed;
    varying float vLayerId;
    varying float vSelFactor;
    varying float vHoverFactor;
    varying float vRippleBand;
    varying float vFresnel;
    varying float vRevealGlow;
    varying float vRevealVisible;
    uniform sampler2D pointTexture;
    uniform float uTime;

    void main() {
      vec4 texColor = texture2D(pointTexture, gl_PointCoord);
      if (texColor.a < 0.06) discard;

      float luminance = dot(vColor, vec3(0.299, 0.587, 0.114));
      vec3 earthColor = mix(
        vec3(0.16, 0.15, 0.17),
        vec3(0.96, 0.91, 0.90),
        smoothstep(0.12, 0.78, luminance)
      );

      vec3 rippleNeon = vec3(1.0, 0.88, 0.84);
      float rippleClamped = clamp(vRippleBand, 0.0, 1.0);
      vec3 finalColor = mix(earthColor, rippleNeon, rippleClamped * 0.85);
      finalColor *= (0.78 + rippleClamped * 0.62);

      vec3 rimColor = vec3(1.0, 0.72, 0.62);
      float rippleFresnel = vFresnel * rippleClamped;
      finalColor = mix(finalColor, rimColor, rippleFresnel * 0.5);
      finalColor *= (1.0 + rippleFresnel * 0.45);

      finalColor *= 1.0 + vSelFactor * 0.35;

      vec3 hoverNeon = vec3(1.0, 0.97, 0.9);
      finalColor = mix(finalColor, hoverNeon, vHoverFactor * 0.22);

      vec3 revealNeon = vec3(1.0, 0.84, 0.70);
      finalColor = mix(finalColor, revealNeon, vRevealGlow * 0.8);
      finalColor *= (1.0 + vRevealGlow * 0.6);

      float layerAlpha = vLayerId < 0.5 ? 0.78 : (vLayerId < 1.5 ? 0.30 : 0.36);
      float calmToCrestAlpha = mix(0.82, 1.0, rippleClamped);
      float extraAlpha = calmToCrestAlpha + vSelFactor * 0.6 + vHoverFactor * 0.15 + rippleClamped * 0.3 + rippleFresnel * 0.25 + vRevealGlow * 0.5;

      gl_FragColor = vec4(finalColor, texColor.a * layerAlpha * extraAlpha);
    }
  `,
};

// ─── Helper to create particle texture (unchanged) ──────────────────────
function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.18, "rgba(255, 246, 244, 0.92)");
  gradient.addColorStop(0.42, "rgba(255, 218, 214, 0.38)");
  gradient.addColorStop(0.68, "rgba(255, 176, 186, 0.08)");
  gradient.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ─── Main component ──────────────────────────────────────────────────────
export default function OrbitalGlobe({
  selectedRegion = null,
  targetCoords = null,
  zoomLevel = 0,
  isCardOpen = true,
  className = "",
  vibrationAmp = 0.4,
  selectedPushStrength = 4.2,
  selectedAngularRadius = 0.42,
  hoverPushStrength = 2.6,
  hoverAngularRadius = 0.22,
  raySpokeCount = 10,
  pointStep = 3,
  enableReveal = false,
  revealDuration = 2.6,
  revealBandWidth = 0.16,
  rippleSpeed = 0.22,
  rippleBandWidth = 0.065,
  rippleTrailFrequency = 11,
  rippleTrailDecay = 1.85,
  rippleMaxRadius = 3.3,
  rippleGlowStrength = 1.0,
  hotspots = [],          // NEW
  onHotspotClick = null,  // NEW
}) {
  const mountRef = useRef(null);
  const globeGroupRef = useRef(null);
  const targetBeaconRef = useRef(null);
  const cameraRef = useRef(null);
  const targetRotationRef = useRef({ x: 0.37, y: -2.95 });
  const currentRotationRef = useRef({ x: 0.37, y: -2.95 });
  const targetZoomRef = useRef(280);
  const currentZoomRef = useRef(280);
  const targetPositionXRef = useRef(isCardOpen ? -22 : 0);
  const currentPositionXRef = useRef(isCardOpen ? -22 : 0);
  const isDraggingRef = useRef(false);
  const previousPointerRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const uniformsRef = useRef(null);
  const satellitesRef = useRef([]);
  const selectedDirTargetRef = useRef(new THREE.Vector3(0, 0, 1));
  const selectedDirCurrentRef = useRef(new THREE.Vector3(0, 0, 1));
  const rippleOriginSetAtRef = useRef(0);
  const rippleOriginDirRef = useRef(new THREE.Vector3(0, 0, 1));
  const rippleStartOffsetRef = useRef(1.25);

  // ─── Refs for hotspot group ──────────────────────────────────────────
  const hotspotGroupRef = useRef(null);
  const hotspotSpritesRef = useRef([]);

  // ─── Helper: update hotspot markers ──────────────────────────────────
  const updateHotspots = (hotspotArray) => {
    if (!hotspotGroupRef.current) return;
    const group = hotspotGroupRef.current;
    // Clear existing
    while (group.children.length) {
      const child = group.children[0];
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
      group.remove(child);
    }
    hotspotSpritesRef.current = [];

    if (!hotspotArray || hotspotArray.length === 0) return;

    hotspotArray.forEach((h) => {
      const lat = parseFloat(h.lat);
      const lon = parseFloat(h.lon);
      if (isNaN(lat) || isNaN(lon)) return;

      const cls = h.classification || 'Unclassified';
      const colorHex = CLASS_COLORS[cls] || '#9ca3af';
      const frp = parseFloat(h.frp) || 0;
      const size = Math.min(5, Math.max(0.8, 0.8 + Math.log1p(frp) * 1.2));

      const texture = createMarkerTexture(colorHex);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      const pos = latLonToVector3(lat, lon, 101.5);
      sprite.position.copy(pos);
      sprite.scale.set(size, size, 1);
      sprite.userData.hotspot = h;
      sprite.userData.isHotspot = true;
      group.add(sprite);
      hotspotSpritesRef.current.push(sprite);
    });
  };

  // ─── React to hotspots prop ───────────────────────────────────────────
  useEffect(() => {
    updateHotspots(hotspots);
  }, [hotspots]);

  // ─── React to region / coords changes — rotate globe to target ────────
  useEffect(() => {
    let lat = null, lon = null, zoom = null;
    if (targetCoords && typeof targetCoords.lat === "number") {
      lat = targetCoords.lat;
      lon = targetCoords.lon;
      zoom = targetCoords.zoom || null;
    } else if (selectedRegion && REGION_COORDINATES[selectedRegion]) {
      const rc = REGION_COORDINATES[selectedRegion];
      lat = rc.lat;
      lon = rc.lon;
      zoom = rc.zoom || null;
    }

    if (lat !== null && lon !== null) {
      // Rotate globe to face the region
      const rot = latLonToTargetRotation(lat, lon);
      targetRotationRef.current = { x: rot.x, y: rot.y };

      // Update selection highlight direction
      const dir = latLonToVector3(lat, lon, 1).normalize();
      selectedDirTargetRef.current.copy(dir);

      // Fire a new ripple from the target
      rippleOriginDirRef.current.copy(dir);
      rippleOriginSetAtRef.current = performance.now() / 1000;

      // Move beacon
      if (targetBeaconRef.current) {
        const beaconPos = latLonToVector3(lat, lon, 101.5);
        targetBeaconRef.current.position.copy(beaconPos);
        targetBeaconRef.current.visible = true;
      }

      // Set zoom based on region or prop
      if (zoom) {
        targetZoomRef.current = zoom;
      } else if (zoomLevel !== 0) {
        // Map zoomLevel 1-3 to camera distances
        const zoomMap = { '-2': 320, '-1': 300, 0: 280, 1: 230, 2: 195, 3: 170 };
        targetZoomRef.current = zoomMap[zoomLevel] || 280;
      }

      // Update selection active uniform
      if (uniformsRef.current) {
        uniformsRef.current.uSelectionActive.value = 1;
      }
    } else {
      // No region selected — reset
      if (targetBeaconRef.current) {
        targetBeaconRef.current.visible = false;
      }
      // Reset zoom
      targetZoomRef.current = 280;
      if (uniformsRef.current) {
        uniformsRef.current.uSelectionActive.value = 0;
      }
    }
  }, [selectedRegion, targetCoords, zoomLevel]);

  // ─── React to card open/close — shift globe position ──────────────────
  useEffect(() => {
    targetPositionXRef.current = isCardOpen ? -22 : 0;
  }, [isCardOpen]);

  // ─── Main scene setup ──────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x050308, 0.0028);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1500);
    camera.position.z = 280;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const streakPass = new ShaderPass(RadialStreakShader);
    composer.addPass(streakPass);

    // Globe group
    const globeGroup = new THREE.Group();
    globeGroupRef.current = globeGroup;
    globeGroup.position.x = currentPositionXRef.current;
    globeGroup.rotation.x = currentRotationRef.current.x;
    globeGroup.rotation.y = currentRotationRef.current.y;
    scene.add(globeGroup);

    // ─── Hotspot group (added to globe) ────────────────────────────────
    const hotspotGroup = new THREE.Group();
    hotspotGroupRef.current = hotspotGroup;
    globeGroup.add(hotspotGroup);
    updateHotspots(hotspots);

    // ─── Particle system ────────────────────────────────────────────────
    const particleTexture = createParticleTexture();
    const geometry = new THREE.BufferGeometry();

    const initialDir = (() => {
      let lat = 21.5, lon = 78.9;
      if (targetCoords && typeof targetCoords.lat === "number") {
        lat = targetCoords.lat; lon = targetCoords.lon;
      } else if (selectedRegion && REGION_COORDINATES[selectedRegion]) {
        lat = REGION_COORDINATES[selectedRegion].lat;
        lon = REGION_COORDINATES[selectedRegion].lon;
      }
      return latLonToVector3(lat, lon, 1).normalize();
    })();
    selectedDirCurrentRef.current.copy(initialDir);
    selectedDirTargetRef.current.copy(initialDir);
    rippleOriginDirRef.current.copy(initialDir);
    rippleOriginSetAtRef.current = -rippleStartOffsetRef.current;

    const uniforms = {
      uTime: { value: 0 },
      pointTexture: { value: particleTexture },
      uVibrationAmp: { value: vibrationAmp },
      uSelectedDir: { value: selectedDirCurrentRef.current.clone() },
      uSelectedRadius: { value: selectedAngularRadius },
      uSelectedStrength: { value: selectedPushStrength },
      uHoverDir: { value: new THREE.Vector3(0, 0, 1) },
      uHoverRadius: { value: hoverAngularRadius },
      uHoverStrength: { value: hoverPushStrength },
      uHoverActive: { value: 0 },
      uRayCount: { value: raySpokeCount },
      uSelectionActive: { value: selectedRegion || targetCoords ? 1 : 0 },
      uRevealOriginDir: { value: initialDir.clone() },
      uRevealFrontRadius: { value: 0 },
      uRevealBandWidth: { value: revealBandWidth },
      uRevealGlowGate: { value: 0 },
      uRippleOriginDir: { value: initialDir.clone() },
      uRippleRadius: { value: 0.72 },
      uRippleBandWidth: { value: rippleBandWidth },
      uRippleTrailFreq: { value: rippleTrailFrequency },
      uRippleTrailDecay: { value: rippleTrailDecay },
      uRippleEnvelope: { value: rippleGlowStrength },
    };
    uniformsRef.current = uniforms;

    const pointsMaterial = new THREE.ShaderMaterial({
      vertexShader: PointsShader.vertexShader,
      fragmentShader: PointsShader.fragmentShader,
      uniforms: uniforms,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const pointsMesh = new THREE.Points(geometry, pointsMaterial);
    pointsMesh.renderOrder = 1;
    globeGroup.add(pointsMesh);

    // ─── Load point data ────────────────────────────────────────────────
    const applyBufferData = (buffer) => {
      const floatView = new Float32Array(buffer);
      const rawCount = floatView.length / 8;
      const step = Math.max(2, pointStep);
      const outerCount = Math.floor(rawCount / step);
      const innerStep = step;
      const innerOffset = Math.floor(step / 2) || 1;
      const innerCount = Math.floor((rawCount - innerOffset) / innerStep);
      const topCount = Math.floor(outerCount * 0.45);
      const totalCount = outerCount + innerCount + topCount;

      const OUTER_SCALE = 1.035;
      const INNER_SCALE = 0.965;
      const TOP_SCALE = 1.075;

      const positions = new Float32Array(totalCount * 3);
      const colors = new Float32Array(totalCount * 3);
      const sizes = new Float32Array(totalCount);
      const isIndia = new Float32Array(totalCount);
      const randSeed = new Float32Array(totalCount);
      const layerId = new Float32Array(totalCount);

      const sizeVariance = () => 0.55 + Math.pow(Math.random(), 3.2) * 1.65;

      const createShuffledIndices = () => {
        const indices = Array.from({ length: rawCount }, (_, index) => index);
        for (let index = indices.length - 1; index > 0; index -= 1) {
          const swapIndex = Math.floor(Math.random() * (index + 1));
          [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
        }
        return indices;
      };

      const outerIndices = createShuffledIndices();
      const innerIndices = createShuffledIndices();
      const topIndices = createShuffledIndices();

      const writePoint = (idx, srcIndex, scale, layer) => {
        const offset = srcIndex * 8;
        const px = floatView[offset];
        const py = floatView[offset + 1];
        const pz = floatView[offset + 2];
        const cr = floatView[offset + 3];
        const cg = floatView[offset + 4];
        const cb = floatView[offset + 5];
        const baseSize = floatView[offset + 6];
        const indiaFlag = floatView[offset + 7];

        positions[idx * 3] = px * scale;
        positions[idx * 3 + 1] = py * scale;
        positions[idx * 3 + 2] = pz * scale;

        colors[idx * 3] = cr;
        colors[idx * 3 + 1] = cg;
        colors[idx * 3 + 2] = cb;

        sizes[idx] = baseSize * sizeVariance();
        isIndia[idx] = indiaFlag;
        randSeed[idx] = Math.random();
        layerId[idx] = layer;
      };

      for (let i = 0; i < outerCount; i++) {
        writePoint(i, outerIndices[i * step], OUTER_SCALE, 0);
      }
      for (let i = 0; i < innerCount; i++) {
        writePoint(outerCount + i, innerIndices[i * innerStep], INNER_SCALE, 1);
      }
      for (let i = 0; i < topCount; i++) {
        writePoint(outerCount + innerCount + i, topIndices[i * step], TOP_SCALE, 2);
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
      geometry.setAttribute("isIndia", new THREE.BufferAttribute(isIndia, 1));
      geometry.setAttribute("randSeed", new THREE.BufferAttribute(randSeed, 1));
      geometry.setAttribute("layerId", new THREE.BufferAttribute(layerId, 1));
      geometry.computeBoundingSphere();
    };

    fetch("/assets/globe_points.bin")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch globe_points.bin");
        return res.arrayBuffer();
      })
      .then((buffer) => applyBufferData(buffer))
      .catch((err) => console.warn("Using fallback:", err));

    // ─── Core (occlusion sphere) ────────────────────────────────────────
    const coreGeometry = new THREE.SphereGeometry(97.5, 48, 48);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0x020308 });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.renderOrder = 0;
    globeGroup.add(coreMesh);

    // ─── Hover proxy sphere ─────────────────────────────────────────────
    const hoverProxyGeometry = new THREE.SphereGeometry(101, 48, 48);
    const hoverProxyMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const hoverProxyMesh = new THREE.Mesh(hoverProxyGeometry, hoverProxyMaterial);
    globeGroup.add(hoverProxyMesh);

    // ─── Beacon marker ──────────────────────────────────────────────────
    const beaconGroup = new THREE.Group();
    const beaconGeom = new THREE.SphereGeometry(1.8, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
    const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
    const ringCurve = new THREE.EllipseCurve(0, 0, 4.5, 4.5, 0, 2 * Math.PI, false, 0);
    const ringGeom = new THREE.BufferGeometry().setFromPoints(ringCurve.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, 0)));
    const ringMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 });
    const ringLine = new THREE.LineLoop(ringGeom, ringMat);
    beaconGroup.add(beaconMesh);
    beaconGroup.add(ringLine);
    const initialPos = latLonToVector3(21.5, 78.9, 101.5);
    beaconGroup.position.copy(initialPos);
    globeGroup.add(beaconGroup);
    beaconGroup.visible = Boolean(selectedRegion || targetCoords);
    targetBeaconRef.current = beaconGroup;

    // ─── Orbital satellite rings (optional – we keep empty config) ────
    const orbitalGroup = new THREE.Group();
    globeGroup.add(orbitalGroup);
    const orbitConfigs = []; // no rings by default
    const satellites = [];
    orbitConfigs.forEach((cfg) => { /* ... (omitted for brevity) ... */ });
    satellitesRef.current = satellites;

    // ─── Radiation sprites & arcs ──────────────────────────────────────
    const radiationGroup = new THREE.Group();
    globeGroup.add(radiationGroup);

    const createAuraTexture = (innerColor, outerColor) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return new THREE.CanvasTexture(canvas);
      const gradient = ctx.createRadialGradient(128, 128, 5, 128, 128, 128);
      gradient.addColorStop(0, innerColor);
      gradient.addColorStop(0.24, outerColor);
      gradient.addColorStop(0.68, outerColor.replace("0.42", "0.08"));
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(canvas);
    };

    const auraConfigs = [
      { color: 0xffc46b, inner: "rgba(255,255,235,0.7)", outer: "rgba(255,190,76,0.42)", position: [-78, 30, 18], scale: 50, speed: 0.24, phase: 0.2 },
      { color: 0xff8fb8, inner: "rgba(255,230,240,0.6)", outer: "rgba(255,112,172,0.42)", position: [64, 34, -20], scale: 45, speed: 0.19, phase: 1.4 },
      { color: 0x9fa7ff, inner: "rgba(230,232,255,0.54)", outer: "rgba(119,128,255,0.42)", position: [18, -66, 20], scale: 42, speed: 0.27, phase: 2.7 },
      { color: 0xffa06f, inner: "rgba(255,238,210,0.58)", outer: "rgba(255,128,76,0.42)", position: [-36, 60, -10], scale: 39, speed: 0.22, phase: 3.6 },
    ];
    const radiationSprites = auraConfigs.map((cfg) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createAuraTexture(cfg.inner, cfg.outer),
        color: cfg.color,
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      sprite.position.set(...cfg.position);
      sprite.scale.set(cfg.scale, cfg.scale, 1);
      radiationGroup.add(sprite);
      return { sprite, ...cfg };
    });

    const radiationArcs = [
      { radius: 106, color: 0xffd6b1, tiltX: 0.35, tiltZ: 0.18, speed: 0.07, phase: 0.2 },
      { radius: 111, color: 0xffc8d4, tiltX: -0.52, tiltZ: -0.2, speed: -0.055, phase: 1.5 },
      { radius: 116, color: 0xc4c9e8, tiltX: 1.02, tiltZ: 0.3, speed: 0.045, phase: 2.8 },
    ].map((cfg) => {
      const points = [];
      for (let index = 0; index <= 72; index += 1) {
        const angle = -Math.PI * 0.62 + (index / 72) * Math.PI * 1.24;
        points.push(new THREE.Vector3(Math.cos(angle) * cfg.radius, 0, Math.sin(angle) * cfg.radius));
      }
      const arcGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const arcMaterial = new THREE.LineBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.028,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
      const arc = new THREE.Line(arcGeometry, arcMaterial);
      arc.rotation.x = cfg.tiltX;
      arc.rotation.z = cfg.tiltZ;
      arc.renderOrder = 4;
      radiationGroup.add(arc);
      return { arc, arcGeometry, ...cfg };
    });

    // ─── Pointer controls (drag, zoom, hover) ──────────────────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hoverNdc = new THREE.Vector2(-10, -10);
    const hoverDirTarget = new THREE.Vector3(0, 0, 1);
    const hoverDirCurrent = new THREE.Vector3(0, 0, 1);
    let hoverActiveTarget = 0;
    let hoverActiveCurrent = 0;

    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      previousPointerRef.current = { x: e.clientX, y: e.clientY };
      velocityRef.current = { x: 0, y: 0 };
    };

    const onPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - previousPointerRef.current.x;
      const deltaY = e.clientY - previousPointerRef.current.y;
      velocityRef.current = { x: deltaX * 0.0055, y: deltaY * 0.0055 };
      currentRotationRef.current.y += velocityRef.current.x;
      currentRotationRef.current.x += velocityRef.current.y;
      currentRotationRef.current.x = Math.max(-Math.PI * 0.45, Math.min(Math.PI * 0.45, currentRotationRef.current.x));
      targetRotationRef.current.x = currentRotationRef.current.x;
      targetRotationRef.current.y = currentRotationRef.current.y;
      previousPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = () => { isDraggingRef.current = false; };
    const onWheel = (e) => {
      e.preventDefault();
      targetZoomRef.current = Math.max(130, Math.min(320, targetZoomRef.current + e.deltaY * 0.18));
    };

    const onHoverPointerMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      hoverNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      hoverNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };
    const onHoverPointerLeave = () => {
      hoverActiveTarget = 0;
      hoverNdc.set(-10, -10);
    };

    // ─── Hotspot click handler ──────────────────────────────────────────
    const onHotspotPointerDown = (event) => {
      // Only handle if not dragging (simple threshold: small movement)
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hotspotChildren = hotspotGroup.children.filter(c => c.userData.isHotspot);
      const intersects = raycaster.intersectObjects(hotspotChildren);
      if (intersects.length > 0) {
        const hit = intersects[0].object;
        const hotspot = hit.userData.hotspot;
        if (hotspot && onHotspotClick) {
          onHotspotClick(hotspot);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("pointermove", onHoverPointerMove);
    dom.addEventListener("pointerleave", onHoverPointerLeave);
    dom.addEventListener("pointerdown", onHotspotPointerDown);

    // ─── Resize handler ──────────────────────────────────────────────────
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
      composer.setSize(newW, newH);
    };
    window.addEventListener("resize", handleResize);

    // ─── Animation loop ─────────────────────────────────────────────────
    let animationFrameId;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      if (uniformsRef.current) {
        uniformsRef.current.uTime.value = elapsedTime;
        const sinceOrigin = elapsedTime - rippleOriginSetAtRef.current;
        const rippleRadius = ((sinceOrigin * rippleSpeed) % rippleMaxRadius + rippleMaxRadius) % rippleMaxRadius;
        uniformsRef.current.uRippleRadius.value = rippleRadius;
        uniformsRef.current.uRippleOriginDir.value.copy(rippleOriginDirRef.current);
        uniformsRef.current.uRippleEnvelope.value = rippleGlowStrength;

        selectedDirCurrentRef.current.lerp(selectedDirTargetRef.current, 0.05);
        if (selectedDirCurrentRef.current.lengthSq() > 0.0001) selectedDirCurrentRef.current.normalize();
        uniformsRef.current.uSelectedDir.value.copy(selectedDirCurrentRef.current);

        raycaster.setFromCamera(hoverNdc, camera);
        const hoverHits = raycaster.intersectObject(hoverProxyMesh, false);
        if (hoverHits.length > 0) {
          const localPoint = globeGroup.worldToLocal(hoverHits[0].point.clone());
          hoverDirTarget.copy(localPoint).normalize();
          hoverActiveTarget = 1.0;
        } else {
          hoverActiveTarget = 0.0;
        }
        hoverActiveCurrent += (hoverActiveTarget - hoverActiveCurrent) * 0.15;
        hoverDirCurrent.lerp(hoverDirTarget, 0.25);
        if (hoverDirCurrent.lengthSq() > 0.0001) hoverDirCurrent.normalize();
        uniformsRef.current.uHoverDir.value.copy(hoverDirCurrent);
        uniformsRef.current.uHoverActive.value = hoverActiveCurrent;
      }

      if (beaconGroup) {
        const s = 1.0 + 0.3 * Math.sin(elapsedTime * 6.0);
        ringLine.scale.set(s, s, s);
      }

      currentPositionXRef.current += (targetPositionXRef.current - currentPositionXRef.current) * 0.06;
      if (globeGroupRef.current) globeGroupRef.current.position.x = currentPositionXRef.current;

      if (!isDraggingRef.current) {
        velocityRef.current.x *= 0.94;
        velocityRef.current.y *= 0.94;
        currentRotationRef.current.y += velocityRef.current.x;
        currentRotationRef.current.x += velocityRef.current.y;
        const lerpFactor = 0.055;
        currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * lerpFactor;
        let dy = targetRotationRef.current.y - currentRotationRef.current.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        currentRotationRef.current.y += dy * lerpFactor;
        if (Math.abs(dy) < 0.005 && Math.abs(velocityRef.current.x) < 0.001) {
          targetRotationRef.current.y += delta * 0.045;
        }
      }

      const prevZoom = currentZoomRef.current;
      currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.08;
      camera.position.z = currentZoomRef.current;
      const zoomDelta = Math.abs(currentZoomRef.current - prevZoom);
      const targetStrength = Math.min(zoomDelta * 0.015, 0.12);
      streakPass.uniforms.uStrength.value += (targetStrength - streakPass.uniforms.uStrength.value) * 0.3;

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      radiationSprites.forEach((fx) => {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * fx.speed + fx.phase);
        fx.sprite.material.opacity = 0.11 + pulse * 0.10;
        const scale = fx.scale * (0.96 + pulse * 0.08);
        fx.sprite.scale.set(scale, scale, 1);
      });
      radiationArcs.forEach((fx) => {
        const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * fx.speed + fx.phase);
        fx.arc.material.opacity = 0.12 + pulse * 0.14;
        fx.arc.rotation.y += fx.speed * delta;
      });

      satellitesRef.current.forEach((sat) => {
        sat.angle += delta * sat.speed * 0.45;
        sat.pulsePhase += delta * 2.2;
        const pos = new THREE.Vector3(
          sat.radius * Math.cos(sat.angle),
          0,
          sat.radius * Math.sin(sat.angle),
        );
        pos.applyAxisAngle(new THREE.Vector3(1, 0, 0), sat.tiltX);
        pos.applyAxisAngle(new THREE.Vector3(0, 0, 1), sat.tiltZ);
        sat.group.position.copy(pos);
        const pulse = 1 + Math.sin(sat.pulsePhase) * 0.35;
        sat.group.scale.setScalar(pulse);
        sat.glow.material.opacity = 0.42 + (Math.sin(sat.pulsePhase * 1.2) + 1) * 0.25;
      });

      composer.render();
    };

    animate();

    // ─── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      try {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", handleResize);
        dom.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        dom.removeEventListener("wheel", onWheel);
        dom.removeEventListener("pointermove", onHoverPointerMove);
        dom.removeEventListener("pointerleave", onHoverPointerLeave);
        dom.removeEventListener("pointerdown", onHotspotPointerDown);

        radiationSprites.forEach((fx) => {
          fx.sprite.material.map?.dispose();
          fx.sprite.material.dispose();
        });
        radiationArcs.forEach((fx) => {
          fx.arcGeometry.dispose();
          fx.arc.material.dispose();
        });
        geometry.dispose();
        pointsMaterial.dispose();
        coreGeometry.dispose();
        coreMaterial.dispose();
        hoverProxyGeometry.dispose();
        hoverProxyMaterial.dispose();
        if (particleTexture) particleTexture.dispose();
        composer.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      } catch (err) {
        console.warn("OrbitalGlobe cleanup error (non-fatal):", err);
      }
    };
  }, []); // we don't want to re-run on prop changes, only mount

  // ─── Render container ──────────────────────────────────────────────────
  return (
    <div
      ref={mountRef}
      className={`orbital-globe-container ${className}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
        backgroundColor: "#050308",
      }}
      aria-label="Interactive 3D Earth Globe"
    />
  );
}