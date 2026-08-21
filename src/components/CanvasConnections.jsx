import { buildNodeRegistry, getCanvasStyle } from '../utils/canvasNodes';
import { connectionLineStyle, getThemedConnectionPath } from '../utils/mapTheme';

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

        const color = conn.color || lineTheme.color || getCanvasStyle(fromNode.entity).color;
        const d = getThemedConnectionPath(fromNode.bounds, toNode.bounds, lineTheme.lineStyle);

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
