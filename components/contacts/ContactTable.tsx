'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Delete,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  Merge,
  Pencil,
  Phone,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContactSort, ContactSortKey, LocalContact, LocalLabel } from '@/lib/contacts/db';
import { formatDate, fullName, primaryEmail, primaryPhone } from '@/lib/contacts/db';
import { COLUMNS, SORTABLE_COLUMN_KEYS, type ContactColumn } from './columns';
import { ContactQuickActions } from './ContactQuickActions';
import { ContactAvatar } from './ContactAvatar';

interface ContactTableProps {
  contacts: LocalContact[];
  selection: Set<string>;
  columnVisibility: Set<string>;
  sort: ContactSort;
  isTrash: boolean;
  loading: boolean;
  labelMap: Map<string, LocalLabel>;
  onToggleSort: (key: ContactSortKey) => void;
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onOpen: (c: LocalContact) => void;
  onQuickEdit: (c: LocalContact) => void;
  onOpenEhr: (c: LocalContact) => void;
  onDelete: (c: LocalContact) => void;
  onRestore: (c: LocalContact) => void;
  onToggleFavorite: (c: LocalContact) => void;
  onExportSelected: () => void;
  onMergeSelected: () => void;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  onRestoreSelected: () => void;
  onPurgeSelected: () => void;
}

