// Anatomical organs drawn inside the Self figure, and which hub card each one answers to.
// Organ meshes come from the HRA 3D Reference Object Library (Visible Human Male, CC BY 4.0),
// simplified into one file; see public/models/organs/CREDITS.txt.

export const ORGAN_MODEL_URL = '/models/organs/organs.glb';

/** glTF node name in organs.glb → organ style key. */
export const ORGAN_MESHES = {
  brain: 'brain',
  heart: 'heart',
  lungs: 'lungs',
  spinal_cord: 'spine',
  small_intestine: 'smallIntestine',
  large_intestine: 'largeIntestine',
  arteries: 'arteries',
  veins: 'veins',
};

/** Organ look: linear colour, glow multiplier (>1 so Bloom catches it) and opacity. */
export const ORGAN_STYLES = {
  brain: { color: '#f59e0b', glow: 0.42, opacity: 0.6 },
  // Pure red (little blue) so Bloom keeps it red instead of washing out to pink-white.
  heart: { color: '#ff2a3d', glow: 2.8, opacity: 0.95 },
  spine: { color: '#facc15', glow: 1.8, opacity: 0.85 },
  vagus: { color: '#fde047', glow: 1.8, opacity: 0.85 },
  lungs: { color: '#38bdf8', glow: 1.5, opacity: 0.6 },
  smallIntestine: { color: '#fb923c', glow: 0.85, opacity: 0.65 },
  largeIntestine: { color: '#f97316', glow: 0.8, opacity: 0.6 },
  // pulse: how strongly the heartbeat wave lights this organ as it travels out from the heart.
  // Vessels are thin: draw them over the green shell (overShell) so they stay red/blue
  // instead of mixing with it into orange/teal.
  arteries: { color: '#ff1a2e', glow: 1.6, opacity: 0.9, pulse: 2.2, overShell: true },
  veins: { color: '#2f6bff', glow: 0.55, opacity: 0.45, overShell: true },
};

/** Heartbeat wave along the arteries: travel speed and band width in body heights. */
export const PULSE_SPEED_PER_S = 1.4;
export const PULSE_WIDTH = 0.035;

/**
 * Hub card → organs it lights and anchors its leader line to.
 * side: +1 when the card sits left of the figure (line leaves its right edge), -1 otherwise.
 * Sleep and Movement have no organ line on purpose; the brain glows on its own.
 */
export const ORGAN_LINKS = [
  { key: 'heartRate', side: -1, organs: ['heart', 'arteries'], anchor: 'heart', color: '#ff2a3d' },
  { key: 'hrv', side: 1, organs: ['spine', 'vagus'], anchor: 'vagus', color: '#facc15' },
  { key: 'stress', side: -1, organs: ['lungs'], anchor: 'lungs', color: '#38bdf8' },
  { key: 'weight', side: 1, organs: ['smallIntestine', 'largeIntestine'], anchor: 'core', color: '#fb923c' },
];

/**
 * Body circumferences shown beside the figure, each pointing at where it is measured.
 * side: +1 label sits left of the body, -1 right. Anchors come from bounds.anatomy.landmarks.
 */
export const BODY_MEASURES = [
  { key: 'arm', side: 1, anchor: 'arm', color: '#6ee7b7' },
  { key: 'waist', side: -1, anchor: 'waist', color: '#6ee7b7' },
  { key: 'thigh', side: -1, anchor: 'thigh', color: '#6ee7b7' },
];

/** Organs no card points at (e.g. the brain): they keep their own glow and only dim on hover. */
export const UNLINKED_ORGANS = Object.keys(ORGAN_STYLES)
  .filter((name) => !ORGAN_LINKS.some((link) => link.organs.includes(name)));

/** @param {import('../../utils/selfHubSchema').SelfHubMetric|undefined} metric */
export function hasMetricData(metric) {
  return Boolean(metric) && metric.source !== 'none';
}

/** Beats per minute for the heart pulse; the HR card value, else resting, else 60. */
export function heartBpm(metric) {
  const value = Number(metric?.value ?? metric?.resting);
  if (!Number.isFinite(value) || value <= 0) return 60;
  return Math.min(150, Math.max(40, value));
}

