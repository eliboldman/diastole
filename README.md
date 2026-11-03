# Diastole

Coaching platform that reads recovery from Garmin and Apple Watch, flags each athlete's readiness against their own baseline, and sends coach-approved workouts to their watch.

- Web: Next.js (App Router) on Vercel
- Backend: Supabase (Postgres, auth, row-level security)
- Integrations: Garmin Connect Developer Program (Health, Activity, Training APIs)

## Develop

```bash
npm install
npm run dev          # http://localhost:3000 (needs .env.local)
npm run test:db      # row-level security tests (in-memory Postgres)
npm run test:readiness
npm run test:workouts
```
