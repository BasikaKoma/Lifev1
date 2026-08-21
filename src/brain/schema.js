export const BRAIN_INSIGHTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['insights'],
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'body', 'confidence', 'sources'],
        properties: {
          kind: { type: 'string', enum: ['insight', 'alert', 'suggestion', 'summary'] },
          title: { type: 'string' },
          body: { type: 'string' },
          confidence: { type: 'number' },
          sources: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export const BRAIN_TOOLS = [
  {
    name: 'remember',
    description: 'Store a durable Lifev1 memory (decision, preference, value, goal, style, brand, writing example, insight, or draft). This is app memory, not OpenAI conversation state.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'title', 'body'],
      properties: {
        kind: {
          type: 'string',
          enum: ['decision', 'conclusion', 'preference', 'value', 'goal', 'style', 'brand', 'writing_example', 'insight', 'draft'],
        },
        title: { type: 'string' },
        body: { type: 'string' },
        status: { type: 'string', enum: ['current', 'old', 'superseded'] },
      },
    },
  },
  {
    name: 'search_memory',
    description: 'Search Lifev1 durable memories by text. Returns current items first. Does not use provider conversation IDs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string' },
      },
    },
  },
  {
    name: 'get_project',
    description: 'Load a compact summary of one lifev1 project by UUID or title (partial name is ok, e.g. Symphon).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Project UUID or title.' },
        projectId: { type: 'string', description: 'Optional UUID alias for query.' },
        name: { type: 'string', description: 'Optional title alias for query.' },
      },
    },
  },
  {
    name: 'list_dir',
    description: 'List files in an allowed folder. Use rootId from the user allowlist, never a filesystem path.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['rootId'],
      properties: {
        rootId: { type: 'string' },
        relativePath: { type: 'string' },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file from an allowed folder.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['rootId', 'relativePath'],
      properties: {
        rootId: { type: 'string' },
        relativePath: { type: 'string' },
      },
    },
  },
  {
    name: 'read_image',
    description: 'Read an image from an allowed folder as base64.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['rootId', 'relativePath'],
      properties: {
        rootId: { type: 'string' },
        relativePath: { type: 'string' },
      },
    },
  },
];
