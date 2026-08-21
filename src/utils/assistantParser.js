function normalizeGreek(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u03c2/g, '\u03c3');
}

function extractQuoted(text) {
  const m = text.match(/[«"']([^»"']+)[»"']/);
  if (m) return m[1].trim();
  return null;
}

function parseGoalContent(raw) {
  const quoted = extractQuoted(raw);
  if (quoted) return { title: quoted, description: '' };

  let text = raw.trim()
    .replace(/^(?:αυτ[όο]|αυτο|this)\s+/i, '')
    .replace(/^(?:γράψε|φτιάξε|πρόσθεσε|βάλε|κάνε|γραψε|φτιαξε|προσθεσε|βαλε|κανε|create|add|make|new)\s+(?:μου\s+)?(?:αυτ[όο]|αυτο|this\s+)?(?:έναν?\s+|εναν?\s+)?/i, '')
    .replace(/^(?:τον?\s+)?(?:στ[όο]χο|στοχο|goal)\s*/i, '')
    .replace(/^\d+[.)]\s*/, '')
    .trim();

  const dashSplit = text.split(/\s*[—–-]\s+/);
  if (dashSplit.length >= 2 && dashSplit[0].length >= 2) {
    return {
      title: dashSplit[0].trim(),
      description: dashSplit.slice(1).join(' — ').trim(),
    };
  }

  if (text.length >= 2) return { title: text, description: '' };
  return null;
}

