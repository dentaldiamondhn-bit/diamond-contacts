import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

const supabase = createClient();

// PATCH /api/contacts/tags/[id] - Rename / recolor a label
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const patch: { name?: string; color?: string } = {};
    if (typeof body.name === 'string') {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      patch.name = name;
    }
    if (typeof body.color === 'string' && body.color) {
      patch.color = body.color;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('contact_labels')
      .select('user_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('contact_labels')
      .update(patch)
      .eq('id', id)
      .select('id, name, color')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Duplicate label name' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ tag: data });
  } catch (error) {
    console.error('Error updating contact label:', error);
    return NextResponse.json({ error: 'Failed to update label' }, { status: 500 });
  }
}

// DELETE /api/contacts/tags/[id] - Delete a label (junctions cascade)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('contact_labels')
      .select('user_id')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Label not found' }, { status: 404 });
    }
    if (existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('contact_labels').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contact label:', error);
    return NextResponse.json({ error: 'Failed to delete label' }, { status: 500 });
  }
}