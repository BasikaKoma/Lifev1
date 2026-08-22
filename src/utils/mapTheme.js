import {
  getCanvasStyle,
  nodeRefKey,
  NODE_COLOR_PRESETS,
  resolveEffectiveShapeMode,
} from './canvasNodes';
import { collectCanvasStages } from './stageLayout';

export const DEFAULT_MAP_THEME = {
  panelTab: 'layout',
  mapType: 'standard',
  direction: 'vertical',
  mapStyle: 'simple',
  roadmap: {
    spacing: 1,
    centerX: 480,
    baseY: 880,
    top: 80,
    height: 1000,
    origin: {
      title: 'Η Ιδέα',
      subtitle: 'Αρχή της διαδρομής',
    },
  },
  lifeline: {
    startDate: null,
    dayHeight: 24,
    futureDays: 365,
    routineTemplates: [],
    northStars: [],
  },
  canvas: {
    backgroundColor: '#000000',
    backgroundImage: null,
  },
  globalColors: {
    textColor: '#f5f5f5',
    fillColor: '#1e3a8a',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  globalText: {
    fontSize: 'md',
    fontWeight: 'normal',
    textAlign: 'left',
  },
  levelOverrides: [
    {
      id: 'root',
      label: 'Root node',
      level: 0,
      textColor: '#ffffff',
      fillColor: '#2563eb',
      borderColor: 'rgba(147, 197, 253, 0.65)',
    },
    {
      id: 'level-1',
      label: 'Level 1',
      level: 1,
      textColor: '#e0f2fe',
      fillColor: '#1d4ed8',
      borderColor: 'rgba(59, 130, 246, 0.5)',
    },
  ],
  globalShape: {
    borderThickness: 'm',
    cornerRadius: 'l',
    padding: 'l',
    shadow: 'm',
  },
  globalLines: {
    lineThickness: 'm',
    lineStyle: 'straight',
    lineColor: '#888888',
  },
  nodeTypeColors: {
    milestone: {
      fillColor: '#0a0a0a',
      textColor: '#f5f5f5',
      borderColor: '#3b82f6',
    },
    milestoneMajor: {
      fillColor: '#0a0a0a',
      textColor: '#ffffff',
      borderColor: '#22c55e',
    },
    idea: {
      fillColor: '#0a0a0a',
      textColor: '#f5f5f5',
      borderColor: '#f59e0b',
    },
    sticky: {
      fillColor: '#0a0a0a',
      textColor: '#f5f5f5',
      borderColor: '#eab308',
    },
    origin: {
      fillColor: '#0a0a0a',
      textColor: '#fef3c7',
      borderColor: '#f59e0b',
    },
    obstacle: {
      fillColor: '#0a0a0a',
      textColor: '#fecaca',
      borderColor: '#ef4444',
    },
    resource: {
      fillColor: '#0a0a0a',
      textColor: '#bfdbfe',
      borderColor: '#6366f1',
    },
    task: {
      fillColor: '#0a0a0a',
      textColor: '#dbeafe',
      borderColor: '#93c5fd',
    },
  },
};

export const NODE_TYPE_COLOR_KEYS = [
  { id: 'milestone', label: 'Milestone' },
  { id: 'milestoneMajor', label: 'Major milestone' },
  { id: 'idea', label: 'Idea' },
  { id: 'sticky', label: 'Note' },
  { id: 'obstacle', label: 'Obstacle' },
  { id: 'resource', label: 'Resource' },
  { id: 'task', label: 'Task' },
  { id: 'origin', label: 'Origin (Αρχή)' },
];

const LINE_WIDTH_MAP = { s: 1.5, m: 2.5, l: 3.5, xl: 5 };
const PADDING_MAP = { s: '8px 10px', m: '12px 14px', l: '14px 16px', xl: '18px 20px' };
const RADIUS_MAP = { s: '6px', m: '10px', l: '16px', rnd: '999px' };
const SHADOW_MAP = {
  none: 'none',
  s: '0 2px 8px rgba(0, 0, 0, 0.08)',
  m: '0 4px 16px rgba(0, 0, 0, 0.12)',
  l: '0 8px 28px rgba(0, 0, 0, 0.18)',
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = { ...base };
  for (const key of Object.keys(patch)) {
    const val = patch[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = deepMerge(base[key] || {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function mergeMapTheme(current, updates) {
  const base = deepMerge(DEFAULT_MAP_THEME, current || {});
  const merged = deepMerge(base, updates || {});

  const savedBg = merged.canvas?.backgroundColor;
  const isLegacyBlueBg = !savedBg || savedBg === '#06101f' || savedBg === '#0a1628' || savedBg === '#e8eaed';
  if (isLegacyBlueBg) {
    merged.canvas = { ...merged.canvas, backgroundColor: '#000000' };
  }
  if (merged.mapStyle === 'premium' && isLegacyBlueBg) {
    merged.mapStyle = 'simple';
  }

  return merged;
}

export function computeNodeLevels(stages, backlog, stickies, connections = []) {
  const levels = new Map();
  const canvasMilestones = collectCanvasStages(stages);
  if (!canvasMilestones.length) return levels;

  let rootKey = null;
  const current = canvasMilestones.find((s) => s.status === 'Current');
  if (current) {
    rootKey = nodeRefKey({ type: 'milestone', id: current.id });
  } else {
    const incoming = new Set(connections.map((c) => nodeRefKey(c.to)));
    const roots = canvasMilestones.filter(
      (s) => !incoming.has(nodeRefKey({ type: 'milestone', id: s.id }))
    );
    if (roots.length) {
      rootKey = nodeRefKey({ type: 'milestone', id: roots[0].id });
    } else {
      rootKey = nodeRefKey({ type: 'milestone', id: canvasMilestones[0].id });
    }
  }

  levels.set(rootKey, 0);
  const queue = [{ key: rootKey, level: 0 }];
  const visited = new Set([rootKey]);

  while (queue.length) {
    const { key, level } = queue.shift();
    for (const conn of connections) {
      const fromKey = nodeRefKey(conn.from);
      const toKey = nodeRefKey(conn.to);
      if (fromKey === key && !visited.has(toKey)) {
        visited.add(toKey);
        levels.set(toKey, level + 1);
        queue.push({ key: toKey, level: level + 1 });
      }
    }
  }

  return levels;
}

function getLevelOverride(mapTheme, level) {
  if (level == null) return null;
  return (mapTheme?.levelOverrides || []).find((o) => o.level === level) || null;
}

function productiveColorForLevel(level) {
  return NODE_COLOR_PRESETS[level % NODE_COLOR_PRESETS.length];
}

function getTypeColorOverride(mapTheme, nodeTypeKey) {
  if (!nodeTypeKey) return null;
  const theme = mergeMapTheme({}, mapTheme);
  return theme.nodeTypeColors?.[nodeTypeKey] || null;
}

export function resolveNodeThemeStyle(entity, mapTheme, nodeLevel, nodeTypeKey) {
  const nodeStyle = getCanvasStyle(entity);
  const theme = mergeMapTheme({}, mapTheme);
  const typeColors = getTypeColorOverride(theme, nodeTypeKey);
  const override = getLevelOverride(theme, nodeLevel);
  const global = theme.globalColors;

  let fillColor;
  let textColor;
  let borderColor;

  if (nodeTypeKey && typeColors) {
    fillColor = typeColors.fillColor ?? '#0a0a0a';
    textColor = typeColors.textColor ?? '#f5f5f5';
    borderColor = typeColors.borderColor ?? '#888888';
    if (entity?.canvasStyle?.textColor) textColor = entity.canvasStyle.textColor;
    if (entity?.canvasStyle?.borderColor != null) borderColor = entity.canvasStyle.borderColor;
  } else {
    fillColor = nodeStyle.color || override?.fillColor || global.fillColor;
    textColor = nodeStyle.textColor || override?.textColor || global.textColor;
    borderColor = nodeStyle.borderColor ?? override?.borderColor ?? global.borderColor;

    if (theme.mapStyle === 'productive' && nodeLevel != null && !entity?.canvasStyle?.color) {
      fillColor = productiveColorForLevel(nodeLevel);
    }
  }

  const accentColor = typeColors?.borderColor ?? borderColor ?? fillColor;

  const shape = { ...(theme.globalShape || DEFAULT_MAP_THEME.globalShape) };
  if (theme.mapStyle === 'simple') {
    shape.shadow = 'none';
  } else if (theme.mapStyle === 'bubbles') {
    shape.cornerRadius = shape.cornerRadius || 'rnd';
  } else if (theme.mapStyle === 'premium') {
    shape.shadow = 'l';
    shape.borderThickness = shape.borderThickness || 'm';
  }
  const borderWidth = nodeTypeKey ? 2 : (LINE_WIDTH_MAP[shape.borderThickness] || 1);
  const shapeMode = resolveEffectiveShapeMode(entity, mapTheme);
  let borderRadius = RADIUS_MAP[shape.cornerRadius] || RADIUS_MAP.l;
  let padding = PADDING_MAP[shape.padding] || PADDING_MAP.l;
  const shadow = nodeTypeKey
    ? `0 0 16px ${accentColor}28, 0 4px 20px rgba(0, 0, 0, 0.5)`
    : (SHADOW_MAP[shape.shadow] || SHADOW_MAP.s);

  if (shapeMode === 'sharp') {
    borderRadius = '4px';
  } else if (shapeMode === 'pill') {
    borderRadius = '999px';
    padding = '22px 36px';
  }

  return {
    '--node-text': textColor,
    '--node-fill': fillColor,
    '--node-border': borderColor || 'transparent',
    '--node-border-width': `${borderWidth}px`,
    '--node-radius': borderRadius,
    '--node-padding': padding,
    '--node-shadow': shadow,
    '--node-accent': accentColor,
    '--node-accent-soft': `${accentColor}22`,
    '--node-accent-border': borderColor || accentColor,
    '--node-accent-glow': `${accentColor}44`,
    color: textColor,
    background: fillColor,
    borderColor: borderColor || accentColor,
    borderWidth: borderWidth,
    borderRadius: borderRadius,
    padding: padding,
    boxShadow: shadow,
  };
}

export function resolveOriginThemeStyle(mapTheme) {
  return resolveNodeThemeStyle({}, mapTheme, null, 'origin');
}

export function getEffectiveNodeStyle(entity, mapTheme) {
  const nodeStyle = getCanvasStyle(entity);
  const globalText = mapTheme?.globalText || DEFAULT_MAP_THEME.globalText;
  return {
    ...nodeStyle,
    fontSize: entity?.canvasStyle?.fontSize || globalText.fontSize || nodeStyle.fontSize,
    fontWeight: entity?.canvasStyle?.fontWeight || globalText.fontWeight || nodeStyle.fontWeight,
    textAlign: entity?.canvasStyle?.textAlign || globalText.textAlign || nodeStyle.textAlign,
  };
}

export function getRoadmapLayout(mapTheme) {
  const theme = mergeMapTheme({}, mapTheme);
  const spacing = Math.min(2, Math.max(0.5, Number(theme.roadmap?.spacing) || 1));
  const baseY = theme.roadmap?.baseY ?? 880;
  const top = theme.roadmap?.top ?? 80;
  const height = Math.max(240, Number(theme.roadmap?.height) || 1000);
  return {
    direction: theme.direction === 'horizontal' ? 'horizontal' : 'vertical',
    spacing,
    centerX: theme.roadmap?.centerX ?? 480,
    baseY,
    top,
    height,
  };
}

export function getRoadmapOrigin(mapTheme) {
  const theme = mergeMapTheme({}, mapTheme);
  const origin = theme.roadmap?.origin || {};
  return {
    title: origin.title ?? DEFAULT_MAP_THEME.roadmap.origin.title,
    subtitle: origin.subtitle ?? DEFAULT_MAP_THEME.roadmap.origin.subtitle,
  };
}

export function canvasViewportStyle(mapTheme) {
  const theme = mergeMapTheme({}, mapTheme);
  const savedBg = theme.canvas?.backgroundColor;
  const legacyBlue = savedBg === '#06101f' || savedBg === '#0a1628';
  const bg =
    !savedBg || savedBg === '#e8eaed' || legacyBlue
      ? DEFAULT_MAP_THEME.canvas.backgroundColor
      : savedBg;
  const img = theme.canvas?.backgroundImage;
  const isPremium = theme.mapStyle === 'premium';
  const dotGrid = isPremium
    ? 'radial-gradient(circle at 1px 1px, rgba(96, 165, 250, 0.08) 1px, transparent 0)'
    : 'radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.035) 1px, transparent 0)';
  const premiumGlow =
    'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(37, 99, 235, 0.22), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(30, 64, 175, 0.15), transparent)';

  if (img) {
    return {
      backgroundColor: bg,
      backgroundImage: `url("${img}"), ${isPremium ? `${premiumGlow}, ` : ''}${dotGrid}`,
      backgroundSize: 'cover, auto, 28px 28px',
      backgroundPosition: 'center, center, 0 0',
    };
  }

  return {
    backgroundColor: bg,
    backgroundImage: isPremium ? `${premiumGlow}, ${dotGrid}` : dotGrid,
    backgroundSize: isPremium ? 'auto, 28px 28px' : '28px 28px',
  };
}

export function connectionLineStyle(mapTheme) {
  const lines = mergeMapTheme({}, mapTheme).globalLines;
  return {
    strokeWidth: LINE_WIDTH_MAP[lines.lineThickness] || 1.5,
    lineStyle: lines.lineStyle || 'curved',
    color: lines.lineColor,
  };
}

export function getThemedConnectionPath(fromBounds, toBounds, lineStyle = 'curved') {
  const x1 = fromBounds.cx;
  const y1 = fromBounds.cy;
  const x2 = toBounds.cx;
  const y2 = toBounds.cy;

  if (lineStyle === 'straight') {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (lineStyle === 'angled') {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
  }

  const dx = Math.abs(x2 - x1) * 0.4;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export const BORDER_THICKNESS_OPTIONS = ['s', 'm', 'l', 'xl'];
export const CORNER_RADIUS_OPTIONS = ['s', 'm', 'l', 'rnd'];
export const PADDING_OPTIONS = ['s', 'm', 'l', 'xl'];
export const SHADOW_OPTIONS = ['none', 's', 'm', 'l'];
export const LINE_STYLE_OPTIONS = [
  { id: 'curved', label: 'Curved', icon: 'curve' },
  { id: 'angled', label: 'Angled', icon: 'angle' },
  { id: 'straight', label: 'Straight', icon: 'line' },
];