function parseIdeaContent(raw) {
  const quoted = extractQuoted(raw);
  if (quoted) return quoted;
  const cleaned = raw
    .trim()
    .replace(/^(?:την?\s+)?(?:ιδέα|ιδεα|idea)\s*[:：]?\s*/i, '')
    .replace(/^(?:έχω|have)\s+/i, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function findGoalId(goals, hint) {
  if (!goals?.length) return null;
  if (hint) {
    const lower = hint.toLowerCase();
    const match = goals.find((g) => g.title.toLowerCase().includes(lower));
    if (match) return match.id;
  }
  const current = goals.find((g) => g.status === 'Current');
  if (current) return current.id;
  return goals[0]?.id || null;
}

function findStageId(stages, hint) {
  if (!stages?.length) return null;
  if (hint) {
    const lower = hint.toLowerCase();
    const match = stages.find((s) => s.title.toLowerCase().includes(lower));
    if (match) return match.id;
  }
  const current = stages.find((s) => s.status === 'Current');
  if (current) return current.id;
  return stages[0]?.id || null;
}

function isDeleteCommand(text) {
  const n = normalizeGreek(text);
  return /(?:διεγραψε|διαγραψε|σβησε|remove|delete|clear|αφαιρεσε)/.test(n);
}

function pushGoal(intents, raw) {
  const parsed = parseGoalContent(raw);
  if (parsed?.title) {
    intents.push({ type: 'goal', title: parsed.title, description: parsed.description || '' });
  }
}

function pushIdea(intents, raw, goalHint) {
  const title = parseIdeaContent(raw);
  if (title) {
    intents.push({ type: 'idea', title, description: '', goalHint });
  }
}

function pushNote(intents, raw) {
  const body = extractQuoted(raw) || raw.replace(/^(?:σημείωση|σημειωση|note)\s*[:：]?\s*/i, '').trim();
  if (body.length >= 2) {
    intents.push({ type: 'note', title: body.split('\n')[0].slice(0, 80), body });
  }
}

function pushCheckpoint(intents, raw, goalHint) {
  const title = extractQuoted(raw) || raw.replace(/^(?:checkpoint|check\s*point)\s*[:：]?\s*/i, '').trim();
  if (title.length >= 2) {
    intents.push({ type: 'checkpoint', title, goalHint });
  }
}

function parseDeleteIntents(input, goals) {
  const intents = [];
  const n = normalizeGreek(input);

  if (!isDeleteCommand(input)) return intents;

  const hasGoalWord = /(?:στοχ|goal)/.test(n);
  const deleteAll =
    /(?:clear|delete)\s+all\s+goals?/.test(n) ||
    (hasGoalWord && /(?:ολουσ|ολα|all)/.test(n)) ||
    (hasGoalWord && /στοχουσ|στοχων|goals/.test(n));

  if (deleteAll) {
    intents.push({ type: 'delete_all_goals' });
    return intents;
  }

  const singleDelete = input.match(
    /(?:δι[έε]γραψε|διαγραψε|σβ[ήη]σε|σβησε|remove|delete|αφα[ίι]ρεσε|αφαιρεσε)\s+(?:τον?\s+)?(?:στ[όο]χο|στοχο|goal)\s*[«"']?([^»"']+)[»"']?/i
  );
  if (singleDelete) {
    intents.push({ type: 'delete_goal', goalHint: singleDelete[1].trim() });
    return intents;
  }

  if (hasGoalWord && goals.length === 1) {
    intents.push({ type: 'delete_all_goals' });
  }

  return intents;
}

export function parseAssistantMessage(text, goals = [], stages = []) {
  const input = text.trim();
  if (!input) return { intents: [], hint: 'Γράψε ή πες κάτι…' };

  const deleteIntents = parseDeleteIntents(input, goals);
  if (deleteIntents.length > 0) {
    return { intents: deleteIntents };
  }

  const intents = [];

  const goalPatterns = [
    /(?:γράψε|φτιάξε|πρόσθεσε|βάλε|κάνε|γραψε|φτιαξε|προσθεσε|βαλε|κανε|create|add|make|new)\s+(?:μου\s+)?(?:αυτ[όο]|αυτο|this\s+)?(?:έναν?\s+|εναν?\s+)?(?:στ[όο]χο|στοχο|goal)\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /(?:βάλε|πρόσθεσε|βαλε|προσθεσε)\s+(?:αυτ[όο]|αυτο)\s+(?:στ[όο]χο|στοχο)\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /(?:στ[όο]χος|στοχος|goal)\s*[:：]?\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /^στ[όο]χος\s+(.+)$/i,
  ];

  const ideaPatterns = [
    /(?:έχω|have)\s+(?:την?\s+)?(?:ιδέα|ιδεα|idea)\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /(?:γράψε|πρόσθεσε|βάλε|add|save)\s+(?:μου\s+)?(?:την?\s+)?(?:ιδέα|ιδεα|idea)\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /(?:ιδέα|ιδεα|idea)\s*[:：]\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
  ];

  const notePatterns = [
    /(?:σημείωση|σημειωση|note)\s*[:：]?\s*(.+)$/gi,
    /(?:γράψε|κράτα)\s+(?:μια\s+)?(?:σημείωση|σημειωση)\s*(.+)$/gi,
  ];

  const checkpointPatterns = [
    /(?:checkpoint|check\s*point|σταθμός|σταθμος)\s*[:：]?\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
    /(?:γράψε|πρόσθεσε|βάλε)\s+(?:ένα\s+)?checkpoint\s*(.+?)(?=(?:\s+(?:και|and)\s+)|$)/gi,
  ];

  const goalForIdea = input.match(/(?:στον?\s+στόχο|στο\s+goal|for\s+goal)\s+[«"']?([^»"']+)[»"']?/i);

  for (const pattern of goalPatterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(input)) !== null) {
      pushGoal(intents, m[1]);
    }
  }

  for (const pattern of ideaPatterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(input)) !== null) {
      pushIdea(intents, m[1], goalForIdea?.[1]?.trim());
    }
  }

  for (const pattern of notePatterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(input)) !== null) {
      pushNote(intents, m[1]);
    }
  }

  for (const pattern of checkpointPatterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(input)) !== null) {
      pushCheckpoint(intents, m[1], goalForIdea?.[1]?.trim());
    }
  }

  if (intents.length === 0 && !isDeleteCommand(input)) {
    const n = normalizeGreek(input);
    if (/(?:ιδεα|idea)/.test(n)) {
      pushIdea(intents, input, goalForIdea?.[1]?.trim());
    } else if (
      /(?:στοχ|goal)/.test(n) &&
      /(?:βαλε|προσθεσε|γραψε|add|create)/.test(n)
    ) {
      pushGoal(intents, input);
    } else if (/(?:σημει|note)/.test(n)) {
      pushNote(intents, input);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const intent of intents) {
    const key = intent.type.startsWith('delete')
      ? intent.type
      : `${intent.type}:${intent.title || intent.goalHint || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(intent);
    }
  }

  if (unique.length === 0) {
    return {
      intents: [],
      hint: 'Δεν κατάλαβα. Δοκίμασε μία από τις παρακάτω εντολές ή πάτα μια πρόταση.',
    };
  }

  return { intents: unique };
}

export const ASSISTANT_EXAMPLES = [
  'Βάλε στόχο Find What Sells — Να βρούμε τι πουλάει',
  'Διέγραψε όλους τους στόχους',
  'Έχω την ιδέα «Partner με gyms»',
];

export function describeIntents(intents) {
  return intents.map((i) => {
    switch (i.type) {
      case 'goal':
        return `Στόχος: «${i.title}»`;
      case 'idea':
        return `Ιδέα: «${i.title}»`;
      case 'note':
        return `Σημείωση: «${i.title}»`;
      case 'checkpoint':
        return `Checkpoint: «${i.title}»`;
      case 'delete_all_goals':
        return 'Διαγραφή όλων των στόχων';
      case 'delete_goal':
        return `Διαγραφή στόχου: «${i.goalHint}»`;
      default:
        return '';
    }
  }).filter(Boolean);
}

export function findGoalIdFromHint(goals, hint) {
  return findGoalId(goals, hint);
}

export function findStageIdFromHint(stages, hint) {
  return findStageId(stages, hint);
}
