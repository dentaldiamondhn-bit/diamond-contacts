'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { useUser } from '@clerk/nextjs';
import { Search, Plus, Stethoscope } from 'lucide-react';
import type {
  ContactFilter,
  ContactSort,
  ContactSortKey,
  LocalContact,
} from '@/lib/contacts/db';
import {
  db,
  getLabels,
  getMedicalHistory,
  getRecentMedicalHistoryCount,
  queryContacts,
  sortContacts,
} from '@/lib/contacts/db';
import {
  createLocalLabel,
  deleteLocalLabel,
  initContactsSync,
  permanentlyDeleteLocalContact,
  restoreLocalContact,
  softDeleteLocalContact,
  toggleFavoriteLocal,
  updateLocalContact,
  updateLocalLabel,
} from '@/lib/contacts/syncEngine';
import { exportContacts } from '@/lib/contacts/vcard';
import { ContactSidebar } from '@/components/contacts/ContactSidebar';
import { COLUMNS } from '@/components/contacts/columns';
import { ContactTable } from '@/components/contacts/ContactTable';
import { ColumnVisibilityDropdown } from '@/components/contacts/ColumnVisibilityDropdown';
import { ContactDetailSheet } from '@/components/contacts/ContactDetailSheet';
import { ContactEditorModal } from '@/components/contacts/ContactEditorModal';
import { MedicalHistoryModal } from '@/components/contacts/MedicalHistoryModal';
import { DeleteContactModal } from '@/components/contacts/DeleteContactModal';
import { ImportExportModal } from '@/components/contacts/ImportExportModal';
import { Button } from '@/components/ui/button';
import { UserPreferencesService } from '@/services/userPreferencesService';

