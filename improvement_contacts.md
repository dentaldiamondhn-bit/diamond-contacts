# Diamond Contacts — Accessibility & Mobile Layout Plan

Findings from the original UI/UX review of `diamond-contacts` (standalone Capacitor app), grouped by category and scheduled in **phases 0 → 3**, plus a **Phase 4** covering the refinement work done afterwards.

Status legend: `resolved` · `partial` · `superseded` (requirement intentionally changed) · `open`

**Overall: 10 of 12 resolved** (1 partial, 1 open).

---

## Phase 0 — Critical blockers (keyboard / mobile / touch)

**Progress:** `[####################] 100% (3/3)`

| # | Category | Severity | Location | Finding | Resolution | Status |
|---|----------|----------|----------|---------|------------|--------|
| 1 | Navigation & Keyboard | High | `ContactTable.tsx` | Table rows used `onClick` on `<tr>` with no keyboard access, so keyboard-only and screen-reader users could not open a contact. | Resolved via a focusable element rather than a row role: every row now has an explicit **"Ver detalles"** button in the actions cell, and the row itself is a mouse-only convenience. See Phase 4 for why the row is deliberately *not* `role="button"`. | resolved |
| 2 | Mobile Layout | High | `columns.ts`, `app/page.tsx` | Email/labels/updated/status were `hiddenMobile`, so on phones the table showed almost nothing. | Added `ContactMobileCard.tsx` — a dedicated narrow-screen list that renders **every** field (name, phone, email, labels, expediente, updated, sync status, actions). | resolved |
| 3 | Touch Targets | High | `ContactQuickActions.tsx`, `ContactTable.tsx`, `ContactMobileCard.tsx` | `p-1` with 13px icons gave a ~21px hit area, below the 24×24 CSS px WCAG 2.2 AA minimum. | All icon buttons are now `p-2` + 16px glyph (≥24×24), and adjacent buttons are separated by `gap-2` (≥8px). | resolved |

---

## Phase 1 — Menus, overlays & focus

**Progress:** `[##############------] 67% (2/3)`

| # | Category | Severity | Location | Finding | Resolution | Status |
|---|----------|----------|----------|---------|------------|--------|
| 4 | Menus & Overlays | Medium | `ColumnVisibilityDropdown.tsx` | Menu lacked keyboard management, removed focus indicators and never returned focus to the trigger. | Rebuilt on native checkboxes with `aria-haspopup="listbox"`, `aria-expanded`, Escape handling and focus return to the trigger. Positioning now flips and clamps so it never runs off-screen. | resolved |
| 5 | Menus & Overlays | Medium | `ContactDetailSheet.tsx` | Sheets opened without trapping focus or returning it to the trigger. | Partial: the panel has `aria-modal="true"` + `aria-labelledby`, and focus moves to the close button on open. **Still outstanding:** a real focus trap, and restoring focus to the originating row/card on close. | partial |
| 6 | Focus & Scroll | Medium | `MobileSidebarSheet.tsx` | `document.body.style.overflow='hidden'` does not reliably lock scroll on iOS Safari. | Replaced with a robust lock: save `scrollY`, pin `body` with `position:fixed` + negative `top`, restore position and scroll on close, plus real `touch-none` on the overlay. | resolved |

---

## Phase 2 — Communications & announcements

**Progress:** `[####################] 100% (4/4)`

| # | Category | Severity | Location | Finding | Resolution | Status |
|---|----------|----------|----------|---------|------------|--------|
| 7 | Communications | Medium | `ContactTable.tsx`, `ContactDetailSheet.tsx`, `ContactMobileCard.tsx` | Phone numbers were plain text / `tel:` only. | **Superseded.** WhatsApp is the clinic's primary channel, so the phone number now opens the WhatsApp conversation. Call (`tel:`) and SMS remain available as explicit shortcuts in the Telefono column and in the detail sheet. | superseded |
| 8 | Communications | Low | `ContactTable.tsx` | Sort headers lacked `aria-sort`. | Added `aria-sort` reflecting the active column and direction. | resolved |
| 9 | Communications | Low | `ContactDetailSheet.tsx` | Clipboard confirmation was not announced. | Wrapped the status text in an `aria-live="polite"` region. | resolved |
| 10 | Communications | Low | `ContactDetailSheet.tsx` | Icon-only buttons relied on `title` alone. | Added explicit `aria-label` to every icon-only control. | resolved |

