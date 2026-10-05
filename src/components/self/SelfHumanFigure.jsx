import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const MODEL_URL = '/models/human-body.glb';
const TARGET_HEIGHT = 2.05;

const BODY_COLOR = '#178258';
const EMERALD = '#34d399';

function createBodyMaterial(opacity = 0.30, sourceMaterial, geometry) {
  const material = new THREE.MeshPhysicalMaterial({
    color: BODY_COLOR,
    transparent: true,
    opacity: THREE.MathUtils.clamp(opacity, 0, 1),
    metalness: 0.03,
    roughness: 0.5,
    clearcoat: 0.12,
    clearcoatRoughness: 0.5,
    emissive: '#13bb79',
    emissiveIntensity: 0.8,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  if (sourceMaterial?.map) {
    // Keep the GLB's exact UV layout, but use only luminance, never its skin hue/alpha.
    material.map = sourceMaterial.map;
    geometry?.computeBoundingBox();
    const box = geometry?.boundingBox;
    const extent = box?.getSize(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
    const axis = extent.z > extent.y && extent.z > extent.x ? 'z' : extent.x > extent.y ? 'x' : 'y';
    const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
    material.onBeforeCompile = (shader) => {
      shader.uniforms.bodyHeightAxis = { value: direction };
      shader.uniforms.bodyHeightRange = { value: new THREE.Vector2(box?.min[axis] || 0, Math.max(extent[axis], 0.001)) };
      shader.vertexShader = 'uniform vec3 bodyHeightAxis;\n uniform vec2 bodyHeightRange;\n varying float vBodyHeadMask;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float bodyHeight = (dot(position, bodyHeightAxis) - bodyHeightRange.x) / bodyHeightRange.y;
        vBodyHeadMask = smoothstep(0.80, 0.89, bodyHeight);`);
      shader.fragmentShader = 'varying float vBodyHeadMask;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `float bodyDetailShade = 1.0;
        #ifdef USE_MAP
          vec3 originalSurface = texture2D(map, vMapUv).rgb;
          float detailLuma = dot(originalSurface, vec3(0.2126, 0.7152, 0.0722));
          bodyDetailShade = clamp(pow(max(detailLuma, 0.001) / 0.46774, 1.65), 0.38, 1.22);
          bodyDetailShade = mix(bodyDetailShade, clamp(bodyDetailShade, 0.74, 1.04), vBodyHeadMask);
          // Tone down reddish mouth/interior texels instead of making them glowing patches.
          float mouthTissue = smoothstep(0.28, 0.45, originalSurface.r - originalSurface.g)
            * (1.0 - smoothstep(0.10, 0.24, originalSurface.g));
          bodyDetailShade = mix(bodyDetailShade, 0.65, mouthTissue * vBodyHeadMask);
          diffuseColor.rgb *= bodyDetailShade;
        #endif`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Sculpt existing normals without altering vertices, opacity or hue.
        float reliefFacing = dot(normal, normalize(vec3(-0.55, 0.65, 0.60)));
        float reliefShade = mix(0.72, 1.12, smoothstep(-0.35, 0.75, reliefFacing));
        reliefShade = mix(reliefShade, mix(0.95, 1.02, reliefFacing * 0.5 + 0.5), vBodyHeadMask);
        diffuseColor.rgb *= reliefShade;
        totalEmissiveRadiance *= bodyDetailShade * reliefShade * mix(1.0, 0.78, vBodyHeadMask);
        float bodyRim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.6);
        totalEmissiveRadiance += vec3(0.025, 0.24, 0.12) * bodyRim * mix(1.0, 0.55, vBodyHeadMask);`,
      );
    };
    material.customProgramCacheKey = () => 'self-human-face-relief-rim-v2';
  }
  // Preserve real relief maps if a future GLB supplies them. Never add displacement.
  if (sourceMaterial?.normalMap) {
    material.normalMap = sourceMaterial.normalMap;
    material.normalMapType = sourceMaterial.normalMapType;
    material.normalScale.copy(sourceMaterial.normalScale);
  }
  if (sourceMaterial?.bumpMap) {
    material.bumpMap = sourceMaterial.bumpMap;
    material.bumpScale = sourceMaterial.bumpScale;
  }
  return material;
}

function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material.dispose?.();
}

function sanitizeMeshGeometry(geometry) {
  if (!geometry) return;

  // Preserve primitive/material groups and all original positions, UVs and normals.
  if (geometry.attributes.color) {
    geometry.deleteAttribute('color');
  }
}

function disposeObject(object) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  const disposedSkeletons = new Set();

  object.traverse((child) => {
    if (child.isSkinnedMesh && !disposedSkeletons.has(child.skeleton)) {
      child.skeleton.dispose();
      disposedSkeletons.add(child.skeleton);
    }
    if (child.isMesh) {
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
  if (box.isEmpty() || !Number.isFinite(size.length()) || size.length() < 0.00001) {
    throw new Error('The GLB does not contain a usable body mesh');
  }

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

function applyPremiumLook(root, opacity) {
  const materialCopies = new Map();
  const getMaterial = (original, geometry) => {
    if (!materialCopies.has(original)) materialCopies.set(original, createBodyMaterial(opacity, original, geometry));
    return materialCopies.get(original);
  };
  const decorations = [];
  // Work only on owned copies: useGLTF caches source geometries and textures.
  root.traverse((child) => {
    if (child.isLight || child.isCamera || child.isLine || child.isPoints) {
      child.visible = false;
      decorations.push(child);
    }
    if (!child.isMesh) return;
    child.geometry = child.geometry.clone();
    sanitizeMeshGeometry(child.geometry);
    child.material = Array.isArray(child.material)
      ? child.material.map((original) => getMaterial(original, child.geometry))
      : getMaterial(child.material, child.geometry);
    child.castShadow = false;
    child.receiveShadow = false;
    // Composite the transparent shell after opaque internal meshes.
    child.renderOrder = 10;
    child.frustumCulled = false;
  });
  // Invisible lines/points still contribute to Box3, so detach them before fitting.
  decorations.forEach((child) => child.removeFromParent());
  return [...materialCopies.values()];
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

function HumanModel({ onBoundsChange, onReady, bodyOpacity }) {
  const groupRef = useRef();
  const modelRef = useRef(null);
  const { scene } = useGLTF(MODEL_URL);

  useLayoutEffect(() => {
    const root = groupRef.current;
    if (!root) return;
    // Reset wrapper transforms on every setup, including React Strict Mode replay.
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);

    const model = clone(scene);
    applyPremiumLook(model, 0.30);
    modelRef.current = model;
    root.add(model);
    const cleanup = () => {
      root.remove(model);
      disposeObject(model);
      if (modelRef.current === model) modelRef.current = null;
    };
    try {
      const bounds = fitAndCenterModel(root);
      onBoundsChange(boundsToSnapshot(bounds));
      onReady?.();
    } catch (error) {
      cleanup();
      throw error;
    }
    return cleanup;
  }, [scene, onBoundsChange, onReady]);

  useLayoutEffect(() => {
    // Update opacity in place: slider changes must not rebuild/refit the rotating model.
    modelRef.current?.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => { material.opacity = THREE.MathUtils.clamp(bodyOpacity, 0, 1); });
    });
  }, [bodyOpacity, scene, onBoundsChange, onReady]);

  return <group ref={groupRef} />;
}

function CameraRig({ bounds, controlsRef, onFitDistance, platformRef, baseGap, figureScale }) {
  const { camera, size, gl } = useThree();
  const [baseline, setBaseline] = useState(0.84);
  const anchor = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const platform = platformRef.current;
    const measure = () => {
      const frame = canvas.getBoundingClientRect();
      const base = platform?.getBoundingClientRect();
      if (!frame.height || !base?.height) return;
      const fraction = (base.top + base.height / 2 - frame.top - baseGap) / frame.height;
      setBaseline(THREE.MathUtils.clamp(fraction, 0.55, 0.94));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(canvas);
    if (platform) observer?.observe(platform);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      camera.clearViewOffset();
    };
  }, [gl, platformRef, baseGap, camera, size.width, size.height]);

  useLayoutEffect(() => {
    if (!bounds || !controlsRef.current) return;

    const radius = new THREE.Vector3(...bounds.size).length() / 2;
    const aspect = Math.max(size.width, 1) / Math.max(size.height, 1);
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    // Reserve enough room above the measured platform for the full rotating figure.
    const availableHeight = Math.max(0.35, baseline - 0.06);
    const previousFit = Math.max(
      radius * 1.14 / Math.sin(Math.min(vertical, horizontal)),
      bounds.size[1] / (2 * Math.tan(vertical) * availableHeight) + radius,
    );
    // Enlarge from the previous fit, while keeping the top inside the canvas.
    const verticalFloor = bounds.size[1] / (2 * Math.tan(vertical) * Math.max(0.35, baseline - 0.04));
    const horizontalRadius = Math.hypot(bounds.size[0], bounds.size[2]) / 2;
    const horizontalFloor = horizontalRadius * 1.08 / Math.sin(horizontal);
    const distance = Math.max(
      previousFit / THREE.MathUtils.clamp(figureScale, 0.8, 1.6),
      verticalFloor,
      horizontalFloor,
    );
    camera.clearViewOffset();
    camera.position.set(0, 0, distance);
    camera.near = 0.01;
    camera.far = Math.max(50, distance + radius * 4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.minDistance = distance;
    controlsRef.current.maxDistance = distance * 1.38;
    controlsRef.current.update();

    onFitDistance?.(distance);
  }, [bounds, camera, controlsRef, size.width, size.height, onFitDistance, baseline, figureScale]);

  useFrame(() => {
    if (!bounds || !size.width || !size.height) return;
    // Shift the image, not the camera pitch; keep the feet at the base even during zoom.
    camera.clearViewOffset();
    camera.updateMatrixWorld();
    anchor.current.set(bounds.center[0], bounds.min[1], bounds.center[2]).project(camera);
    const feetY = (1 - anchor.current.y) * size.height / 2;
    camera.setViewOffset(size.width, size.height, 0, feetY - baseline * size.height, size.width, size.height);
  });

  return null;
}

function PlatformZoomSync({ fitDistance, controlsRef, onZoomScaleChange }) {
  const { camera } = useThree();

  useFrame(() => {
    if (!fitDistance || !controlsRef.current) return;
    const current = camera.position.distanceTo(controlsRef.current.target);
    if (!current) return;
    const scale = fitDistance / current;
    const clamped = Math.max(0.72, Math.min(1, scale));
    onZoomScaleChange?.(clamped);
  });

  return null;
}

function RotatingFigure({ reducedMotion, children }) {
  const group = useRef();
  useFrame((_, delta) => {
    if (reducedMotion || !group.current) return;
    // Model rotation is independent of OrbitControls interaction state.
    group.current.rotation.y = (group.current.rotation.y + Math.min(delta, 0.1) * 0.12) % (Math.PI * 2);
  });
  return <group ref={group}>{children}</group>;
}

function SceneContent({ reducedMotion, onReady, onBoundsChange, onZoomScaleChange, platformRef, baseGap, bodyOpacity, renderInternals, figureScale }) {
  const [bounds, setBounds] = useState(null);
  const [fitDistance, setFitDistance] = useState(null);
  const controlsRef = useRef();

  const handleBoundsChange = useCallback((snapshot) => {
    setBounds(snapshot);
    onBoundsChange?.(snapshot);
  }, [onBoundsChange]);

  const handleFitDistance = useCallback((distance) => {
    setFitDistance(distance);
    onZoomScaleChange?.(1);
  }, [onZoomScaleChange]);

  return (
    <>
      <hemisphereLight args={['#bce8d1', '#123d28', 0.65]} />
      <directionalLight position={[-3, 1.8, 3]} intensity={2.4} color="#d2ffe4" />
      <directionalLight position={[3, 1, 2]} intensity={0.65} color="#82d6a9" />
      <directionalLight position={[2, 3, -3]} intensity={2.8} color={EMERALD} />
      <directionalLight position={[-2, 1, -2]} intensity={1.8} color="#10b981" />

      <RotatingFigure reducedMotion={reducedMotion}>
        <HumanModel onBoundsChange={handleBoundsChange} onReady={onReady} bodyOpacity={bodyOpacity} />
        {bounds && renderInternals?.({ bounds })}
      </RotatingFigure>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        minPolarAngle={Math.PI / 2}
        maxPolarAngle={Math.PI / 2}
        minAzimuthAngle={-Infinity}
        maxAzimuthAngle={Infinity}
        autoRotate={false}
      />

      <CameraRig bounds={bounds} controlsRef={controlsRef} onFitDistance={handleFitDistance}
        platformRef={platformRef} baseGap={baseGap} figureScale={figureScale} />
      <PlatformZoomSync
        fitDistance={fitDistance}
        controlsRef={controlsRef}
        onZoomScaleChange={onZoomScaleChange}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          intensity={0.22}
          luminanceThreshold={1.15}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

function HumanFigureCanvas({ reducedMotion, onReady, onError, onZoomScaleChange, platformRef, baseGap, bodyOpacity, renderInternals, figureScale, interactive }) {
  return (
    <Canvas
      className="self-figure__canvas"
      style={{ pointerEvents: interactive ? 'auto' : 'none', touchAction: interactive ? 'none' : 'auto' }}
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
            platformRef={platformRef}
            baseGap={baseGap}
            bodyOpacity={bodyOpacity}
            renderInternals={renderInternals}
            figureScale={figureScale}
          />
        </Suspense>
      </CanvasErrorBoundary>
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);

export function SelfHumanFigure({ bodyOpacity = 0.30, baseGap = 4, figureScale = 1.22, renderInternals, showOpacityControl = true } = {}) {
  const [opacity, setOpacity] = useState(() => THREE.MathUtils.clamp(bodyOpacity, 0, 1));
  useEffect(() => { setOpacity(THREE.MathUtils.clamp(bodyOpacity, 0, 1)); }, [bodyOpacity]);
  const reducedMotion = usePrefersReducedMotion();
  const [status, setStatus] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [mountCanvas, setMountCanvas] = useState(false);
  const platformRef = useRef(null);
  const lastZoomRef = useRef(1);

  const handleReady = useCallback(() => {
    setStatus('ready');
  }, []);

  const handleError = useCallback((error) => {
    setErrorMessage(error?.message || 'Figure unavailable');
    setStatus('error');
  }, []);

  useEffect(() => {
    let cancelled = false;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (!cancelled) setMountCanvas(true);
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(first);
      if (second) window.cancelAnimationFrame(second);
    };
  }, []);

  const handleZoomScaleChange = useCallback((scale) => {
    if (Math.abs(scale - lastZoomRef.current) < 0.015) return;
    lastZoomRef.current = scale;
    if (platformRef.current) {
      platformRef.current.style.transform = `translateX(-50%) scale(${scale})`;
    }
  }, []);

  return (
    <div className="self-figure" style={{ position: 'relative' }}>
      <div className="self-figure__ambient self-figure__ambient--emerald" style={{
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(16, 185, 129, 0.10), transparent 68%)',
      }} />
      <div className="self-figure__ambient self-figure__ambient--amber" style={{ display: 'none' }} />

      <div className="self-figure__stage">
        <div className="self-figure__platform" ref={platformRef} style={{ pointerEvents: 'none' }}>
          <div className="self-figure__platform-ring" />
          <div className="self-figure__platform-glow" />
        </div>

        {status === 'error' ? (
          <FigureFallback message={errorMessage} />
        ) : (
          <>
            {status === 'loading' && <FigureLoading />}
            {mountCanvas ? (
              <HumanFigureCanvas
                reducedMotion={reducedMotion}
                onReady={handleReady}
                onError={handleError}
                onZoomScaleChange={handleZoomScaleChange}
                platformRef={platformRef}
                baseGap={baseGap}
                bodyOpacity={opacity}
                renderInternals={renderInternals}
                figureScale={figureScale}
                interactive={status === 'ready'}
              />
            ) : null}
          </>
        )}

        <div className="self-figure__reflection" aria-hidden="true" style={{ pointerEvents: 'none' }} />
        {showOpacityControl && (
          <label className="self-figure__opacity">
            <input
              type="range"
              aria-label="Διαφάνεια σώματος"
              min="0"
              max="100"
              step="1"
              value={Math.round((1 - opacity) * 100)}
              onChange={(event) => setOpacity(1 - Number(event.target.value) / 100)}
              style={{ '--self-opacity-fill': `${Math.round((1 - opacity) * 100)}%` }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
