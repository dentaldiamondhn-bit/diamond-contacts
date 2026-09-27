import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

const supabase = createClient();

// GET /api/contacts/tags - List the current user's labels
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('contact_labels')
      .select('id, name, color')
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ tags: data });
  } catch (error) {
    console.error('Error fetcing contact labels:', error);
    return NextResponse.json({ error: 'Failed to fetch labels' }, { status: 500 });
  }
}

// POST /api/contacts/tags - Create a label
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    const color = typeof body.color === 'string' && body.color ? body.color : '#6B7280';

    const { data, error } = await supabase
      .from('contact_labels')
      .insert({ user_id: userId, name, color })
      .select('id, name, color')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Duplicate label name' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating contact label:', error);
    return NextResponse.json({ error: 'Failed to create label' }, { status: 500 });
  }
}