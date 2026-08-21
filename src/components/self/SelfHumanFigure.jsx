import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';

const MODEL_URL = '/models/human-body.glb';
const TARGET_HEIGHT = 2.05;

const BODY_COLOR = '#071c17';
const BODY_EMISSIVE = '#063d31';
const BODY_OPACITY = 0.36;
const EMERALD = '#10b981';
const EMERALD_BRIGHT = '#34d399';
const AMBER = '#b45309';
const AMBER_MUTED = '#92400e';

const MATERIAL_TEXTURE_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'envMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
  'anisotropyMap',
];

function createBodyMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(BODY_COLOR),
    transparent: true,
    opacity: BODY_OPACITY,
    metalness: 0.05,
    roughness: 0.28,
    emissive: new THREE.Color(BODY_EMISSIVE),
    emissiveIntensity: 0.15,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function createOutlineMaterial() {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color('#a7f3d0'),
    transparent: true,
    opacity: 0.28,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material.dispose?.();
}

function disposeMaterialWithMaps(material) {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((mat) => {
    MATERIAL_TEXTURE_KEYS.forEach((key) => {
      if (mat[key]) {
        mat[key].dispose();
        mat[key] = null;
      }
    });
    mat.dispose();
  });
}

function sanitizeMeshGeometry(geometry) {
  if (!geometry) return;

  if (geometry.groups?.length) {
    geometry.clearGroups();
  }

  if (geometry.attributes.color) {
    geometry.deleteAttribute('color');
  }
}

function disposeObject(object) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();

  object.traverse((child) => {
    if (child.isMesh || child.isLine || child.isLineSegments) {
      if (child.geometry && !disposedGeometries.has(child.geometry.uuid)) {
        child.geometry.dispose();
        disposedGeometries.add(child.geometry.uuid);
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!material || disposedMaterials.has(material.uuid)) return;
        disposeMaterial(material);
        disposedMaterials.add(material.uuid);
      });
    }
  });
}

function fitAndCenterModel(root) {
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  root.position.sub(center);

  if (size.z > size.y * 1.15 && size.z > size.x) {
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
  }

  const fittedBox = new THREE.Box3().setFromObject(root);
  const fittedSize = fittedBox.getSize(new THREE.Vector3());
  const scale = TARGET_HEIGHT / Math.max(fittedSize.x, fittedSize.y, fittedSize.z);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalCenter = finalBox.getCenter(new THREE.Vector3());
  root.position.sub(finalCenter);
  root.updateMatrixWorld(true);

  return new THREE.Box3().setFromObject(root);
}

function boundsToSnapshot(box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: size.toArray(),
    center: center.toArray(),
  };
}

function applyPremiumLook(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh && !child.userData?.isOutline) {
      meshes.push(child);
    }
  });

  const bodyMaterial = createBodyMaterial();
  const outlineMaterials = [];

  meshes.forEach((child) => {
    disposeMaterialWithMaps(child.material);
    sanitizeMeshGeometry(child.geometry);

    child.castShadow = false;
    child.receiveShadow = false;
    child.material = bodyMaterial;
    child.renderOrder = 2;

    const outlineMaterial = createOutlineMaterial();
    outlineMaterials.push(outlineMaterial);

    const outline = new THREE.Mesh(child.geometry, outlineMaterial);
    outline.scale.set(1.018, 1.018, 1.018);
    outline.renderOrder = 1;
    outline.userData.isOutline = true;
    child.add(outline);
  });

  root.userData.figureMaterials = {
    bodyMaterial,
    outlineMaterials,
  };
}

