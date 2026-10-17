# lifev1

A personal operating system for mapping your life, goals, and daily momentum — projects, lifeline, and self insights in one premium workspace.

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

## Push notifications

Reminders for Path blocks, the end of a block timer, the day plan, routines and project rhythm, plus an alert when Oura heart-rate samples above your limit (default 100 bpm) arrive: a trigger on `oura_daily_metrics` queues the push and sends it right away. Oura webhooks (`oura-webhook`) re-read the last two days ~30 s after the ring syncs through the Oura app, so new samples land without polling. Each app writes the upcoming reminders (next 36 h) into `push_schedule`; a per-minute cron calls the `push-dispatch` Edge Function, which sends the due ones:

- **iPhone** — Web Push to the home-screen app (Safari → Share → Add to Home Screen, iOS 16.4+)
- **Android app** — Firebase Cloud Messaging
- **Desktop (Electron)** — Realtime + native Windows toasts; closing the window keeps lifev1 in the tray
- **Browsers** — Web Push (Chrome, Edge, Firefox)

Turn them on per device in **Settings → Ειδοποιήσεις**.

### Setup

1. Run `supabase/047_push_notifications.sql`, `048_heart_rate_alerts.sql` and `049_oura_webhooks.sql`, in that order, in the Supabase SQL Editor.
2. VAPID keys: `npm run push:vapid`. Put the public key in `.env` as `VITE_VAPID_PUBLIC_KEY`, and `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `supabase/functions/.env` (gitignored).
3. Android: create a Firebase project, add an Android app with package `com.lifev1.app`, and save `google-services.json` to `android/app/`. The build turns Android push on when that file exists. Then in Firebase → Project settings → Service accounts, generate a private key and add its JSON (one line) as `FCM_SERVICE_ACCOUNT` in `supabase/functions/.env`.
4. Upload the secrets and deploy:

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy push-dispatch oura-webhook oura-webhook-subscriptions
```

   `OURA_WEBHOOK_VERIFICATION_TOKEN` (any random string) goes in `supabase/functions/.env` too. Then call `oura-webhook-subscriptions` once to register the Oura webhooks (it runs daily afterwards to renew them); events land in `oura_webhook_events`.

5. Ship the clients: `npm run web:deploy` (iPhone/browsers), `npm run cap:build:apk` (Android), `npm run electron:release` (desktop).

## Features

- **Projects** — Visual planning for milestones, goals, and workstreams
- **Lifeline** — Daily rhythm view for habits, checkpoints, and progress
- **Self** — Personal metrics and Oura integration
- **Cloud sync** — Projects saved across devices when signed in
- **Desktop auto-update** — New versions delivered automatically

## Philosophy

lifev1 helps you organize your life with intention — see where you are, where you're going, and how you're doing along the way.
