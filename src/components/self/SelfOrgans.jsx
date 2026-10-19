import { Suspense, useEffect, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
  ORGAN_LINKS,
  ORGAN_MESHES,
  ORGAN_MODEL_URL,
  ORGAN_STYLES,
  PULSE_SPEED_PER_S,
  PULSE_WIDTH,
  UNLINKED_ORGANS,
  VAGUS_POINTS_VH,
  VAGUS_RADIUS_M,
  buildOrganAnchors,
  organModelTransform,
} from './selfOrganSpec';
import { attractorsUnderSkin, createInsideTest, growNetwork, meshSeedPoints, networkGeometry } from './selfVascularNet';

const ORGAN_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vWorldPosition = worldPosition.xyz;
    // Normalised per fragment: a zero normal here would turn into NaN, which Bloom smears across the frame.
    vNormalView = normalMatrix * normal;
    vViewDir = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const ORGAN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3 uPulseOrigin;
  uniform float uPulseRadius;
  uniform float uPulseWidth;
  uniform float uPulseGain;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPosition;
  void main() {
    // X-ray look: silhouettes glow, faces toward the camera stay translucent.
    float normalLength = length(vNormalView);
    float viewLength = length(vViewDir);
    float facing = normalLength > 1e-6 && viewLength > 1e-6
      ? abs(dot(vNormalView / normalLength, vViewDir / viewLength))
      : 1.0;
    float rim = pow(clamp(1.0 - facing, 0.0, 1.0), 1.8);
    float body = 0.32 + 0.68 * rim;
    // Heartbeat wave: a bright shell expanding from the heart (only organs with uPulseGain > 0).
    float p = (distance(vWorldPosition, uPulseOrigin) - uPulseRadius) / uPulseWidth;
    float pulse = 1.0 + uPulseGain * exp(-p * p);
    gl_FragColor = vec4(uColor * uIntensity * body * pulse, uOpacity);
  }
`;

const NETWORK_VERTEX = /* glsl */ `
  attribute float aLevel;
  varying float vLevel;
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vLevel = aLevel;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const NETWORK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uOpacity;
  uniform vec3 uPulseOrigin;
  uniform float uPulseRadius;
  uniform float uPulseWidth;
  uniform float uPulseGain;
  varying float vLevel;
  varying vec3 vWorldPosition;
  void main() {
    // Trunks read bright, the finest twigs fade into a haze.
    float weight = 0.22 + 0.78 * vLevel;
    float p = (distance(vWorldPosition, uPulseOrigin) - uPulseRadius) / uPulseWidth;
    float pulse = 1.0 + uPulseGain * exp(-p * p);
    gl_FragColor = vec4(uColor * uIntensity * weight * pulse, uOpacity * (0.35 + 0.65 * vLevel));
  }