function buildInternalNetwork(snapshot, nodeCount = 20) {
  const rand = seededRandom(42);
  const [, minY] = snapshot.min;
  const [sizeX, sizeY, sizeZ] = snapshot.size;

  const torsoMinY = minY + sizeY * 0.42;
  const torsoMaxY = minY + sizeY * 0.88;
  const radiusX = sizeX * 0.22;
  const radiusZ = sizeZ * 0.16;

  const nodes = [];
  let attempts = 0;

  while (nodes.length < nodeCount && attempts < nodeCount * 12) {
    attempts += 1;
    const x = (rand() - 0.5) * radiusX * 2;
    const y = torsoMinY + rand() * (torsoMaxY - torsoMinY);
    const z = (rand() - 0.5) * radiusZ * 2;
    nodes.push(new THREE.Vector3(x, y, z));
  }

  const edges = new Set();
  nodes.forEach((node, index) => {
    const nearest = nodes
      .map((other, otherIndex) => ({
        index: otherIndex,
        distance: node.distanceTo(other),
      }))
      .filter((entry) => entry.index !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);

    nearest.forEach(({ index: otherIndex }) => {
      const key = [Math.min(index, otherIndex), Math.max(index, otherIndex)].join(':');
      edges.add(key);
    });
  });

  const linePositions = [];
  edges.forEach((key) => {
    const [a, b] = key.split(':').map(Number);
    linePositions.push(
      nodes[a].x,
      nodes[a].y,
      nodes[a].z,
      nodes[b].x,
      nodes[b].y,
      nodes[b].z,
    );
  });

  return { nodes, linePositions };
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event) => setReducedMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reducedMotion;
}

function FigureLoading() {
  return (
    <div className="self-figure__loading" aria-hidden="true">
      <div className="self-figure__loading-ring" />
      <span className="self-figure__loading-text">Loading figure</span>
    </div>
  );
}

function FigureFallback({ message }) {
  return (
    <div className="self-figure__fallback" aria-hidden="true">
      <img
        className="self-figure__fallback-image"
        src="/self-human-placeholder.svg"
        alt=""
        draggable={false}
      />
      <span className="self-figure__fallback-text">
        {message || 'Figure unavailable'}
      </span>
    </div>
  );
}

