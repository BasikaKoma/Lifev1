export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createDefaultStages() {
  return [];
}

/** First milestone for a brand-new project (roadmap is not blank). */
export function createStarterStages() {
  return [createEmptyStage(1, true)];
}

export function createEmptyGoal(order, isFirst = false) {
  return {
    id: `goal-${generateId()}`,
    title: `Goal ${order}`,
    description: '',
    targetDate: null,
    order,
    status: isFirst ? 'Current' : 'Locked',
    category: '',
  };
}

export function createEmptyIdea(overrides = {}) {
  return {
    id: `idea-${generateId()}`,
    title: '',
    description: '',
    reasonToWait: '',
    unlockStageId: null,
    linkedCheckpointIds: [],
    actionAfterUnlock: '',
    impact: 'Medium',
    effort: 'Medium',
    timing: 'Too Early',
    status: 'Locked',
    reviewDate: null,
    canvasX: null,
    canvasY: null,
    linkedStageId: null,
    canvasStyle: null,
    category: '',
    completedAt: null,
    ...overrides,
  };
}

export function createEmptySticky(overrides = {}) {
  return {
    id: `sticky-${generateId()}`,
    text: '',
    imageSrc: null,
    canvasX: null,
    canvasY: null,
    width: 200,
    sizeLocked: false,
    canvasStyle: {
      color: '#fef08a',
      shape: 'rounded',
      fontSize: 'md',
      fontWeight: 'normal',
    },
    category: '',
    relatedStageId: null,
    linkedCheckpointIds: [],
    archived: false,
    archivedAt: null,
    done: false,
    completedAt: null,
    ...overrides,
  };
}

export function createEmptyCanvasObstacle(overrides = {}) {
  return {
    id: `obstacle-${generateId()}`,
    title: 'New obstacle',
    description: '',
    severity: 'Medium',
    status: 'Open',
    canvasX: null,
    canvasY: null,
    onRoadmap: false,
    timelineY: null,
    roadmapSide: null,
    canvasStyle: null,
    category: '',
    linkedCheckpointIds: [],
    completedAt: null,
    ...overrides,
  };
}

export function createEmptyCanvasResource(overrides = {}) {
  return {
    id: `resource-${generateId()}`,
    title: 'New resource',
    description: '',
    resourceType: 'People',
    status: 'Needed',
    canvasX: null,
    canvasY: null,
    onRoadmap: false,
    timelineY: null,
    roadmapSide: null,
    canvasStyle: null,
    category: '',
    linkedCheckpointIds: [],
    completedAt: null,
    ...overrides,
  };
}

export function createEmptyCanvasTask(overrides = {}) {
  return {
    id: `task-${generateId()}`,
    title: 'New task',
    description: '',
    status: 'Todo',
    canvasX: null,
    canvasY: null,
    onRoadmap: false,
    timelineY: null,
    roadmapSide: null,
    canvasStyle: null,
    category: '',
    linkedCheckpointIds: [],
    completedAt: null,
    ...overrides,
  };
}

export function createEmptyStage(order, isFirst = false) {
  return {
    id: `stage-${generateId()}`,
    title: `Milestone ${order}`,
    description: '',
    order,
    status: isFirst ? 'Current' : 'Locked',
    category: '',
    planMode: false,
    planStartDate: null,
    planEndDate: null,
    planGoal: '',
    checkpoints: [],
    ideas: [],
    blockers: [],
    decisions: [],
    completedAt: null,
  };
}

/** @deprecated All milestones use the same visual style now. */
export function isMajorMilestone() {
  return true;
}

function isUserGoalStage(stage) {
  return typeof stage?.id === 'string' && stage.id.startsWith('goal-');
}

export function reindexGoals(goals) {
  return [...goals]
    .sort((a, b) => a.order - b.order)
    .map((g, i) => ({ ...g, order: i + 1 }));
}

export function migrateProjectGoals(stages = [], goals) {
  if (Array.isArray(goals) && goals.length > 0) {
    return { stages, goals: reindexGoals(goals) };
  }

  const userGoalStages = stages.filter(isUserGoalStage);
  if (userGoalStages.length === 0) {
    return { stages, goals: [] };
  }

  const migratedGoals = userGoalStages.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description || '',
    targetDate: s.targetDate || null,
    order: s.order,
    status: s.status,
  }));

  return {
    stages: stages.filter((s) => !isUserGoalStage(s)),
    goals: reindexGoals(migratedGoals),
  };
}

