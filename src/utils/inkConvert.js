import { generateId } from '../data/templates';

/**
 * Create project content from recognized handwriting text.
 */
export function applyInkConversion({
  type,
  text,
  position,
  addStage,
  addCanvasSticky,
  addBacklogIdea,
  addNote,
  addGoal,
}) {
  const title = text.trim();
  if (!title) return;

  const x = position?.x ?? 400;
  const y = position?.y ?? 300;

  switch (type) {
    case 'milestone':
    case 'major':
      addStage?.({ title, posX: x, posY: y });
      break;
    case 'sticky':
      addCanvasSticky?.({ text: title, canvasX: x, canvasY: y });
      break;
    case 'note': {
      const now = new Date().toISOString();
      addNote?.({
        id: `note-${generateId()}`,
        title: title.slice(0, 80),
        body: title,
        relatedStageId: null,
        category: '',
        createdAt: now,
        updatedAt: now,
        archived: false,
        archivedAt: null,
        done: false,
      });
      break;
    }
    case 'goal':
      addGoal?.({ title });
      break;
    default:
      addCanvasSticky?.({ text: title, canvasX: x, canvasY: y });
  }
}