class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('SelfHumanFigure canvas error:', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function InternalNetwork({ bounds, reducedMotion }) {
  const groupRef = useRef();
  const lineMaterialRef = useRef();
  const nodeMaterialRef = useRef();

  const network = useMemo(() => {
    if (!bounds) return null;
    return buildInternalNetwork(bounds, 20);
  }, [bounds]);

  const lineGeometry = useMemo(() => {
    if (!network) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(network.linePositions, 3),
    );
    return geometry;
  }, [network]);

  useEffect(() => {
    return () => {
      lineGeometry?.dispose();
      if (groupRef.current) {
        disposeObject(groupRef.current);
      }
    };
  }, [lineGeometry]);

  useFrame(({ clock }) => {
    if (!network || reducedMotion) return;
    const pulse = 0.18 + Math.sin(clock.elapsedTime * 0.45) * 0.08;
    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity = 0.16 + pulse;
    }
    if (nodeMaterialRef.current) {
      nodeMaterialRef.current.opacity = 0.42 + pulse * 0.7;
    }
  });

  if (!network || !lineGeometry) return null;

  return (
    <group ref={groupRef}>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial
          ref={lineMaterialRef}
          color={EMERALD_BRIGHT}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>

      {network.nodes.map((node, index) => (
        <mesh key={`node-${index}`} position={node.toArray()}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshBasicMaterial
            ref={index === 0 ? nodeMaterialRef : undefined}
            color={EMERALD_BRIGHT}
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

function RegionGlows({ bounds }) {
  const glows = useMemo(() => {
    if (!bounds) return [];
    const [sizeX, sizeY, sizeZ] = bounds.size;
    const [centerX, centerY, centerZ] = bounds.center;

    return [
      {
        key: 'chest',
        position: [centerX, centerY + sizeY * 0.18, centerZ + sizeZ * 0.08],
        color: EMERALD,
        intensity: 2.4,
        distance: sizeY * 0.28,
      },
      {
        key: 'belly',
        position: [centerX, centerY + sizeY * 0.02, centerZ + sizeZ * 0.06],
        color: EMERALD,
        intensity: 0.9,
        distance: sizeY * 0.18,
      },
      {
        key: 'head',
        position: [centerX, centerY + sizeY * 0.38, centerZ],
        color: AMBER,
        intensity: 0.75,
        distance: sizeY * 0.16,
      },
      {
        key: 'shoulder-left',
        position: [centerX - sizeX * 0.18, centerY + sizeY * 0.28, centerZ],
        color: AMBER_MUTED,
        intensity: 0.45,
        distance: sizeY * 0.12,
      },
      {
        key: 'shoulder-right',
        position: [centerX + sizeX * 0.18, centerY + sizeY * 0.28, centerZ],
        color: AMBER_MUTED,
        intensity: 0.45,
        distance: sizeY * 0.12,
      },
    ];
  }, [bounds]);

  return (
    <>
      {glows.map((glow) => (
        <pointLight
          key={glow.key}
          position={glow.position}
          color={glow.color}
          intensity={glow.intensity}
          distance={glow.distance}
          decay={2}
        />
      ))}
    </>
  );
}

function HumanModel({ onBoundsChange, onReady }) {
  const groupRef = useRef();
  const modelRef = useRef(null);
  const { scene } = useGLTF(MODEL_URL);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;

    if (modelRef.current) {
      const figureMaterials = modelRef.current.userData.figureMaterials;
      disposeObject(modelRef.current);
      figureMaterials?.outlineMaterials?.forEach(disposeMaterial);
      disposeMaterial(figureMaterials?.bodyMaterial);
      root.remove(modelRef.current);
    }

    const model = scene.clone(true);
    applyPremiumLook(model);
    modelRef.current = model;
    root.add(model);

    const bounds = fitAndCenterModel(root);
    onBoundsChange(boundsToSnapshot(bounds));
    onReady?.();

    return () => {
      if (modelRef.current) {
        const figureMaterials = modelRef.current.userData.figureMaterials;
        disposeObject(modelRef.current);
        figureMaterials?.outlineMaterials?.forEach(disposeMaterial);
        disposeMaterial(figureMaterials?.bodyMaterial);
        root.remove(modelRef.current);
        modelRef.current = null;
      }
    };
  }, [scene, onBoundsChange, onReady]);

  return <group ref={groupRef} />;
}

function computeFitDistance(sizeY, sizeX, fovDeg, aspect, padding = 1.28) {
  const fovRad = (fovDeg * Math.PI) / 180;
  const distanceForHeight = (sizeY * padding) / (2 * Math.tan(fovRad / 2));
  const horizontalFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
  const distanceForWidth = (sizeX * padding) / (2 * Math.tan(horizontalFov / 2));
  return Math.max(distanceForHeight, distanceForWidth, 2.8);
}

function CameraRig({ bounds, controlsRef, onFitDistance }) {
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    if (!bounds || !controlsRef.current) return;

    const sizeY = bounds.size[1];
    const sizeX = bounds.size[0];
    const aspect = size.width / Math.max(size.height, 1);
    const distance = computeFitDistance(sizeY, sizeX, camera.fov, aspect);
    camera.position.set(0, sizeY * 0.02, distance);
    camera.near = 0.1;
    camera.far = 50;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.minDistance = distance * 0.78;
    controlsRef.current.maxDistance = distance * 1.38;
    controlsRef.current.update();

    onFitDistance?.(distance);
  }, [bounds, camera, controlsRef, size.width, size.height, onFitDistance]);

  return null;
}

function PlatformZoomSync({ fitDistance, controlsRef, onZoomScaleChange }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!fitDistance || !controlsRef.current) return;
    const current = camera.position.distanceTo(controlsRef.current.target);
    if (!current) return;
    const scale = fitDistance / current;
    const clamped = Math.max(0.72, Math.min(1.28, scale));
    onZoomScaleChange?.(clamped);
  });

  return null;
}

