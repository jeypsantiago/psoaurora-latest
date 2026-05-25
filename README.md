<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PSA Aurora PocketBase App

This repo now targets self-hosted PocketBase for auth, app state, and media storage.

## Run Locally

1. Install dependencies:

   `npm install`

2. Create `.env.local` with:

   ```env
   VITE_POCKETBASE_URL=http://127.0.0.1:8090
   GEMINI_API_KEY=your_gemini_key
   ```

3. Start PocketBase separately, then bootstrap the required collections:

   ```powershell
   $env:POCKETBASE_URL="http://127.0.0.1:8090"
   $env:POCKETBASE_SUPERUSER_EMAIL="admin@example.com"
   $env:POCKETBASE_SUPERUSER_PASSWORD="your-password"
   npm run pocketbase:bootstrap
   ```

4. Start the app:

   `npm run dev`

## PocketBase Collections

The app uses:

- auth collection `users`
- base collection `app_state`
- base collection `landing_assets`

## Password Recovery

This PocketBase deployment is configured for office-style admin/manual resets:

- admins can set/reset user passwords
- logged-in users can change their own password
- email recovery is intentionally disabled

## Connectivity & Ops

Settings includes:

- backend connectivity checks
- public landing sync checks
- public census sync checks
- host command runner for `health-public` and `start:prod`

To enable one-click host commands:

- `npm run ops:runner`
- or `quick-run\start-ops-runner.cmd`

Optional runner environment variables:

- `AURORA_RUNNER_HOST`
- `AURORA_RUNNER_PORT`
- `AURORA_RUNNER_ALLOWED_ORIGINS`
- `AURORA_RUNNER_TOKEN`

## Smoke Checks

Set these in `.env.local` or `.env.smoke.local`:

- `SMOKE_EMAIL`
- `SMOKE_PASSWORD`

Then run:

```powershell
npm run smoke:landing-settings
```

## Public Health Check

Run after frontend deployment:

```powershell
$env:POCKETBASE_URL="https://pb.example.com"
npm run health:public -- --frontend https://www.pso-aurora.com --backend https://pb.example.com --timeout-ms 12000
```