export const SCAN_PERIOD_S = 11;

/** Scan line height at time t: eases between 4% and 96% of the body. */
export function scanYAt(t, bounds) {
  const height = bounds.size[1];
  const phase = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / SCAN_PERIOD_S);
  return bounds.min[1] + height * (0.04 + 0.92 * phase);
}

/**
 * Landmarks of the Visible Human Male skin the HRA organs are modelled in (metres, Y up,
 * facing +Z, person's left at +X). Measured once from 3d-vh-m-skin.glb with the same
 * bands SelfHumanFigure uses for our body.
 */
export const VH_SKIN_FRAME = {
  minY: -0.9131,
  height: 1.8243,
  midX: -0.0005,
  chest: { mid: -0.0035, depth: 0.3008 },
};

/** Maps the VH organ frame onto our fitted figure: same height, midline and chest centre. */
export function organModelTransform(bounds) {
  const k = bounds.size[1] / VH_SKIN_FRAME.height;
  const anatomy = bounds.anatomy || {};
  const front = anatomy.front === -1 ? -1 : 1;
  const midX = Number.isFinite(anatomy.midX) ? anatomy.midX : bounds.center[0];
  const chestMid = anatomy.chest?.mid ?? bounds.center[2];
  // Our body is leaner front-to-back than the VH donor; squeeze depth so organs stay inside.
  const depthRatio = anatomy.chest ? anatomy.chest.depth / (VH_SKIN_FRAME.chest.depth * k) : 1;
  const kz = k * Math.min(1.05, Math.max(0.7, depthRatio));
  return {
    scale: [k, k, kz],
    rotationY: front === 1 ? 0 : Math.PI,
    position: [
      midX - front * VH_SKIN_FRAME.midX * k,
      bounds.min[1] - VH_SKIN_FRAME.minY * k,
      chestMid - front * VH_SKIN_FRAME.chest.mid * kz,
    ],
  };
}

/** Vagus nerves (not in the HRA library): brainstem → neck → behind the heart → abdomen, VH metres. */
export const VAGUS_RADIUS_M = 0.0026;
export const VAGUS_POINTS_VH = [1, -1].map((side) => [
  [side * 0.011, 0.748, -0.004],
  [side * 0.022, 0.705, 0.012],
  [side * 0.026, 0.655, 0.018],
  [side * 0.028, 0.6, 0.004],
  [side * 0.024, 0.54, -0.022],
  [side * 0.018, 0.47, -0.03],
  [side * 0.012, 0.4, -0.01],
]);

/**
 * Leader-line anchors in VH metres from the loaded organ boxes (min/max arrays).
 * Paired organs offer both sides; the projector aims at whichever faces the card.
 */
export function buildOrganAnchors(boxes) {
  const lateral = (box, heightFraction, inset) => {
    const y = box.min[1] + (box.max[1] - box.min[1]) * heightFraction;
    const z = (box.min[2] + box.max[2]) / 2;
    return [[box.max[0] - inset, y, z], [box.min[0] + inset, y, z]];
  };
  const union = (a, b) => ({
    min: a.min.map((value, i) => Math.min(value, b.min[i])),
    max: a.max.map((value, i) => Math.max(value, b.max[i])),
  });
  const anchors = {
    vagus: [VAGUS_POINTS_VH[0][1], VAGUS_POINTS_VH[1][1]],
  };
  if (boxes.brain) anchors.brain = lateral(boxes.brain, 0.62, 0.012);
  if (boxes.heart) {
    const { min, max } = boxes.heart;
    anchors.heart = [[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2] - (max[2] - min[2]) * 0.3]];
  }
  if (boxes.lungs) anchors.lungs = lateral(boxes.lungs, 0.58, 0.02);
  if (boxes.smallIntestine && boxes.largeIntestine) {
    anchors.core = lateral(union(boxes.smallIntestine, boxes.largeIntestine), 0.55, 0.03);
  }
  return anchors;
}
