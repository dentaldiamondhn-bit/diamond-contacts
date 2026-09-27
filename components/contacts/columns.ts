export interface ContactColumn {
  key: string;
  label: string;
  lockable?: boolean;
  hiddenMobile?: boolean;
  className?: string;
}

export const SORTABLE_COLUMN_KEYS = new Set(['name', 'phone', 'email', 'labels', 'updated']);

export const COLUMNS: ContactColumn[] = [
  { key: 'name', label: 'Nombre', lockable: true },
  { key: 'phone', label: 'Teléfono', hiddenMobile: true },
  { key: 'email', label: 'Correo', hiddenMobile: true },
  { key: 'labels', label: 'Etiquetas', hiddenMobile: true },
  { key: 'expediente', label: 'Expediente', hiddenMobile: true },
  { key: 'updated', label: 'Actualizado', hiddenMobile: true },
];