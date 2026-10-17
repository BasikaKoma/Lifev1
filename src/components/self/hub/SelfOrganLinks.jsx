import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BODY_MEASURES, ORGAN_LINKS, hasMetricData } from '../selfOrganSpec';

const REMEASURE_EVERY_S = 1;
const WRITE_EPSILON_PX = 0.3;
const ANCHOR_SWITCH_PX = 4;
// Gap between the body's outer edge (arms included) and a measurement label, in scene units.
const MEASURE_LABEL_GAP = 0.05;

/**
 * Mutable state shared by the hub (DOM) and the canvas (R3F) so leader lines and
 * measurement labels can follow the rotating body every frame without React re-renders.
 */
export function createOrganLinkRuntime() {
  return {
    stage: null,
    svg: null,
    elements: {},
    measures: {},
    anchors: {},
    cards: {},
    links: {},
    canvasBox: { x: 0, y: 0, w: 0, h: 0 },
    stageWidth: 0,
    needsMeasure: true,
    lastMeasureAt: -Infinity,
    hoverKey: null,
    has: {},
    bpm: 60,
    ready: false,
  };
}

export function setOrganHover(runtime, key) {
  if (runtime.hoverKey === key) return;
  runtime.hoverKey = key;
  runtime.svg?.classList.toggle('has-active', Boolean(key));
  Object.entries(runtime.elements).forEach(([linkKey, element]) => {
    element.g.classList.toggle('is-active', linkKey === key);
  });
  Object.entries(runtime.measures).forEach(([measureKey, element]) => {
    element.g?.classList.toggle('is-active', measureKey === key);
  });
}

/** Card props that tag a metric card for measuring and light its organ on hover/focus/tap. */
export function useOrganCardProps(runtime) {
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useMemo(() => {
    const cache = {};
    const activate = (key) => {
      window.clearTimeout(timer.current);
      setOrganHover(runtime, key);
    };
    const release = (key, delay) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (runtime.hoverKey === key) setOrganHover(runtime, null);
      }, delay);
    };
    return (key) => {
      if (!cache[key]) {
        cache[key] = {
          'data-organ-key': key,
          onPointerEnter: () => activate(key),
          // Touch fires leave on lift; keep the highlight long enough to be seen.
          onPointerLeave: (event) => release(key, event.pointerType === 'touch' ? 1200 : 0),
          onFocus: () => activate(key),
          onBlur: () => release(key, 0),
        };
      }
      return cache[key];
    };
  }, [runtime]);
}

function measure(runtime, canvas) {
  const { stage } = runtime;
  if (!stage || !canvas) return;
  // Read every rect first, then write, so measuring never thrashes layout.
  const stageRect = stage.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const cardRects = ORGAN_LINKS.map((link) => (
    stage.querySelector(`[data-organ-key="${link.key}"]`)?.getBoundingClientRect() ?? null
  ));
  const labelSizes = BODY_MEASURES.map((item) => {
    const label = runtime.measures[item.key]?.label;
    return label ? [label.offsetWidth, label.offsetHeight] : null;
  });

  runtime.stageWidth = stageRect.width;
  runtime.canvasBox.x = canvasRect.left - stageRect.left;
  runtime.canvasBox.y = canvasRect.top - stageRect.top;
  runtime.canvasBox.w = canvasRect.width;
  runtime.canvasBox.h = canvasRect.height;

  ORGAN_LINKS.forEach((link, index) => {
    const rect = cardRects[index];
    const card = runtime.cards[link.key] || (runtime.cards[link.key] = { x: 0, y: 0, visible: false });
    card.visible = Boolean(rect && rect.width > 0 && rect.height > 0);
    if (!card.visible) return;
    const edge = link.side > 0 ? rect.right : rect.left;
    card.x = edge - stageRect.left + link.side * 3;
    card.y = rect.top - stageRect.top + rect.height / 2;
  });

  BODY_MEASURES.forEach((item, index) => {
    const element = runtime.measures[item.key];
    if (!element || !labelSizes[index]) return;
    [element.width, element.height] = labelSizes[index];
  });
}

function writeLine(line, x1, y1, x2, y2) {
  line.x1.baseVal.value = x1;
  line.y1.baseVal.value = y1;
  line.x2.baseVal.value = x2;
  line.y2.baseVal.value = y2;
}

