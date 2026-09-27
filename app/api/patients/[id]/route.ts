import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const patientId = id;

    if (!patientId) {
      return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
    }

    // Fetch patient data
    const { data: patient, error } = await supabase
      .from('patients')
      .select('*')
      .eq('paciente_id', patientId)
      .single();

    if (error) {
      console.error('Error fetching patient:', error);
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch patient' }, { status: 500 });
    }

    return NextResponse.json(patient, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error in GET /api/patients/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
