# Clerk + Supabase JWT Setup Guide

## 1. Get Supabase JWT Secret
1. Go to [Supabase Project Settings > API](https://supabase.com/dashboard/project/hmtkayufelqyfytpmdtl/settings/api)
2. Under **JWT Settings** (or API section), copy the **JWT Secret** value.
3. Keep it safe (you'll paste it into Clerk).

## 2. Create Clerk JWT Template (Supabase)
1. Go to [Clerk Dashboard → JWT Templates](https://dashboard.clerk.com/last-active?path=/jwt-templates)
2. Click **New Template** → **Supabase** (recommended)
3. **Name**: `supabase` (must be exactly lowercase)
4. **Signing Key / Secret**: Paste the Supabase JWT Secret you copied in step 1
5. **Claims JSON** (note: `sub` is reserved by Clerk; do NOT include it):
```json
{
  "aud": "authenticated",
  "role": "authenticated",
  "user_id": "{{user.id}}",
  "email": "{{user.primary_email_address}}"
}
```
6. Click **Save**

## 3. Apply SQL Migrations
Run these in [Supabase SQL Editor](https://supabase.com/dashboard/project/hmtkayufelqyfytpmdtl/sql/new):

- `supabase/migrations/20261005_clerk_rls_jwt_setup.sql` (enable RLS + policies)
- `supabase/migrations/20261005_recover_labels_and_backfill_userid.sql` (backfill + default labels)

If you have a recent backup with labels/junctions, restore it **before** running the recovery migration.

## 4. Environment
`NEXT_PUBLIC_ENABLE_PURGE=1` is already set in `.env.local` (purge runs after auth resolves).

## Notes on RLS
The RLS policies in the migrations compare against `auth.jwt() ->> 'sub'` by default (Supabase uses `sub` from the JWT). With Clerk's Supabase template, Clerk sets `sub` automatically; we also include `user_id` in claims for convenience. The policies use `auth.jwt() ->> 'sub'` to match your schema expectations.
