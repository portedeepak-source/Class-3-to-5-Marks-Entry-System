# User/Teacher Upload Rectification Guide

This patch addresses common reasons why teacher upload fails in Supabase projects:

1. **Edge Function missing admin verification**: non-admin users were able to call create-user or requests failed without clear errors.
2. **Auth and DB inserts not transactional**: auth user creation succeeded but DB insert failed, leaving orphan auth accounts.
3. **Frontend bulk upload lacked per-row diagnostics**: CSV failures were difficult to track.
4. **CORS and auth headers not handled consistently**.

## What was implemented

- A robust `create-user` Edge Function with:
  - `Authorization` token validation.
  - Admin-role check against `public.users`.
  - Auth user creation and rollback (`deleteUser`) if DB insert fails.
  - CORS support (`OPTIONS`) and consistent JSON error responses.
- Frontend admin upload module:
  - Single-user creation form.
  - CSV bulk upload parser with required headers: `name,email,role`.
  - Row-wise success/failure tracking and clear status output.
- SQL notes for constraints and RLS alignment.

## Deployment checklist

1. In Supabase project settings, confirm Edge Function env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Deploy function:
   - `supabase functions deploy create-user`
3. Apply SQL migrations/notes if needed.
4. Update `frontend/admin.html` with real project values:
   - `window.SUPABASE_URL`
   - `window.SUPABASE_ANON_KEY`
5. Ensure at least one admin row exists in `public.users` with matching `auth_id`.

## CSV format

```csv
name,email,role
John Doe,john@school.edu,teacher
Jane Admin,jane@school.edu,admin
```

## Expected response

On success, API returns created row and temporary password when password is auto-generated.
