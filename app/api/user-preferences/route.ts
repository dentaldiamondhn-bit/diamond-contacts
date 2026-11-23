import { NextRequest, NextResponse } from 'next/server';
import { createServerServiceClient } from '@/lib/supabase/server';
import { authorizeCalendar } from '@/lib/calendarAuth';

export const runtime = 'nodejs';

/** GET the current user's full preferences row (favorite_invitees, page_preferences, global_preferences). */
export async function GET(_req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const supabase = createServerServiceClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('clerk_user_id', userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    clerk_user_id: userId,
    favorite_invitees: Array.isArray(data?.favorite_invitees) ? data.favorite_invitees : [],
    page_preferences: data?.page_preferences ?? {},
    global_preferences: data?.global_preferences ?? {},
    updated_at: data?.updated_at ?? null,
  });
}

/** PUT (upsert) the current user's preferences. Accepts a partial row; only
 *  the provided fields are updated (PostgREST upsert leaves the rest intact). */
export async function PUT(req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prefs = body as Record<string, unknown>;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return NextResponse.json({ error: 'Body must be a preferences object' }, { status: 400 });
  }

  const supabase = createServerServiceClient();
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      {
        clerk_user_id: userId,
        ...prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_user_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE the current user's preferences row. */
export async function DELETE(_req: NextRequest) {
  const authz = await authorizeCalendar();
  if ('response' in authz) return authz.response;
  const { userId } = authz;

  const supabase = createServerServiceClient();
  const { error } = await supabase
    .from('user_preferences')
    .delete()
    .eq('clerk_user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
