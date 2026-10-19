// A dense, glowing vascular network grown inside the Self figure (space colonization).
// It starts from the anatomical central vessels and grows toward points just under the skin,
// so it reaches the hands and feet and follows whatever pose the body model has.
import * as THREE from 'three';

/** Small deterministic PRNG (mulberry32): the same network on every load. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Attractor points pushed a random depth under the skin along the inward normal. */
export function attractorsUnderSkin(surface, { minDepth, maxDepth, seed }) {
  const random = createRandom(seed);
  const count = surface.positions.length / 3;
  const points = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const depth = minDepth + (maxDepth - minDepth) * random();
    for (let c = 0; c < 3; c += 1) {
      points[i * 3 + c] = surface.positions[i * 3 + c] - surface.normals[i * 3 + c] * depth;
    }
  }
  return points;
}

/**
 * "Is this point inside the body?" from the surface sample: the nearest surface point's
 * outward normal must face away from the point. Points with no surface point within
 * `radius` are deep inside (growth moves in small steps, so it can only get there from inside).
 */
export function createInsideTest(surface, radius, margin = 0) {
  const { positions, normals } = surface;
  const grid = new Map();
  const key = (ix, iy, iz) => `${ix},${iy},${iz}`;
  for (let i = 0; i < positions.length / 3; i += 1) {
    const k = key(Math.floor(positions[i * 3] / radius), Math.floor(positions[i * 3 + 1] / radius), Math.floor(positions[i * 3 + 2] / radius));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return (x, y, z) => {
    const ix = Math.floor(x / radius);
    const iy = Math.floor(y / radius);
    const iz = Math.floor(z / radius);
    let best = -1;
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const cell = grid.get(key(ix + dx, iy + dy, iz + dz));
          if (!cell) continue;
          for (const i of cell) {
            const ox = x - positions[i * 3];
            const oy = y - positions[i * 3 + 1];
            const oz = z - positions[i * 3 + 2];
            const d = ox * ox + oy * oy + oz * oz;
            if (d < bestDistance) {
              bestDistance = d;
              best = i;
            }
          }
        }
      }
    }
    if (best < 0) return true;
    const facing = (x - positions[best * 3]) * normals[best * 3]
      + (y - positions[best * 3 + 1]) * normals[best * 3 + 1]
      + (z - positions[best * 3 + 2]) * normals[best * 3 + 2];
    return facing < -margin;
  };
}

/**
 * Grows the network. Incremental space colonization: each attractor remembers its closest
 * node, and only new nodes are checked against nearby attractors (uniform grid), so a few
 * thousand attractors grow in well under a frame budget's worth of work per step.
 * Returns segment endpoints and a 0..1 "level" per endpoint (1 = trunk, 0 = finest twig).
 */
