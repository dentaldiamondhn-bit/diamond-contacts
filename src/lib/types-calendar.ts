export interface ClinicEvent {
  id: number;
  user_id: string;
  title: string;
  patient_name: string;
  procedure: string;
  dentist: string;
  phone?: string;
  phone_country?: string;
  date: string;
  start_time: string;
  end_time: string;
  color: string;
  notes: string;
  description?: string;
  location?: string;
  event_type?: 'appointment' | 'consultation' | 'surgery' | 'follow_up' | 'reminder' | 'other';
  status?: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  priority?: 'low' | 'medium' | 'high';
  reminder_minutes?: number;
  patient_id?: string;
  created_at: string;
}

export const PROCEDURES = [
  'Limpieza',
  'Chequeo',
  'Restauraciones',
  'Endodoncia',
  'Corona',
  'Extracción',
  'Blanqueamiento',
  'Radiografía',
  'Ortodoncia',
  'Implante',
  'Promo 3 tapones',
  'Limpieza + 3 tapones',
];

export const NO_PROCEDURE_COLOR = '#6b7280';

/** Auto-tint swatch per Procedimiento (click the procedure, the pill adopts its color). */
export const PROCEDURE_COLORS: Record<string, string> = {
  Limpieza: '#0d9488',
  Chequeo: '#2563eb',
  Restauraciones: '#059669',
  Endodoncia: '#7c3aed',
  Corona: '#e11d48',
  Extracción: '#d97706',
  Blanqueamiento: '#0ea5e9',
  Radiografía: '#64748b',
  Ortodoncia: '#ec4899',
  Implante: '#f97316',
  'Promo 3 tapones': '#ca8a04',
  'Limpieza + 3 tapones': '#06b6d4',
};

export const EVENT_COLORS = [
  { name: 'teal', value: '#0d9488' },
  { name: 'blue', value: '#2563eb' },
  { name: 'violet', value: '#7c3aed' },
  { name: 'rose', value: '#e11d48' },
  { name: 'amber', value: '#d97706' },
  { name: 'emerald', value: '#059669' },
];