function SortableHeader({
  column,
  sort,
  onToggle,
}: {
  column: ContactColumn;
  sort: ContactSort;
  onToggle: (key: ContactSortKey) => void;
}) {
  const active = sort.key === column.key;
  return (
    <th className={cn('pb-3', column.hiddenMobile && 'hidden sm:table-cell', column.className)}>
      <button
        onClick={() => onToggle(column.key as ContactSortKey)}
        className={cn(
          'inline-flex items-center gap-1 text-sm font-medium hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors',
          active ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400',
        )}
      >
        {column.label}
        {active ? (
          sort.dir === 'asc' ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          )
        ) : (
          <ArrowUpDown size={13} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

export function ContactTable({
  contacts,
  selection,
  columnVisibility,
  sort,
  isTrash,
  loading,
  labelMap,
  onToggleSort,
  onToggleSelectAll,
  onToggleSelect,
  onOpen,
  onQuickEdit,
  onOpenEhr,
  onDelete,
  onRestore,
  onToggleFavorite,
  onExportSelected,
  onMergeSelected,
  onArchiveSelected,
  onDeleteSelected,
  onRestoreSelected,
  onPurgeSelected,
}: ContactTableProps) {
  const allSelected = contacts.length > 0 && contacts.every((c) => selection.has(c.id));
  const selectionCount = selection.size;
  const phoneVisible = columnVisibility.has('phone');
  const emailVisible = columnVisibility.has('email');
  const labelsVisible = columnVisibility.has('labels');
  const expedienteVisible = columnVisibility.has('expediente');
  const updatedVisible = columnVisibility.has('updated');
  const cellCls = (visible: boolean) => cn('py-3 pr-4', visible ? 'hidden sm:table-cell' : 'hidden');
  const expedienteCellCls = (visible: boolean) => cn('py-3 pr-4', visible ? 'hidden md:table-cell' : 'hidden');

  if (loading) {
    return (
      <div className="p-4 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 animate-pulse">
            <div className="w-4 h-4 rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3.5 w-40 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
            <div className="h-3.5 w-28 rounded bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />
            <div className="h-3.5 w-28 rounded bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {selectionCount > 0 && (
        <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-blue-50/60 dark:bg-blue-500/5 px-4 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mr-2">
            {selectionCount} seleccionado{selectionCount > 1 ? 's' : ''}
          </span>
          <button
            onClick={onExportSelected}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Download size={14} /> Exportar
          </button>
          <button
            onClick={onMergeSelected}
            disabled={selectionCount < 2}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title={selectionCount < 2 ? 'Selecciona al menos 2 contactos' : 'Combinar duplicados'}
          >
            <Merge size={14} /> Combinar
          </button>
          {isTrash ? (
            <>
              <button
                onClick={onRestoreSelected}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <RotateCcw size={14} /> Restaurar
              </button>
              <button
                onClick={onPurgeSelected}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-800 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              >
                <Delete size={14} /> Eliminar definitivamente
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onArchiveSelected}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
              >
                <Check size={14} /> Archivar
              </button>
              <button
                onClick={onDeleteSelected}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-white dark:bg-zinc-800 border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-0">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="pb-3 pl-4 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="accent-blue-600 cursor-pointer"
                  aria-label="Seleccionar todos"
                />
              </th>
              {COLUMNS.filter((col) => columnVisibility.has(col.key)).map((col) =>
                SORTABLE_COLUMN_KEYS.has(col.key) ? (
                  <SortableHeader key={col.key} column={col} sort={sort} onToggle={onToggleSort} />
                ) : (
                  <th
                    key={col.key}
                    className={cn('pb-3', col.hiddenMobile && 'hidden md:table-cell', col.className)}
                  >
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{col.label}</span>
                  </th>
                ),
              )}
              <th className="pb-3 w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
            {contacts.map((contact) => {
              const name = fullName(contact);
              const phone = primaryPhone(contact);
              const email = primaryEmail(contact);
              const selected = selection.has(contact.id);
              return (
                <tr
                  key={contact.id}
                  onClick={() => onOpen(contact)}
                  className={cn(
                    'group cursor-pointer transition-colors',
                    selected ? 'bg-blue-50/70 dark:bg-blue-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40',
                  )}
                >
                  <td className="py-3 pl-4 w-8" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(contact.id)}
                      className="accent-blue-600 cursor-pointer"
                      aria-label={`Seleccionar ${name}`}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {!isTrash && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(contact);
                          }}
                          className={cn(
                            'text-zinc-300 dark:text-zinc-600 hover:text-amber-500 transition-colors',
                            contact.is_favorite && 'text-amber-400 hover:text-amber-500',
                          )}
                          title={contact.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        >
                          {contact.is_favorite ? <Star size={15} className="fill-amber-400" /> : <StarOff size={15} />}
                        </button>
                      )}
                      <ContactAvatar name={name} />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 dark:text-white text-sm truncate">{name || 'Sin nombre'}</p>
                        {contact.is_archived && !isTrash && (
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Archivado</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className={cellCls(phoneVisible)} onClick={(e) => e.stopPropagation()}>
                    {phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone size={13} className="text-zinc-400 shrink-0" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-300">{phone.phone_number}</span>
                        <span className="hidden group-hover:inline-flex items-center ml-0.5">
                          <ContactQuickActions phone={phone.phone_number} patientName={name} size="sm" />
                        </span>
                      </div>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className={cellCls(emailVisible)}>
                    {email ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                        <Mail size={13} className="text-zinc-400 shrink-0" />
                        {email.email}
                      </span>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className={cellCls(labelsVisible)} onClick={(e) => e.stopPropagation()}>
                    {contact.label_ids.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {contact.label_ids.slice(0, 2).map((id) => {
                          const label = labelMap.get(id);
                          if (!label) return null;
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                              style={{ backgroundColor: label.color }}
                            >
                              {label.name}
                            </span>
                          );
                        })}
                        {contact.label_ids.length > 2 && (
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            +{contact.label_ids.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className={expedienteCellCls(expedienteVisible)} onClick={(e) => e.stopPropagation()}>
                    {contact.patient_id ? (
                      <button
                        onClick={() => onOpenEhr(contact)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                        title="Expediente EHR vinculado"
                      >
                        <FileText size={12} /> Vinculado
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                        <FileText size={12} /> Sin expediente
                      </span>
                    )}
                  </td>
                  <td className={cn('py-3 pr-4', updatedVisible ? 'hidden sm:table-cell' : 'hidden')}>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{formatDate(contact.updated_at)}</span>
                  </td>
                  <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isTrash ? (
                        <>
                          <button
                            onClick={() => onRestore(contact)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Restaurar"
                          >
                            <RotateCcw size={15} />
                          </button>
                          <button
                            onClick={() => onDelete(contact)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Eliminar definitivamente"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onOpen(contact)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Ver detalles"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={() => onQuickEdit(contact)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          {contact.patient_id && (
                            <button
                              onClick={() => onOpenEhr(contact)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/10"
                              title="Abrir Expediente EHR"
                            >
                              <ExternalLink size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(contact)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Mover a papelera"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}