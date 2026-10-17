# Diamond Contacts — Accessibility & Mobile Layout Improvement Plan

Findings from the UI/UX review of `diamond-contacts` (standalone Capacitor app) and the related patient-form work in `diamond-link-original`, grouped by **category** and scheduled in **phases 0 → N**. Each phase carries a completion progress bar (`done / total`). All findings are currently `open` (0% complete).

---

## Phase 0 — Critical blockers (keyboard / mobile / touch)

**Progress:** `[....................] 0% (0/3)`

| # | Category | Severity | Location | Finding | Impact | Suggested fix | Status |
|---|----------|----------|----------|---------|--------|---------------|--------|
| 1 | Navigation & Keyboard | High | `components/contacts/ContactTable.tsx:251` | Table rows use `onClick` on `<tr>` with no `role="button"`, `tabIndex`, or `onKeyDown`. Keyboard-only and screen-reader users cannot open a contact from the table. | Blocks keyboard users entirely from the primary list view. | Add `role="button" tabIndex={0}` + `onKeyDown={(e)=>{if(e.key==='Enter')onOpen(contact)}}` and an `aria-label`, or move the click to a focusable element. | open |
| 2 | Mobile Layout | High | `components/contacts/columns.ts:13-18` | Phone, email, labels, expediente, updated, status are all `hiddenMobile`. On phones the table shows only "Nombre"; every other field is unreachable without opening the detail sheet. | Core contact data hidden on mobile; no card/list fallback for narrow screens. | Add a mobile card/list view, or keep phone + expediente visible at `sm`/`md` and expose hidden columns via a "More" toggle. | open |
| 3 | Touch Targets | High | `components/contacts/ContactTable.tsx:280,374-425` | Action buttons use `p-1.5` with lucide `size={15}` and the fav-star is bare `size={15}` with no padding — below the 24×24 CSS px WCAG 2.1 target-size minimum. | Hard to tap accurately on phones; mis-taps on destructive actions (delete/purge). | Bump icons to `size={18–20}` and/or add padding so the hit area is ≥24×24 px; test on a real device. | open |

---

## Phase 1 — Menus, overlays & focus

**Progress:** `[....................] 0% (0/3)`

| # | Category | Severity | Location | Finding | Impact | Suggested fix | Status |
|---|----------|----------|----------|---------|--------|---------------|--------|
| 4 | Menus & Overlays | Medium | `components/contacts/ColumnVisibilityDropdown.tsx:72` | Declares `role="menu"` but has no `aria-activedescendant`, no arrow-key navigation, no focus-trap, `focus:outline-none` removes focus indicators, and focus isn't returned to the trigger on close. | Screen-reader and keyboard users cannot operate the column-picker reliably. | Implement full menu keyboard management (arrow keys, Enter/Space, focus return) or replace with a plain disclosure/checkbox list (`role="listbox"` or buttons). | open |
| 5 | Menus & Overlays | Medium | `components/contacts/ContactDetailSheet.tsx:204-262`; `components/contacts/MobileSidebarSheet.tsx:33-39` | Sheets/modals open overlays without trapping focus or returning focus to the trigger on close. Tab can escape behind the overlay. | Keyboard users lose context; screen readers may announce background content. | Add focus containment (or at minimum restore focus to the trigger on close); give the sheet panel `aria-modal="true"` + `aria-labelledby` pointing at the `<h2>`. | open |
| 6 | Focus & Scroll | Medium | `components/contacts/MobileSidebarSheet.tsx:24` | `document.body.style.overflow='hidden'` doesn't reliably lock scroll on iOS Safari. | Background page still scrolls behind the sheet on iPhone/iPad. | Add `touch-action: none` on the overlay and use a robust scroll-lock (`position: fixed` + `top: -scrollY`). | open |

---

## Phase 2 — Communications & announcements

**Progress:** `[....................] 0% (0/4)`

| # | Category | Severity | Location | Finding | Impact | Suggested fix | Status |
|---|----------|----------|----------|---------|--------|---------------|--------|
| 7 | Communications | Medium | `app/layout.tsx:50` (`format-detection content="telephone=no"`) | Phone numbers render as plain text; no `tel:` links, so tap-to-call is disabled from the table/sheet. | Users must manually copy/dial numbers on mobile. | Render the primary phone as `<a href={`tel:${digits}`}>` alongside the QuickActions chips. | open |
| 8 | Communications | Low | `components/contacts/ContactTable.tsx:74-94` | Sort header buttons lack `aria-sort`, so screen readers can't convey the active column or direction. | Sort state opaque to assistive tech. | Add `aria-sort={active ? (dir==='asc'?'ascending':'descending'):'none'}` to each header button. | open |
| 9 | Communications | Low | `components/contacts/ContactDetailSheet.tsx:175-184` | Clipboard copy swaps text/icon ("Copiado") but no `aria-live` region announces it. | Screen-reader users get no feedback that the ID was copied. | Wrap the status text in a polite `aria-live="polite"` region. | open |
| 10 | Communications | Low | `components/contacts/ContactDetailSheet.tsx:286-313` | Icon-only sheet buttons (Agendar, Favorito, Imprimir, Papelera) rely on `title` only, which isn't reliably exposed to assistive tech. | Icon buttons unlabeled for screen readers. | Add explicit `aria-label` to each icon-only button. | open |

---

## Phase 3 — Configuration & hydration

**Progress:** `[....................] 0% (0/2)`

| # | Category | Severity | Location | Finding | Impact | Suggested fix | Status |
|---|----------|----------|----------|---------|--------|---------------|--------|
| 11 | Configuration | Low | `app/layout.tsx:49,64` | `suppressHydrationWarning` on `<html>` and `<body>` masks real hydration mismatches that can cause focus/order surprises on first paint. | Potential focus/reading-order issues hidden at load. | Resolve the underlying mismatch instead of suppressing. | open |
| 12 | Configuration | Low | `src/lib/monolith.ts:9` | `MONOLITH_BASE` defaults to `https://app.dentaldiamondhn.com` when `NEXT_PUBLIC_MONOLITH_BASE` is unset. Non-prod environments silently link to production. | Dev/staging EHR buttons may redirect to production. | Require the env var or default to localhost/relative in non-prod. | open |

---

## Notes

- `diamond-link-original` (monolith) patient form: labels are properly associated via `htmlFor`↔`id` (113 `<label>` elements incl. `#telefono`/`#contacto_telefono`); no `position: fixed` introduced; the recent EHR-link commits added no new a11y regressions.
- diamond-contacts is a Capacitor mobile shell (`capacitor.config.ts` `server.url`), so mobile layout and touch-target findings apply directly to the installed app, not just the web view.

## Suggested execution order

1. Phase 0 — Critical blockers (F1–F3): blocks keyboard users entirely.
2. Phase 1 — Menus, overlays, focus (F4–F6): high-traffic controls.
3. Phase 2 — Communications & announcements (F7–F10).
4. Phase 3 — Configuration & hydration (F11–F12).