`;

/** Glowing lines for the grown vascular networks; same uniforms as the organs. */
function createNetworkMaterial(style, sharedUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(style.color) },
      uIntensity: { value: style.glow },
      uOpacity: { value: style.opacity },
      uPulseGain: { value: 0 },
      ...sharedUniforms,
    },
    vertexShader: NETWORK_VERTEX,
    fragmentShader: NETWORK_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/** One shader source for every organ, so three.js compiles a single program. */
function createOrganMaterial(style, sharedUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(style.color) },
      uIntensity: { value: style.glow },
      uOpacity: { value: style.opacity },
      uPulseGain: { value: 0 },
      ...sharedUniforms,
    },
    vertexShader: ORGAN_VERTEX,
    fragmentShader: ORGAN_FRAGMENT,
    transparent: true,
    // Additive keeps overlapping organs order-independent; the shell (renderOrder 10) draws over them.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function tubeGeometry(points, radius, segments) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

/** Dequantised Float32 copy, so baking node transforms keeps full precision. */
function toFloatAttribute(attribute) {
  const array = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i += 1) {
    for (let c = 0; c < attribute.itemSize; c += 1) {
      array[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    }
  }
  return new THREE.BufferAttribute(array, attribute.itemSize);
}

/**
 * Owned, centred geometry per organ in VH metres. The GLB is meshopt-quantised, so each
 * node carries a dequantising transform that we bake in before centring (pulse and
 * breathing then scale around the organ itself).
 */
function extractOrganGeometries(scene) {
  scene.updateMatrixWorld(true);
  const parts = {};
  scene.traverse((child) => {
    const key = child.isMesh ? ORGAN_MESHES[child.name] : null;
    if (!key) return;
    const source = child.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', toFloatAttribute(source.attributes.position));
    if (source.index) geometry.setIndex(source.index.clone());
    geometry.applyMatrix4(child.matrixWorld);
    // Simplification leaves some zero-length quantised normals; rebuild smooth ones from the faces.
    geometry.computeVertexNormals();
    inflateGeometry(geometry, ORGAN_STYLES[key]?.inflate);
    geometry.computeBoundingBox();
    // Copy the box before centring: translate() recomputes it in place.
    const box = { min: geometry.boundingBox.min.toArray(), max: geometry.boundingBox.max.toArray() };
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    parts[key] = { geometry, center, box };
  });
  return parts;
}

/** Thin vessels are 1–2 px at hub size; push their surface out along the normals so they read. */
function inflateGeometry(geometry, amount) {
  if (!amount) return;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setXYZ(
      i,
      positions.getX(i) + normals.getX(i) * amount,
      positions.getY(i) + normals.getY(i) * amount,
      positions.getZ(i) + normals.getZ(i) * amount,
    );
  }
  geometry.computeVertexNormals();
}

/**
 * Artery and vein networks grown from the central vessels toward points just under the skin
 * (see selfVascularNet). They live in the figure's frame, so they are built after the organ
 * group's transform is known, and they share the pulse/scan uniforms with the organs.
 */
function buildVascularNetworks(group, meshes, bounds, materials, geometries) {
  const networks = new THREE.Group();
  const surface = bounds.anatomy?.surface;
  if (!surface) return networks;
  group.updateMatrixWorld(true);
  const unit = bounds.size[1] / 1.78;
  // Keeps every branch under the skin: no shortcuts across the gaps by the hips and thighs.
  const inside = createInsideTest(surface, 0.06 * unit, 0.002 * unit);
  [
    { key: 'arteryNet', seeds: meshes.arteries, every: 40, depth: [0.01, 0.034], seed: 11 },
    { key: 'veinNet', seeds: meshes.veins, every: 40, depth: [0.005, 0.02], seed: 29 },
  ].forEach(({ key, seeds, every, depth, seed }) => {
    if (!materials[key] || !seeds) return;
    const network = growNetwork({
      seeds: meshSeedPoints(seeds, every),
      attractors: attractorsUnderSkin(surface, { minDepth: depth[0] * unit, maxDepth: depth[1] * unit, seed }),
      step: 0.0095 * unit,
      influence: 0.14 * unit,
      kill: 0.014 * unit,
      maxNodes: 15000,
      maxSteps: 320,
      jitter: 0.35,
      seed,
      inside,
    });
    const geometry = networkGeometry(network);
    const lines = new THREE.LineSegments(geometry, materials[key]);
    lines.renderOrder = 11;
    lines.frustumCulled = false;
    geometries.push(geometry);
    networks.add(lines);
  });
  return networks;
}

function buildOrgans(scene, transform, frameUniforms, bounds) {
  const group = new THREE.Group();
  group.position.set(...transform.position);
  group.rotation.y = transform.rotationY;
  group.scale.set(...transform.scale);
  const geometries = [];
  const materials = {};
  Object.entries(ORGAN_STYLES).forEach(([name, style]) => {
    materials[name] = style.network
      ? createNetworkMaterial(style, frameUniforms)
      : createOrganMaterial(style, frameUniforms);
  });

  const add = (geometry, material, position, overShell = false) => {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.copy(position);
    // Below the transparent shell (renderOrder 10) so the body composites over the organs;
    // thin vessels go after it so the shell does not tint them.
    mesh.renderOrder = overShell ? 11 : 5;
    mesh.frustumCulled = false;
    geometries.push(geometry);
    group.add(mesh);
    return mesh;
  };

  const meshes = {};
  const boxes = {};
  Object.entries(extractOrganGeometries(scene)).forEach(([key, part]) => {
    meshes[key] = add(part.geometry, materials[key], part.center, Boolean(ORGAN_STYLES[key]?.overShell));
    boxes[key] = part.box;
  });
  VAGUS_POINTS_VH.forEach((points) => add(tubeGeometry(points, VAGUS_RADIUS_M, 56), materials.vagus));

  const anchors = {};
  Object.entries(buildOrganAnchors(boxes)).forEach(([name, points]) => {
    anchors[name] = points.map((point) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(...point);
      group.add(anchor);
      return anchor;
    });
  });

  const limbGroup = buildVascularNetworks(group, meshes, bounds, materials, geometries);

  return { group, limbGroup, geometries, materials, anchors, heart: meshes.heart, lungs: meshes.lungs };
}

/** Adds named anchors to the shared link runtime; returns the cleanup that removes exactly these. */
function registerAnchors(links, anchors) {
  Object.assign(links.anchors, anchors);
  return () => {
    Object.entries(anchors).forEach(([name, list]) => {
      if (links.anchors[name] === list) delete links.anchors[name];
    });
  };
}

function OrganModels({ bounds, links, reducedMotion }) {
  const { scene } = useGLTF(ORGAN_MODEL_URL);
  const transform = useMemo(() => organModelTransform(bounds), [bounds]);
  // Shared by every organ material: the heartbeat wave front.
  const frameUniforms = useMemo(() => ({
    uPulseOrigin: { value: new THREE.Vector3() },
    uPulseRadius: { value: 1e3 },
    uPulseWidth: { value: PULSE_WIDTH * bounds.size[1] },
  }), [bounds]);
  const organs = useMemo(
    () => buildOrgans(scene, transform, frameUniforms, bounds),
    [scene, transform, frameUniforms, bounds],
  );

  useLayoutEffect(() => registerAnchors(links, organs.anchors), [links, organs]);

  useEffect(() => () => {
    organs.geometries.forEach((geometry) => geometry.dispose());
    Object.values(organs.materials).forEach((material) => material.dispose());
  }, [organs]);

  useEffect(() => {
    Object.entries(organs.materials).forEach(([name, material]) => {
      material.uniforms.uPulseGain.value = reducedMotion ? 0 : ORGAN_STYLES[name].pulse || 0;
    });
    if (reducedMotion) {
      frameUniforms.uPulseRadius.value = 1e3;
      organs.heart?.scale.setScalar(1);
      organs.lungs?.scale.setScalar(1);
    }
  }, [reducedMotion, frameUniforms, organs, bounds]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    let beat = 0;
    if (!reducedMotion) {
      // Lub-dub at the HR card's rate.
      const phase = (t * links.bpm / 60) % 1;
      beat = Math.exp(-(((phase - 0.08) / 0.05) ** 2)) + 0.55 * Math.exp(-(((phase - 0.28) / 0.05) ** 2));
      organs.heart?.scale.setScalar(1 + 0.05 * beat);
      // Each "lub" sends a wave out from the heart along the arteries.
      if (organs.heart) {
        const sinceBeat = (((phase - 0.08) % 1) + 1) % 1 * (60 / links.bpm);
        frameUniforms.uPulseOrigin.value.setFromMatrixPosition(organs.heart.matrixWorld);
        frameUniforms.uPulseRadius.value = sinceBeat * PULSE_SPEED_PER_S * bounds.size[1];
      }
      const breath = Math.sin((2 * Math.PI * t) / 4.6);
      organs.lungs?.scale.set(1 + 0.03 * breath, 1 + 0.015 * breath, 1 + 0.03 * breath);
    }

    const ease = 1 - Math.exp(-8 * Math.min(delta, 0.1));
    const hoverKey = links.hoverKey;
    ORGAN_LINKS.forEach((link) => {
      const hasData = links.has[link.key] !== false;
      const focus = hoverKey ? (hoverKey === link.key ? 1.6 : 0.55) : 1;
      link.organs.forEach((name) => {
        const uniform = organs.materials[name].uniforms.uIntensity;
        const pulse = name === 'heart' ? 0.35 * beat : 0;
        const target = ORGAN_STYLES[name].glow * (hasData ? 1 : 0.28) * focus + pulse;
        uniform.value += (target - uniform.value) * ease;
      });
    });
    UNLINKED_ORGANS.forEach((name) => {
      const uniform = organs.materials[name].uniforms.uIntensity;
      const target = ORGAN_STYLES[name].glow * (hoverKey ? 0.55 : 1);
      uniform.value += (target - uniform.value) * ease;
    });
  });

  return (
    <>
      <primitive object={organs.group} />
      <primitive object={organs.limbGroup} />
    </>
  );
}

useGLTF.preload(ORGAN_MODEL_URL);

/**
 * Anatomical organs placed inside the Self figure. Rendered through SelfHumanFigure's
 * renderInternals, so they rotate with the body. Reads hover/data state from the
 * shared organ-link runtime every frame instead of re-rendering React. Its own
 * Suspense keeps the organ download from suspending (and refitting) the body.
 */
export function SelfOrgans(props) {
  return (
    <Suspense fallback={null}>
      <OrganModels {...props} />
    </Suspense>
  );
}

/**
 * Invisible anchors on the body surface where each circumference is measured (upper arm,
 * waist, thigh). Rendered inside the rotating group so labels' lines follow the body.
 */
export function SelfBodyMeasureAnchors({ bounds, links }) {
  const { group, anchors } = useMemo(() => {
    const root = new THREE.Group();
    const byName = {};
    Object.entries(bounds.anatomy?.landmarks || {}).forEach(([name, points]) => {
      if (!points?.length) return;
      byName[name] = points.map((point) => {
        const anchor = new THREE.Object3D();
        anchor.position.set(...point);
        root.add(anchor);
        return anchor;
      });
    });
    return { group: root, anchors: byName };
  }, [bounds]);

  useLayoutEffect(() => registerAnchors(links, anchors), [links, anchors]);

  return <primitive object={group} />;
}