function SceneContent({ reducedMotion, onReady, onBoundsChange, onZoomScaleChange }) {
  const [bounds, setBounds] = useState(null);
  const [fitDistance, setFitDistance] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const controlsRef = useRef();

  const handleBoundsChange = useCallback((snapshot) => {
    setBounds(snapshot);
    onBoundsChange?.(snapshot);
  }, [onBoundsChange]);

  const handleFitDistance = useCallback((distance) => {
    setFitDistance(distance);
    onZoomScaleChange?.(1);
  }, [onZoomScaleChange]);

  const autoRotate = !reducedMotion && !isInteracting;

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[0.5, 1.5, -2.5]} intensity={0.85} color={EMERALD_BRIGHT} />
      <directionalLight position={[-2.2, 0.8, -1.8]} intensity={0.55} color={EMERALD} />
      <directionalLight position={[2.2, 0.8, -1.8]} intensity={0.55} color={EMERALD} />
      <pointLight position={[0, 0.4, 2.2]} intensity={0.18} color="#ffffff" />

      <HumanModel onBoundsChange={handleBoundsChange} onReady={onReady} />
      <InternalNetwork bounds={bounds} reducedMotion={reducedMotion} />
      <RegionGlows bounds={bounds} />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        minPolarAngle={Math.PI * 0.28}
        maxPolarAngle={Math.PI * 0.72}
        autoRotate={autoRotate}
        autoRotateSpeed={0.35}
        onStart={() => setIsInteracting(true)}
        onEnd={() => setIsInteracting(false)}
      />

      <CameraRig bounds={bounds} controlsRef={controlsRef} onFitDistance={handleFitDistance} />
      <PlatformZoomSync
        fitDistance={fitDistance}
        controlsRef={controlsRef}
        onZoomScaleChange={onZoomScaleChange}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.34}
          luminanceThreshold={0.42}
          luminanceSmoothing={0.92}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

function HumanFigureCanvas({ reducedMotion, onReady, onError, onZoomScaleChange }) {
  return (
    <Canvas
      className="self-figure__canvas"
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0);
        scene.background = null;
      }}
      camera={{ fov: 36, near: 0.1, far: 50, position: [0, 0, 3.6] }}
    >
      <CanvasErrorBoundary onError={onError}>
        <Suspense fallback={null}>
          <SceneContent
            reducedMotion={reducedMotion}
            onReady={onReady}
            onZoomScaleChange={onZoomScaleChange}
          />
        </Suspense>
      </CanvasErrorBoundary>
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);

export function SelfHumanFigure() {
  const reducedMotion = usePrefersReducedMotion();
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const platformRef = useRef(null);
  const lastZoomRef = useRef(1);

  const handleReady = useCallback(() => {
    setStatus('ready');
  }, []);

  const handleError = useCallback((error) => {
    setErrorMessage(error?.message || 'Figure unavailable');
    setStatus('error');
  }, []);

  const handleZoomScaleChange = useCallback((scale) => {
    if (Math.abs(scale - lastZoomRef.current) < 0.015) return;
    lastZoomRef.current = scale;
    if (platformRef.current) {
      platformRef.current.style.transform = `translateX(-50%) scale(${scale})`;
    }
  }, []);

  return (
    <div className="self-figure" aria-hidden="true">
      <div className="self-figure__ambient self-figure__ambient--emerald" />
      <div className="self-figure__ambient self-figure__ambient--amber" />

      <div className="self-figure__stage">
        <div className="self-figure__platform" ref={platformRef}>
          <div className="self-figure__platform-ring" />
          <div className="self-figure__platform-glow" />
        </div>

        {status === 'error' ? (
          <FigureFallback message={errorMessage} />
        ) : (
          <>
            {status === 'loading' && <FigureLoading />}
            <HumanFigureCanvas
              reducedMotion={reducedMotion}
              onReady={handleReady}
              onError={handleError}
              onZoomScaleChange={handleZoomScaleChange}
            />
          </>
        )}

        <div className="self-figure__reflection" aria-hidden="true" />
      </div>
    </div>
  );
}