---

## Phase 3 — Configuration & hydration

**Progress:** `[##########--------] 50% (1/2)`

| # | Category | Severity | Location | Finding | Resolution | Status |
|---|----------|----------|----------|---------|------------|--------|
| 11 | Configuration | Low | `app/layout.tsx` | `suppressHydrationWarning` on `<html>`/`<body>` can mask real hydration mismatches. | Not addressed. Both usages are documented in-code as intentional (next-themes applies the `dark` class after mount). Resolving it properly means moving theme selection server-side. | open |
| 12 | Configuration | Low | `src/lib/monolith.ts` | `MONOLITH_BASE` defaulted to the production URL, so non-prod builds silently linked to production. | Already fixed: the constant now falls back to `''` outside production, so only production builds keep the production URL. | resolved |

---

## Phase 4 — Refinement after the original plan

### 4a. WhatsApp redirect bugs

| # | Finding | Resolution | Status |
|---|---------|------------|--------|
| 13 | Tapping a phone number opened the detail sheet instead of WhatsApp. The clickable parent re-rendered and unmounted the in-flight anchor, cancelling the queued navigation. | `stopPropagation()` on every interactive region inside the clickable card/row, plus a keydown guard so nested controls activate on their own. | resolved |
| 14 | `net::ERR_UNKNOWN_URL_SCHEME` for `whatsapp://send/…` on Android. | Root cause was navigating the *current* WebView to `wa.me`, whose server redirect to `whatsapp://` the WebView then tried to load itself. The launcher now never navigates the document; see 4c. | resolved |
| 15 | On web/PWA the launcher opened an unknown-protocol `whatsapp://` tab and never reached the `wa.me` fallback. | `@capacitor/app-launcher` ships a **web** implementation that resolves instead of throwing. Added `isNativeShell()` and made the web path synchronous. | resolved |

### 4b. Performance

| # | Finding | Resolution | Status |
|---|---------|------------|--------|
| 16 | Slow search. | The query re-ran on every keystroke, rebuilding a lowercase string per contact. Now debounced 250 ms while the input stays immediate. | resolved |
| 17 | Sluggish list. `sm:hidden` + `hidden sm:block` only changes `display`, so **both** the table and the card list were mounted — 2 × N rows and 2 × N Lottie icons, all re-rendered per keystroke. | Branched on a media query (`useIsWide`) so exactly one view is mounted. | resolved |
| 18 | Contact preview pane stuttered on open. | A framer-motion JS spring plus `backdrop-blur-2xl` on a full-height panel meant a large blur was recomputed every frame in the WebView. Replaced with a compositor-driven CSS transform and an opaque panel. | resolved |
| 19 | Long lists paid full layout/paint for off-screen rows. | `content-visibility: auto` on mobile cards. | resolved |

### 4c. Accessibility refinement

| # | Finding | Resolution | Status |
|---|---------|------------|--------|
| 20 | `role="button"` on the card and the table row. That role is *children presentational*, and on a `<tr>` it also destroys row/cell semantics. | Removed `role`/`tabIndex`/`aria-label` from both wrappers; the click is now a mouse-only convenience and the accessible route is the "Ver detalles" button. Verified in Chrome's accessibility tree: cell roles (`LayoutTableCell`) are restored and the row name is no longer the concatenation of every cell. | resolved |
| 21 | Table action buttons were `opacity-0 group-hover:`, i.e. invisible but still tappable, which caused mis-taps on destructive actions on touch tablets. | Always visible below `md`, and revealed on hover **or keyboard focus** at `md+`. | resolved |

---

## Notes

- `diamond-contacts` is a Capacitor shell (`capacitor.config.ts` `server.url`), so mobile layout and touch-target findings apply to the installed app, not just the web view.
- The same accessibility, WhatsApp and touch-target work has been mirrored into `diamond-link-original` (the monolith); commits there are marked `(mirrors diamond-contacts)`.
- `improvement_contacts.md` is kept in sync as the single source of truth for these findings.

## Suggested execution order

1. Phase 3 #11 — remove `suppressHydrationWarning` by resolving the theme-class mismatch server-side (only remaining item from the original plan).
2. Phase 1 #5 — add a real focus trap to `ContactDetailSheet` and restore focus to the originating row/card on close.