type EditorState = { open: boolean; editing: LocalContact | null };

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Hydration-safe snapshot of navigator.onLine (always "online" for SSR HTML). */
function getOnlineSnapshot(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

const ONLINE_SSR_SNAPSHOT = true;

const ALL_COLUMN_KEYS = COLUMNS.map((c) => c.key);

export default function ContactosPage() {
  const { user } = useUser();
  const router = useRouter();
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [columnVisibility, setColumnVisibility] = useState<Set<string>>(new Set(ALL_COLUMN_KEYS));
  const columnPrefsLoaded = useRef(false);
  const [sort, setSort] = useState<ContactSort>({ key: 'name', dir: 'asc' });
  const [sheetContact, setSheetContact] = useState<LocalContact | null>(null);
  const [editor, setEditor] = useState<EditorState>({ open: false, editing: null });
  const [medicalEditor, setMedicalEditor] = useState<LocalContact | null>(null);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LocalContact[] | null>(null);
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, () => ONLINE_SSR_SNAPSHOT);
  const syncRef = useRef<{ syncNow: () => Promise<number> } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const userId = user?.id;

  const contacts = useLiveQuery(() => queryContacts(filter, search), [filter, search]);
  const pendingCount = useLiveQuery(() => db.contacts.where('synced').equals(0).count(), []);
  const labels = useLiveQuery(() => (userId ? getLabels(userId) : Promise.resolve([])), [userId]);
  const recentHistoryCount = useLiveQuery(() => getRecentMedicalHistoryCount(), []);
  const medical = useLiveQuery(
    () => (sheetContact ? getMedicalHistory(sheetContact.id) : Promise.resolve(undefined)),
    [sheetContact?.id],
  );

  const activeBase = useLiveQuery(
    () => db.contacts.where('deleted').equals(0).toArray(),
    [],
  );
  const trashCount = useLiveQuery(() => db.contacts.where('deleted').equals(1).count(), []);

  useEffect(() => {
    if (!userId) return;
    const sync = initContactsSync(userId);
    syncRef.current = sync;
    return () => sync.unsubscribe();
  }, [userId]);

  // Column visibility loads from Supabase user_preferences (page_preferences.contactos).
  useEffect(() => {
    if (!userId || columnPrefsLoaded.current) return;
    (async () => {
      const prefs = await UserPreferencesService.getPagePreferences(userId, 'contactos');
      const raw = prefs?.columnVisibility;
      const stored = Array.isArray(raw) ? raw.filter((k) => ALL_COLUMN_KEYS.includes(k)) : null;
      const next = stored !== null ? new Set<string>(stored) : new Set<string>(ALL_COLUMN_KEYS);
      setColumnVisibility(next);
      columnPrefsLoaded.current = true;
    })();
  }, [userId]);

  // Persist on change (fire-and-forget, same path as other pages).
  useEffect(() => {
    if (!userId || !columnPrefsLoaded.current) return;
    const ordered = COLUMNS.map((c) => c.key).filter((k) => columnVisibility.has(k));
    UserPreferencesService.updatePagePreferences(userId, 'contactos', { columnVisibility: ordered }).catch(() => {});
  }, [columnVisibility, userId]);

  const toggleColumn = (key: string) =>
    setColumnVisibility((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Keyboard shortcuts: "/" => search, "c" => create, Escape => close overlays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === 'Escape') {
        setSheetContact(null);
        setMedicalEditor(null);
        setEditor((s) => (s.open ? { ...s, open: false } : s));
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === 'c') {
        if (!editor.open) {
          setEditor({ open: true, editing: null });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor.open]);

  const counts = useMemo(
    () => ({
      all: activeBase?.filter((c) => !c.is_archived).length ?? 0,
      favorites: activeBase?.filter((c) => !c.is_archived && c.is_favorite).length ?? 0,
      archived: activeBase?.filter((c) => c.is_archived).length ?? 0,
      recentHistory: recentHistoryCount ?? 0,
      trash: trashCount ?? 0,
    }),
    [activeBase, trashCount, recentHistoryCount],
  );

  // Number of non-archived contacts linked to each label (mirrors the label filter).
  const labelCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of activeBase ?? []) {
      if (c.is_archived) continue;
      for (const id of c.label_ids) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [activeBase]);

const labelList = useMemo(() => labels ?? [], [labels]);
  const labelMap = useMemo(() => new Map(labelList.map((l) => [l.id, l])), [labelList]);
  const contactList = useMemo(() => contacts ?? [], [contacts]);

  // Prune selection to ids that still exist in the current result set.
  const prunedSelection = useMemo(() => {
    const ids = new Set(contactList.map((c) => c.id));
    return new Set([...selection].filter((id) => ids.has(id)));
  }, [selection, contactList]);

  const sorted = useMemo(() => sortContacts(contactList, sort), [contactList, sort]);
  const isTrash = filter === 'trash';

  const selectFilter = (next: ContactFilter) => {
    setFilter(next);
    setSelection(new Set());
  };

  const toggleSort = (key: ContactSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  // ---- Bulk actions -------------------------------------------------------
  const selectedContacts = useMemo(
    () => contactList.filter((c) => prunedSelection.has(c.id)),
    [contactList, prunedSelection],
  );

  const toggleSelectAll = () => {
    if (contactList.length === 0) return;
    const next = prunedSelection.size === contactList.length ? new Set<string>() : new Set(contactList.map((c) => c.id));
    setSelection(next);
  };

  const toggleSelect = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportSelected = () => exportContacts(selectedContacts);

  const mergeSelected = async () => {
    if (selectedContacts.length < 2) return;
    const [keep, ...rest] = selectedContacts;
    const seenPhones = new Set(keep.phones.map((p) => p.phone_number.replace(/\D/g, '')));
    const seenEmails = new Set(keep.emails.map((e) => e.email.toLowerCase()));
    for (const c of rest) {
      for (const p of c.phones) {
        if (!seenPhones.has(p.phone_number.replace(/\D/g, ''))) keep.phones.push(p);
      }
      for (const e of c.emails) {
        if (!seenEmails.has(e.email.toLowerCase())) keep.emails.push(e);
      }
      for (const id of c.label_ids) {
        if (!keep.label_ids.includes(id)) keep.label_ids.push(id);
      }
    }
    await updateLocalContact(keep.id, {
      phones: keep.phones,
      emails: keep.emails,
      label_ids: keep.label_ids,
      first_name: keep.first_name ?? '',
      last_name: keep.last_name ?? '',
      company: keep.company ?? '',
      job_title: keep.job_title ?? '',
      notes: keep.notes ?? '',
    });
    for (const c of rest) await softDeleteLocalContact(c.id);
    setSelection(new Set());
  };

  const archiveSelected = async () => {
    for (const c of selectedContacts) await updateLocalContact(c.id, { is_archived: true });
    setSelection(new Set());
  };

  const trashSelected = async () => {
    setPendingDelete([...selectedContacts]);
  };

  const restoreSelected = async () => {
    for (const c of selectedContacts) await restoreLocalContact(c.id);
    setSelection(new Set());
  };

  const purgeSelected = async () => {
    setPendingDelete([...selectedContacts]);
  };

  // ---- Single-contact actions ----------------------------------------------
  const openEditor = (c: LocalContact | null) => setEditor({ open: true, editing: c });
  const closeEditor = () => setEditor({ open: false, editing: null });

  const handleDelete = (c: LocalContact) => setPendingDelete([c]);

  const handleRestore = async (c: LocalContact) => {
    await restoreLocalContact(c.id);
    setSheetContact(null);
  };

  const confirmPendingDelete = async () => {
    const targets = pendingDelete ?? [];
    if (targets.length === 0) return;
    const permanent = targets[0].deleted === 1;
    for (const c of targets) {
      if (permanent) await permanentlyDeleteLocalContact(c.id);
      else await softDeleteLocalContact(c.id);
    }
    setPendingDelete(null);
    setSelection(new Set());
    setSheetContact((prev) => (prev && targets.some((t) => t.id === prev.id) ? null : prev));
  };

  const handleToggleFavorite = async (c: LocalContact) => {
    await toggleFavoriteLocal(c.id);
    setSheetContact((prev) => (prev && prev.id === c.id ? { ...prev, is_favorite: !prev.is_favorite } : prev));
  };

  const handleAddLabel = async (name: string, color?: string) => {
    if (!userId) return;
    await createLocalLabel(userId, name, color);
  };

  const handleRenameLabel = async (id: string, name: string, color: string) => {
    if (!userId) return;
    await updateLocalLabel(userId, id, { name, color });
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (!userId) return;
    await deleteLocalLabel(userId, labelId);
    if (typeof filter === 'object' && filter.labelId === labelId) {
      setFilter('all');
      setSelection(new Set());
      setSheetContact(null);
    }
  };

  const handleToggleLabel = async (c: LocalContact, labelId: string) => {
    const next = c.label_ids.includes(labelId)
      ? c.label_ids.filter((id) => id !== labelId)
      : [...c.label_ids, labelId];
    await updateLocalContact(c.id, { label_ids: next });
    setSheetContact((prev) => (prev && prev.id === c.id ? { ...prev, label_ids: next } : prev));
  };

  const openEhr = (c: LocalContact) => {
    if (c.patient_id) router.push(`/patient-preview/${c.patient_id}`);
  };

  const handleResync = () => void syncRef.current?.syncNow();

  const loading = contacts === undefined;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-zinc-50 dark:bg-zinc-950">
      <ContactSidebar
        labels={labelList}
        activeFilter={filter}
        counts={counts}
        labelCounts={labelCounts}
        pendingCount={pendingCount ?? 0}
        isOnline={isOnline}
        onCreate={() => openEditor(null)}
        onSelect={selectFilter}
        onAddLabel={handleAddLabel}
        onRenameLabel={handleRenameLabel}
        onDeleteLabel={handleDeleteLabel}
        onImportExport={() => setImportExportOpen(true)}
        onResync={handleResync}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header / search */}
        <header className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Buscar contactos...  (  /  )"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 rounded-lg focus:outline-none focus:bg-white dark:focus:bg-zinc-700 focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          <Button onClick={() => openEditor(null)} variant="default" className="md:hidden rounded-full p-3 h-auto w-auto">
            <Plus size={18} />
          </Button>
          <div className="hidden md:block">
            <ColumnVisibilityDropdown
              columns={COLUMNS}
              visible={columnVisibility}
              onToggle={toggleColumn}
            />
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
            <kbd className="rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5">/</kbd> buscar
            <span className="mx-1">·</span>
            <kbd className="rounded border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5">c</kbd> crear
          </div>
        </header>

        {/* Content */}
        {loading ? (
          <div className="flex-1 overflow-auto">
            <ContactTable
              contacts={[]}
              selection={prunedSelection}
              columnVisibility={columnVisibility}
              sort={sort}
              isTrash={isTrash}
              loading
              labelMap={labelMap}
              onToggleSort={toggleSort}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelect={toggleSelect}
              onOpen={setSheetContact}
              onQuickEdit={() => undefined}
              onOpenEhr={() => undefined}
              onDelete={() => undefined}
              onRestore={() => undefined}
              onToggleFavorite={() => undefined}
              onExportSelected={() => undefined}
              onMergeSelected={() => undefined}
              onArchiveSelected={() => undefined}
              onDeleteSelected={() => undefined}
              onRestoreSelected={() => undefined}
              onPurgeSelected={() => undefined}
            />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            isTrash={isTrash}
            isLabel={typeof filter === 'object'}
            isHistory={filter === 'recentHistory'}
            onCreate={() => openEditor(null)}
            searchTerm={search}
          />
        ) : (
          <div className="flex-1 overflow-auto">
            <ContactTable
              contacts={sorted}
              selection={prunedSelection}
              columnVisibility={columnVisibility}
              sort={sort}
              isTrash={isTrash}
              loading={false}
              labelMap={labelMap}
              onToggleSort={toggleSort}
              onToggleSelectAll={toggleSelectAll}
              onToggleSelect={toggleSelect}
              onOpen={setSheetContact}
              onQuickEdit={(c) => openEditor(c)}
              onOpenEhr={openEhr}
              onDelete={handleDelete}
              onRestore={handleRestore}
              onToggleFavorite={handleToggleFavorite}
              onExportSelected={exportSelected}
              onMergeSelected={mergeSelected}
              onArchiveSelected={archiveSelected}
              onDeleteSelected={trashSelected}
              onRestoreSelected={restoreSelected}
              onPurgeSelected={purgeSelected}
            />
          </div>
        )}
      </main>

      <ContactDetailSheet
        contact={sheetContact}
        labels={labelList}
        medical={medical}
        onClose={() => setSheetContact(null)}
        onEdit={openEditor}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDelete}
        onRestore={handleRestore}
        onToggleLabel={handleToggleLabel}
        onAddLabel={handleAddLabel}
        onEditMedical={setMedicalEditor}
      />

      <ContactEditorModal
        key={`${editor.editing?.id ?? 'new'}-${editor.open}`}
        open={editor.open}
        editing={editor.editing}
        userId={userId}
        labels={labelList}
        onClose={closeEditor}
      />

      {medicalEditor && (
        <MedicalHistoryModal
          key={`${medicalEditor.id}-${medicalEditor !== null}`}
          open={medicalEditor !== null}
          contact={medicalEditor}
          medical={medical}
          onClose={() => setMedicalEditor(null)}
        />
      )}

      {pendingDelete && pendingDelete.length > 0 && (
        <DeleteContactModal
          contacts={pendingDelete}
          onConfirm={confirmPendingDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      <ImportExportModal
        open={importExportOpen}
        userId={userId}
        allContacts={(activeBase ?? []).filter((c) => !c.is_archived)}
        onClose={() => setImportExportOpen(false)}
      />
    </div>
  );
}

function EmptyState({
  isTrash,
  isLabel,
  isHistory,
  onCreate,
  searchTerm,
}: {
  isTrash: boolean;
  isLabel: boolean;
  isHistory: boolean;
  onCreate: () => void;
  searchTerm: string;
}) {
  const title = searchTerm
    ? 'Sin resultados'
    : isTrash
      ? 'La papelera está vacía'
      : isHistory
        ? 'Sin historiales recientes'
        : isLabel
          ? 'Sin contactos con esta etiqueta'
          : 'Aún no tienes contactos';
  const subtitle = searchTerm
    ? `No se encontraron coincidencias para “${searchTerm}”.`
    : isTrash
      ? 'Los contactos eliminados aparecerán aquí por un tiempo.'
      : isHistory
        ? 'Los contactos con antecedentes médicos actualizados en los últimos 60 días aparecerán aquí.'
        : isLabel
          ? 'Agrega pacientes a esta etiqueta desde el editor de contacto.'
          : 'Crea tu primer contacto para sincronizarlo entre todos los dispositivos de la clínica.';

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-500/20 dark:to-blue-500/5 flex items-center justify-center">
          <Stethoscope size={40} className="text-blue-500 dark:text-blue-400" strokeWidth={1.5} />
        </div>
        <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500/90 flex items-center justify-center shadow">
          <Plus size={15} className="text-white" />
        </span>
      </div>
      <h3 className="mt-5 text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      {!isTrash && !searchTerm && (
        <Button onClick={onCreate} variant="outline" className="mt-5">
          <Plus size={16} className="mr-1" /> Crear primer contacto
        </Button>
      )}
    </div>
  );
}