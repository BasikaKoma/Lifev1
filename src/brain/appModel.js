export const APP_MODEL = {
  name: 'lifev1',
  layers: {
    self: 'Body, energy, sleep, readiness, capacity, focus window. Not a project.',
    lifeline: 'One special timeline of the person\'s life (days, routines, how each day went). Unique. Never duplicate it as a normal project.',
    path: 'Path is the 90-day commitment layer: goals → weekly plan → time blocks → execution → measurements. Not a task manager. Goals are decided when the user is clear, then followed without daily re-evaluation.',
    brand: 'Personal Brand turns lived events into content: signal → idea → draft → platform variation → approval → publish. Brand DNA (who, voice, donts, pillars) lives in the app, not in the model.',
    projects: 'Separate workstreams with their own roadmap. Each project has stages, checkpoints, goals, notes, ideas, obstacles, canvas tasks, and a brief.',
    brain: 'Advisor over the whole app. MEMORY.whoYouAre is voice/preferences. SNAPSHOT.brand is the content system and DNA.',
  },
  whatIsAProject: 'Create a project only when the thing needs its own execution: milestones, decisions, blockers, and progress over weeks/months. Opening a project gives it a canvas and a roadmap.',
  notAProject: [
    'A 90-day goal, weekly time block, or Path metric (belongs in Path)',
    'Identity, voice, or personal brand as a way of being (belongs in Personal Brand / Brand DNA)',
    'A single note, idea, or sticky',
    'A daily habit or how a day went (Lifeline / Self)',
    'A health or energy topic (Self)',
  ],
  personalBrandRule: 'Personal Brand is a first-class app layer (sidebar, under Self). Never create a project named Personal Brand. Content ideas must come from SNAPSHOT.brand.signals / items / DNA, or from real Lifeline/project events. Never invent generic LinkedIn listicles. Nobelle is out of the personal brand. Market Portal only as a lesson.',
  decisionRule: 'When asked "should X be a project?", compare X to existing projects, Lifeline, and Brain profile. Prefer fewer, sharper projects. Recommend a project only if X would otherwise lack a place for checkpoints and next moves.',
};

export function appModelText() {
  return `APP MODEL (how lifev1 is built — use this when advising structure, not only data)
- Self = body/energy/day. Path = 90-day goals, weekly blocks, and measurements (not a task list). Lifeline = the one life timeline. Personal Brand = lived events → content (DNA + pipeline). Projects = workstreams with roadmap. Brain profile = voice, not a canvas.
- Make a PROJECT only when something needs its own milestones and execution. Do not turn identity, a habit, or a single idea into a project.
- Personal Brand is already an app screen. Do not create a Personal Brand project. Drafts must start from real experience in SNAPSHOT.brand or Lifeline/projects. No generic "5 things I learned" posts. Nobelle stays out. Market Portal only as a lesson.
- Before saying "create a project", look at SNAPSHOT.projects and SNAPSHOT.lifelineProject. Prefer fewer, sharper projects.
- Standing personal laws in MEMORY.laws override generic advice. Strategic answers must respect them.
- You can CREATE or UPDATE inside the app via actions, but only when the user asked you to make it now. Then actually emit create_project / complete_checkpoint / update_note / open_project as needed.`;
}
