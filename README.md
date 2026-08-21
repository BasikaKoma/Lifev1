# lifev1

A personal operating system for mapping your life, goals, and daily momentum — roadmap, lifeline, and self insights in one premium workspace.

## Stack

- React + Vite
- Electron (Windows desktop)
- Supabase (auth & cloud sync)
- Plain CSS (no UI libraries)

## Run (browser)

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Desktop app (Windows)

### Development

Instant changes while coding (hot reload):

```bash
npm run electron:dev
```

Production-like build with auto-restart on save:

```bash
npm run electron:watch
```

### Build installer

```bash
npm run electron:build
```

Each build auto-increments the version (1.0.1, 1.0.2, …). The installer is created at `%USERPROFILE%\lifev1-release\lifev1 Setup X.Y.Z.exe`.

### Publish update to all users

Installers are ~150 MB. Supabase free storage caps uploads at **50 MB**, so releases go to **GitHub Releases**.

1. Create a GitHub repo (public or private).
2. Add to your local `.env` (never commit):
   ```
   GITHUB_OWNER=your-github-username
   GITHUB_REPO=lifev1
   GH_TOKEN=ghp_...   # GitHub → Settings → Developer settings → token with "repo" scope
   ```
3. Build and upload:

```bash
npm run electron:release
```

Or separately: `npm run electron:build` then `npm run electron:publish`.

Every installed app checks for updates on startup and every 30 minutes. Users get a restart prompt when a new version is ready — no manual exe distribution needed.

**First install on a new PC** still requires the installer once. After that, updates are automatic.

### Auto-update (installed app)

When a new version is published, installed apps download it in the background and prompt to restart. No manual reinstall needed on the same PC.

On a new PC, open **Settings** once and paste your OpenAI key for voice. Cloud sync uses the built-in Supabase connection — sign in with your account to access your projects.

## Features

- **Roadmap** — Visual planning for milestones, goals, and projects
- **Lifeline** — Daily rhythm view for habits, checkpoints, and progress
- **Self** — Personal metrics and Oura integration
- **Cloud sync** — Projects saved across devices when signed in
- **Desktop auto-update** — New versions delivered automatically

## Philosophy

lifev1 helps you organize your life with intention — see where you are, where you're going, and how you're doing along the way.
