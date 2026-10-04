import { buildNodeRegistry, connectionAnchor, getCanvasStyle } from '../utils/canvasNodes';
import { connectionLineStyle, getThemedConnectionPath } from '../utils/mapTheme';
import { normalizeFronts } from '../utils/projectFronts';

function attachedFrontId(node, stages) {
  if (node?.entity?.frontId) return node.entity.frontId;
  if (node?.ref?.type !== 'checkpoint') return null;
  const stageId = node.entity?.stageId || node.ref?.stageId;
  return stages.find((stage) => stage.id === stageId)?.frontId || null;
}

export function frontConnectionColor(nodes, stages, fronts) {
  for (const node of nodes) {
    const color = fronts.find((front) => front.id === attachedFrontId(node, stages))?.color;
    if (color) return color;
  }
  return null;
}

export function CanvasConnections({
  connections,
  stages,
  backlog,
  stickies,
  obstacles = [],
  resources = [],
  tasks = [],
  layout,
  onRemoveConnection,
  mapTheme,
}) {
  const registry = buildNodeRegistry(stages, backlog, stickies, obstacles, resources, tasks, layout, connections);
  const lineTheme = connectionLineStyle(mapTheme);
  const fronts = normalizeFronts(mapTheme?.fronts);

  return (
    <svg className="canvas-connections" aria-hidden="true">
      {connections.map((conn) => {
        const fromNode = registry.get(
          `${conn.from.type}:${conn.from.id}:${conn.from.source || ''}:${conn.from.stageId || ''}`
        );
        const toNode = registry.get(
          `${conn.to.type}:${conn.to.id}:${conn.to.source || ''}:${conn.to.stageId || ''}`
        );
        if (!fromNode?.bounds || !toNode?.bounds) return null;

        const fromBounds = connectionAnchor(fromNode, stages, layout);
        const toBounds = connectionAnchor(toNode, stages, layout);
        const color = frontConnectionColor([fromNode, toNode], stages, fronts)
          || conn.color
          || lineTheme.color
          || getCanvasStyle(fromNode.entity).color;
        const d = getThemedConnectionPath(fromBounds, toBounds, lineTheme.lineStyle);

        return (
          <g key={conn.id} className="canvas-connection">
            <path
              d={d}
              className="canvas-connection__hit"
              onClick={() => onRemoveConnection?.(conn.id)}
            />
            <path
              d={d}
              className="canvas-connection__line"
              stroke={color}
              strokeWidth={lineTheme.strokeWidth}
            />
          </g>
        );
      })}
    </svg>
  );
}