function writePoint(circle, x, y) {
  circle.cx.baseVal.value = x;
  circle.cy.baseVal.value = y;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Compare/copy the first five slots (positions); slot 5 holds the opacity.
function changed(last, values) {
  for (let i = 0; i < 5; i += 1) {
    if (Math.abs(last[i] - values[i]) > WRITE_EPSILON_PX) return true;
  }
  return false;
}

function remember(last, values) {
  for (let i = 0; i < 5; i += 1) last[i] = values[i];
}

/**
 * Projects organ and body anchors to the hub stage, redraws the leader lines and places
 * the measurement labels beside the body.
 * Priority 2 runs after CameraRig's view offset (0) and the EffectComposer render (1),
 * so camera and world matrices are final for this frame. The composer already owns
 * rendering; if it is ever removed, move this to addAfterEffect so the canvas keeps drawing.
 */
export function OrganLinkProjector({ links, bounds }) {
  const size = useThree((state) => state.size);
  const scratch = useMemo(() => ({
    point: new THREE.Vector3(),
    view: new THREE.Vector3(),
    values: new Float32Array(6),
  }), []);

  useEffect(() => {
    links.needsMeasure = true;
  }, [links, size.width, size.height]);

  useEffect(() => () => {
    links.ready = false;
    links.svg?.classList.remove('is-ready');
    // Without the projector the labels would sit at stale positions; hide them.
    Object.values(links.measures).forEach((element) => {
      if (element.label) element.label.style.visibility = 'hidden';
    });
  }, [links]);

  useFrame((state) => {
    const { camera, gl, clock } = state;
    if (!links.svg || !links.stage) return;
    const now = clock.elapsedTime;
    if (links.needsMeasure || now - links.lastMeasureAt > REMEASURE_EVERY_S) {
      measure(links, gl.domElement);
      links.needsMeasure = false;
      links.lastMeasureAt = now;
    }
    const box = links.canvasBox;
    if (box.w <= 0 || box.h <= 0) return;

    const { point, view, values } = scratch;
    const toStage = (st, index) => {
      view.copy(point).applyMatrix4(camera.matrixWorldInverse);
      point.project(camera);
      st.sx[index] = box.x + (point.x * 0.5 + 0.5) * box.w;
      st.sy[index] = box.y + (0.5 - point.y * 0.5) * box.h;
      st.sz[index] = view.z;
    };
    const newState = () => ({
      visible: null, anchorIndex: 0, last: new Float32Array(6).fill(-1e6),
      sx: new Float32Array(2), sy: new Float32Array(2), sz: new Float32Array(2),
    });
    // Bilateral anchors: aim at the side facing the card/label, with hysteresis at 90°.
    const pickAnchor = (st, anchors, side) => {
      const count = Math.min(anchors.length, 2);
      for (let i = 0; i < count; i += 1) {
        point.setFromMatrixPosition(anchors[i].matrixWorld);
        toStage(st, i);
      }
      if (st.anchorIndex >= count) st.anchorIndex = 0;
      for (let i = 0; i < count; i += 1) {
        if (-side * (st.sx[i] - st.sx[st.anchorIndex]) > ANCHOR_SWITCH_PX) st.anchorIndex = i;
      }
      return st.anchorIndex;
    };

    view.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
    const centerZ = view.z;
    const depthScale = bounds.size[1] * 0.07;
    const backFade = (z) => 0.4 + 0.6 * smoothstep(-0.7, 0.3, (z - centerZ) / depthScale);
    const setVisible = (st, g, visible) => {
      if (visible === st.visible) return;
      g.style.display = visible ? '' : 'none';
      st.visible = visible;
    };

    ORGAN_LINKS.forEach((link) => {
      const element = links.elements[link.key];
      if (!element) return;
      const st = links.links[link.key] || (links.links[link.key] = newState());
      const card = links.cards[link.key];
      const anchors = links.anchors[link.anchor];
      const visible = Boolean(card?.visible && anchors?.length);
      setVisible(st, element.g, visible);
      if (!visible) return;

      const index = pickAnchor(st, anchors, link.side);
      const sx = st.sx[index];
      const sy = st.sy[index];
      const ax = card.x;
      const ay = card.y;
      const reach = link.side * (sx - ax);
      const bx = ax + (reach > 0 ? link.side * Math.min(26, reach * 0.35) : 0);

      values[0] = ax; values[1] = ay; values[2] = bx; values[3] = sx; values[4] = sy;
      if (changed(st.last, values)) {
        writeLine(element.stub, ax, ay, bx, ay);
        writeLine(element.ray, bx, ay, sx, sy);
        writePoint(element.start, ax, ay);
        writePoint(element.halo, sx, sy);
        writePoint(element.dot, sx, sy);
        remember(st.last, values);
      }
      const opacity = backFade(st.sz[index]);
      if (Math.abs(st.last[5] - opacity) > 0.02) {
        element.g.style.opacity = opacity.toFixed(2);
        st.last[5] = opacity;
      }
    });

    // Measurement labels sit in a column just outside the body (arms included), at the
    // height of the spot they measure, so they hug the figure like the reference reel.
    point.set(0, bounds.min[1], 0).project(camera);
    const feetY = box.y + (0.5 - point.y * 0.5) * box.h;
    const centerX = box.x + (point.x * 0.5 + 0.5) * box.w;
    point.set(0, bounds.max[1], 0).project(camera);
    const headY = box.y + (0.5 - point.y * 0.5) * box.h;
    const pxPerUnit = Math.abs(feetY - headY) / bounds.size[1];
    const column = (bounds.size[0] / 2 + MEASURE_LABEL_GAP) * pxPerUnit;

    BODY_MEASURES.forEach((item) => {
      const element = links.measures[item.key];
      if (!element?.g || !element.label) return;
      const st = element.state || (element.state = newState());
      const anchors = links.anchors[item.anchor];
      const visible = Boolean(anchors?.length && element.width);
      setVisible(st, element.g, visible);
      if (!visible) {
        element.label.style.visibility = 'hidden';
        return;
      }

      const index = pickAnchor(st, anchors, item.side);
      const sx = st.sx[index];
      const sy = st.sy[index];
      const width = element.width;
      const height = element.height;
      const edgeX = centerX - item.side * column;
      const maxLeft = Math.max(4, links.stageWidth - width - 4);
      const left = Math.min(maxLeft, Math.max(4, item.side > 0 ? edgeX - width : edgeX));
      const top = sy - height / 2;
      const lineStart = item.side > 0 ? left + width + 4 : left - 4;

      values[0] = left; values[1] = top; values[2] = lineStart; values[3] = sx; values[4] = sy;
      if (changed(st.last, values)) {
        element.label.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
        writeLine(element.line, lineStart, sy, sx, sy);
        writePoint(element.dot, sx, sy);
        remember(st.last, values);
      }
      if (element.label.style.visibility !== 'visible') element.label.style.visibility = 'visible';
      const opacity = backFade(st.sz[index]);
      if (Math.abs(st.last[5] - opacity) > 0.02) {
        element.g.style.opacity = opacity.toFixed(2);
        st.last[5] = opacity;
      }
    });

    if (!links.ready) {
      links.ready = true;
      links.svg.classList.add('is-ready');
    }
  }, 2);

  return null;
}

/** SVG layer between the figure and the metric cards: organ leader lines and measurement ticks. */
export function SelfOrganLinks({ runtime, metrics }) {
  const svgRef = useMemo(() => (node) => {
    runtime.svg = node;
    runtime.stage = node?.parentElement ?? null;
    runtime.needsMeasure = true;
    if (node && runtime.hoverKey) node.classList.add('has-active');
  }, [runtime]);

  const groupRefs = useMemo(() => Object.fromEntries(ORGAN_LINKS.map((link) => [link.key, (node) => {
    if (!node) {
      delete runtime.elements[link.key];
      delete runtime.links[link.key];
      return;
    }
    runtime.elements[link.key] = {
      g: node,
      stub: node.querySelector('.self-organ-link__stub'),
      ray: node.querySelector('.self-organ-link__ray'),
      start: node.querySelector('.self-organ-link__start'),
      halo: node.querySelector('.self-organ-link__halo'),
      dot: node.querySelector('.self-organ-link__dot'),
    };
    delete runtime.links[link.key];
  }])), [runtime]);

  const measureRefs = useMemo(() => Object.fromEntries(BODY_MEASURES.map((item) => [item.key, (node) => {
    const element = runtime.measures[item.key] || (runtime.measures[item.key] = {});
    element.g = node;
    element.line = node?.querySelector('.self-organ-link__ray') ?? null;
    element.dot = node?.querySelector('.self-organ-link__dot') ?? null;
    element.state = null;
  }])), [runtime]);

  useEffect(() => {
    const { stage } = runtime;
    if (!stage) return undefined;
    const remeasure = () => { runtime.needsMeasure = true; };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    observer?.observe(stage);
    stage.querySelectorAll('[data-organ-key], [data-measure-key]').forEach((node) => observer?.observe(node));
    window.addEventListener('resize', remeasure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, [runtime]);

  return (
    <svg ref={svgRef} className="self-hub__links" aria-hidden="true" focusable="false">
      {ORGAN_LINKS.map((link) => (
        <g
          key={link.key}
          ref={groupRefs[link.key]}
          className="self-organ-link"
          data-empty={hasMetricData(metrics?.[link.key]) ? undefined : ''}
          style={{ '--organ-color': link.color }}
        >
          <line className="self-organ-link__stub" />
          <line className="self-organ-link__ray" />
          <circle className="self-organ-link__start" r="2" />
          <circle className="self-organ-link__halo" r="7" />
          <circle className="self-organ-link__dot" r="2.6" />
        </g>
      ))}
      {BODY_MEASURES.map((item) => (
        <g
          key={item.key}
          ref={measureRefs[item.key]}
          className="self-organ-link self-organ-link--measure"
          style={{ '--organ-color': item.color }}
        >
          <line className="self-organ-link__ray" />
          <circle className="self-organ-link__dot" r="2.2" />
        </g>
      ))}
    </svg>
  );
}