export function createSymphonTemplate() {
  const validationId = 'validation';
  const stabilityId = 'stability';
  const growthId = 'growth';
  const partnershipsId = 'partnerships';
  const scaleId = 'scale';

  const cp = (title, type, extra = {}) => ({
    id: generateId(),
    title,
    checkpointType: type,
    metricName: extra.metricName || title,
    currentValue: extra.currentValue ?? 0,
    targetValue: extra.targetValue ?? 1,
    unit: extra.unit || '',
    currency: extra.currency || 'EUR',
    checklistItems: extra.checklistItems || [],
    done: false,
    completedAt: null,
    archived: false,
    archivedAt: null,
    category: '',
  });

  const validationCheckpoints = [
    cp('5 active customers', 'Number', { metricName: 'Active customers', targetValue: 5, unit: 'customers' }),
    cp('10 demo calls', 'Number', { metricName: 'Demo calls', targetValue: 10, unit: 'calls' }),
    cp('Clear core use case', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Problem statement defined', checked: false },
        { id: generateId(), text: 'Target customer identified', checked: false },
        { id: generateId(), text: 'Core value proposition written', checked: false },
      ],
    }),
    cp('First positive feedback', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Received at least one positive testimonial', checked: false },
        { id: generateId(), text: 'Documented feedback themes', checked: false },
      ],
    }),
  ];

  const stabilityCheckpoints = [
    cp('20 active customers', 'Number', { metricName: 'Active customers', targetValue: 20, unit: 'customers' }),
    cp('3 testimonials', 'Number', { metricName: 'Testimonials', targetValue: 3, unit: 'testimonials' }),
    cp('Onboarding flow ready', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Welcome email sequence', checked: false },
        { id: generateId(), text: 'Product tour or guide', checked: false },
        { id: generateId(), text: 'First-week checklist for users', checked: false },
      ],
    }),
    cp('No critical bugs for 14 days', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Bug tracking system in place', checked: false },
        { id: generateId(), text: '14 consecutive days without critical bugs', checked: false },
      ],
    }),
    cp('Pricing clear', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Pricing page published', checked: false },
        { id: generateId(), text: 'Plans clearly differentiated', checked: false },
      ],
    }),
  ];

  const growthCheckpoints = [
    cp('50 active customers', 'Number', { metricName: 'Active customers', targetValue: 50, unit: 'customers' }),
    cp('€2,000 monthly revenue', 'Money', { metricName: 'Monthly revenue', targetValue: 2000, currency: 'EUR' }),
    cp('Cold outreach process stable', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Outreach templates created', checked: false },
        { id: generateId(), text: 'Weekly outreach cadence defined', checked: false },
        { id: generateId(), text: 'Conversion metrics tracked', checked: false },
      ],
    }),
    cp('Landing page optimized', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Clear headline and CTA', checked: false },
        { id: generateId(), text: 'Social proof added', checked: false },
        { id: generateId(), text: 'Mobile-friendly layout', checked: false },
      ],
    }),
  ];

  const partnershipIdeas = [
    {
      id: generateId(),
      title: 'Collaborations with accounting offices',
      description: 'Partner with accounting firms to refer clients.',
      reasonToWait: 'We need more proof, stable onboarding and testimonials before approaching partners.',
      unlockStageId: stabilityId,
      linkedCheckpointIds: [],
      actionAfterUnlock: 'Create referral proposal, partner landing page and demo flow.',
      impact: 'High',
      effort: 'Medium',
      timing: 'Too Early',
      status: 'Locked',
      reviewDate: null,
    },
    {
      id: generateId(),
      title: 'Agency partnerships',
      description: 'Partner with agencies that serve your target market.',
      reasonToWait: 'Need proven product-market fit and stable onboarding first.',
      unlockStageId: growthId,
      linkedCheckpointIds: [],
      actionAfterUnlock: 'Identify top 10 agencies, create partner pitch deck.',
      impact: 'High',
      effort: 'High',
      timing: 'Too Early',
      status: 'Locked',
      reviewDate: null,
    },
    {
      id: generateId(),
      title: 'Marketplace consultant partnerships',
      description: 'List on consultant marketplaces and directories.',
      reasonToWait: 'Requires stable product, testimonials, and pricing clarity.',
      unlockStageId: growthId,
      linkedCheckpointIds: [],
      actionAfterUnlock: 'Create marketplace profiles and listing copy.',
      impact: 'Medium',
      effort: 'Medium',
      timing: 'Too Early',
      status: 'Locked',
      reviewDate: null,
    },
  ];

  const scaleCheckpoints = [
    cp('Support process documented', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'FAQ document created', checked: false },
        { id: generateId(), text: 'Support response templates', checked: false },
        { id: generateId(), text: 'Escalation process defined', checked: false },
      ],
    }),
    cp('Help center ready', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Help center platform chosen', checked: false },
        { id: generateId(), text: 'Top 10 articles published', checked: false },
      ],
    }),
    cp('Onboarding automation', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Automated welcome sequence', checked: false },
        { id: generateId(), text: 'Self-serve setup flow', checked: false },
      ],
    }),
    cp('First external collaborator', 'Quality', {
      checklistItems: [
        { id: generateId(), text: 'Role and responsibilities defined', checked: false },
        { id: generateId(), text: 'First collaborator onboarded', checked: false },
      ],
    }),
  ];

  return [
    {
      id: validationId,
      title: 'Validation',
      description: 'Prove that the product solves a real problem.',
      order: 1,
      status: 'Current',
      checkpoints: validationCheckpoints,
      ideas: [],
      blockers: [],
      decisions: [],
    },
    {
      id: stabilityId,
      title: 'Stability',
      description: 'Make the product reliable enough before pushing bigger channels.',
      order: 2,
      status: 'Locked',
      checkpoints: stabilityCheckpoints,
      ideas: [],
      blockers: [],
      decisions: [],
    },
    {
      id: growthId,
      title: 'Growth',
      description: 'Build repeatable customer acquisition.',
      order: 3,
      status: 'Locked',
      checkpoints: growthCheckpoints,
      ideas: [],
      blockers: [],
      decisions: [],
    },
    {
      id: partnershipsId,
      title: 'Partnerships',
      description: 'Open partnership channels after the product is stable.',
      order: 4,
      status: 'Locked',
      checkpoints: [],
      ideas: partnershipIdeas,
      blockers: [],
      decisions: [],
    },
    {
      id: scaleId,
      title: 'Scale',
      description: 'Make the business scalable without depending only on the founder.',
      order: 5,
      status: 'Locked',
      checkpoints: scaleCheckpoints,
      ideas: [],
      blockers: [],
      decisions: [],
    },
  ];
}