export function growNetwork({ seeds, attractors, step, influence, kill, maxNodes, maxSteps, jitter, seed, inside }) {
  const random = createRandom(seed);
  const attractorCount = attractors.length / 3;
  const alive = new Uint8Array(attractorCount).fill(1);
  const closest = new Int32Array(attractorCount).fill(-1);
  const closestDistance = new Float32Array(attractorCount).fill(Infinity);

  // Attractor grid: cell size = influence, so a node only scans its 27 neighbouring cells.
  const cellKey = (x, y, z) => {
    const ix = Math.floor(x / influence);
    const iy = Math.floor(y / influence);
    const iz = Math.floor(z / influence);
    return `${ix},${iy},${iz}`;
  };
  const grid = new Map();
  for (let a = 0; a < attractorCount; a += 1) {
    const key = cellKey(attractors[a * 3], attractors[a * 3 + 1], attractors[a * 3 + 2]);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(a);
  }

  const positions = new Float32Array(maxNodes * 3);
  const parents = new Int32Array(maxNodes).fill(-1);
  let nodeCount = 0;
  const killSq = kill * kill;
  const influenceSq = influence * influence;

  const addNode = (x, y, z, parent) => {
    if (nodeCount >= maxNodes) return -1;
    const index = nodeCount;
    nodeCount += 1;
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    parents[index] = parent;
    const ix = Math.floor(x / influence);
    const iy = Math.floor(y / influence);
    const iz = Math.floor(z / influence);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const cell = grid.get(`${ix + dx},${iy + dy},${iz + dz}`);
          if (!cell) continue;
          for (const a of cell) {
            if (!alive[a]) continue;
            const ax = attractors[a * 3] - x;
            const ay = attractors[a * 3 + 1] - y;
            const az = attractors[a * 3 + 2] - z;
            const d = ax * ax + ay * ay + az * az;
            if (d < killSq) {
              alive[a] = 0;
            } else if (d < influenceSq && d < closestDistance[a]) {
              closestDistance[a] = d;
              closest[a] = index;
            }
          }
        }
      }
    }
    return index;
  };

  for (let i = 0; i < seeds.length; i += 3) addNode(seeds[i], seeds[i + 1], seeds[i + 2], -1);

  const pull = new Float32Array(maxNodes * 3);
  const pulled = new Uint16Array(maxNodes);
  // Nodes whose growth keeps leaving the body (e.g. toward a hand across the gap by the hip)
  // stop growing; the arm's own branches take those attractors over as they arrive.
  const rejected = new Uint8Array(maxNodes);
  const touched = [];
  for (let iteration = 0; iteration < maxSteps && nodeCount < maxNodes; iteration += 1) {
    touched.length = 0;
    for (let a = 0; a < attractorCount; a += 1) {
      const node = closest[a];
      if (!alive[a] || node < 0) continue;
      const dx = attractors[a * 3] - positions[node * 3];
      const dy = attractors[a * 3 + 1] - positions[node * 3 + 1];
      const dz = attractors[a * 3 + 2] - positions[node * 3 + 2];
      const length = Math.hypot(dx, dy, dz) || 1;
      if (!pulled[node]) touched.push(node);
      pull[node * 3] += dx / length;
      pull[node * 3 + 1] += dy / length;
      pull[node * 3 + 2] += dz / length;
      pulled[node] += 1;
    }
    if (!touched.length) break;
    for (const node of touched) {
      if (rejected[node] >= 3) {
        pull[node * 3] = 0;
        pull[node * 3 + 1] = 0;
        pull[node * 3 + 2] = 0;
        pulled[node] = 0;
        continue;
      }
      let dx = pull[node * 3] / pulled[node] + (random() - 0.5) * jitter;
      let dy = pull[node * 3 + 1] / pulled[node] + (random() - 0.5) * jitter;
      let dz = pull[node * 3 + 2] / pulled[node] + (random() - 0.5) * jitter;
      const length = Math.hypot(dx, dy, dz);
      pull[node * 3] = 0;
      pull[node * 3 + 1] = 0;
      pull[node * 3 + 2] = 0;
      pulled[node] = 0;
      if (length < 1e-4) continue;
      dx /= length;
      dy /= length;
      dz /= length;
      const nx = positions[node * 3] + dx * step;
      const ny = positions[node * 3 + 1] + dy * step;
      const nz = positions[node * 3 + 2] + dz * step;
      if (inside && !inside(nx, ny, nz)) {
        rejected[node] += 1;
        continue;
      }
      addNode(nx, ny, nz, node);
    }
  }

  // Subtree size → level: trunks bright, fine twigs faint.
  const size = new Float32Array(nodeCount).fill(1);
  for (let i = nodeCount - 1; i >= 0; i -= 1) if (parents[i] >= 0) size[parents[i]] += size[i];
  const maxLog = Math.log(1 + Math.max(...size.subarray(0, nodeCount).filter((_, i) => parents[i] >= 0), 1));

  let segments = 0;
  for (let i = 0; i < nodeCount; i += 1) if (parents[i] >= 0) segments += 1;
  const linePositions = new Float32Array(segments * 6);
  const levels = new Float32Array(segments * 2);
  let s = 0;
  for (let i = 0; i < nodeCount; i += 1) {
    const parent = parents[i];
    if (parent < 0) continue;
    linePositions.set(positions.subarray(parent * 3, parent * 3 + 3), s * 6);
    linePositions.set(positions.subarray(i * 3, i * 3 + 3), s * 6 + 3);
    const level = Math.log(1 + size[i]) / maxLog;
    levels[s * 2] = Math.min(1, Math.log(1 + size[parent]) / maxLog);
    levels[s * 2 + 1] = Math.min(1, level);
    s += 1;
  }
  return { positions: linePositions, levels, nodeCount };
}

/** Every Nth vertex of a mesh, through its world matrix (call updateMatrixWorld first). */
export function meshSeedPoints(mesh, every) {
  if (!mesh) return new Float32Array(0);
  const toRoot = mesh.matrixWorld;
  const position = mesh.geometry.attributes.position;
  const count = Math.ceil(position.count / every);
  const seeds = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let k = 0, i = 0; i < position.count; i += every, k += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(toRoot);
    seeds.set([v.x, v.y, v.z], k * 3);
  }
  return seeds;
}

export function networkGeometry({ positions, levels }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aLevel', new THREE.BufferAttribute(levels, 1));
  return geometry;
}
