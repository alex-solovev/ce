# ce-select plan

One element covers select, searchable select and multi-select. WAI-ARIA treats the plain variant as a "select-only combobox", so it's one pattern with an optional text field. Mode-specific code stays in a few named functions (trigger, key handling, selection), not scattered `if (searchable)` checks.

```html
<ce-select name="fruit" multiple searchable placeholder="Pick…" with-clear>
  <ce-option value="apple" selected>Apple</ce-option>
  <ce-option value="pear" disabled>Pear</ce-option>
</ce-select>
```

## Architecture

Follows the component structure in [conventions.md](conventions.md) (section 1).

- **Logic** (`src/ce-select/logic.ts`, `import * as logic`): the state and one function per thing that can happen. Each changes the state in place and returns the set of changed fields. No DOM, no timers, no events. Enforces invariants, so the component can't reach broken states.
- **Render** (`src/ce-select/render.ts`, `import * as render`): the template, refs, context, and functions that write the DOM from the state, updating only what changed.
- **Component** (`src/ce-select/ce-select.ts`): lifecycle, attributes, listeners. Handlers call a logic function, then `#render(changes)` (which picks the render functions), then `#fireChangeEvents(changes)` for user actions.
- **Events** only fire for user actions that change the value (`input` + `change`), never for programmatic `value` / `options` changes, matching native `<select>`.
- **Options are the light DOM.** `ce-option` children are the single source. The `options` setter generates `ce-option` children, and a `MutationObserver` turns any DOM change into one `logic.setOptions` call.

### State

| Field        | Notes                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`    | Snapshot `{ value, label, disabled, defaultSelected }[]` in DOM order. Duplicate values: first wins.                                                                            |
| `selection`  | `{ value, label }[]` in selection order. `label` is `null` until a matching option is seen. See below.                                                                          |
| `dirty`      | `false` until the user or code sets the value. While clean, the selection follows options marked `selected` (like native `<option selected>`).                                  |
| `open`       | Popup open.                                                                                                                                                                     |
| `navigation` | `ListNavigation` from `src/core/list-navigation.ts`: the highlight and keyboard movement. Its items are always the visible options; only the list-navigation helpers change it. |
| `query`      | `null` while not typing (input shows the selection), otherwise the search text. Searchable only.                                                                                |
| `config`     | `{ multiple, searchable, filter, disabled }` mirrored from attributes and the effective disabled state.                                                                         |

Derived, not stored: visible options (`query` filter unless `filter` is off), display text, form value.

### Selection is independent of options

Options are only candidates to pick from; the selection is the source of truth for the value. This avoids the "value applied, but the select shows empty" bug in async/searchable selects, where the selected option is no longer among the current options (new search results, options reloaded after navigating back in a multi-step form).

- Selecting an option stores its `value` and `label` in `selection`.
- Removing or replacing options never changes `selection`. The display keeps showing the stored label.
- A value set in code without a matching option is stored with `label: null`. When an option with that value appears, its label is filled in. Until then the display shows the raw value.
- The form value always comes from `selection`, matched or not.

**Decision:** always keep both value and label of selected options that are no longer among the options. No attribute to change this, and no "unmatched" state. Dependent fields (e.g. car make → model) are the app's job: reset the model when the make changes. A stale value stays visible and fixable; a dropped one disappears silently.

Web Awesome's `wa-select` does the opposite: it keeps unmatched values internally, but the `value` getter, form value and display label only include values whose option is currently in the DOM, which leads to exactly that empty-select bug.

### Logic functions

The component decides which calls are user actions (and fire `input` / `change`); the logic doesn't know about events.

| Function                        | Effect                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setOptions(state, options)`    | Replace snapshot. Fill/refresh labels of selected values. Clean: selection = `defaultSelected` options. Sync navigation items.                            |
| `setValues(state, values)`      | Programmatic (setters, form state restore). `dirty = true`. Labels from options, else stored, else `null`. Single: first value only.                      |
| `selectOption(state, value)`    | User, single. Ignored if disabled or option missing/disabled. Replace selection, close.                                                                   |
| `toggleOption(state, value)`    | User, multiple. Same guards. Add or remove; stays open.                                                                                                   |
| `selectHighlighted(state)`      | Enter / Space / Tab. `selectOption` or `toggleOption` on the highlighted option; no-op if none.                                                           |
| `clearSelection(state)`         | User. Empty selection, `query` → `null`.                                                                                                                  |
| `removeLastSelected(state)`     | User (Backspace / Delete, multiple). Remove the most recently selected value.                                                                             |
| `openList(state, at?)`          | Ignored if disabled. Highlight: given end (`"first"` / `"last"`), else first selected visible option, else first enabled visible option.                  |
| `closeList(state)`              | `open = false`, highlight cleared, `query = null`.                                                                                                        |
| `moveHighlight(state, to)`      | Keyboard. Move among visible enabled options; `next` / `prev` wrap; page moves 10 and clamps. Closed: opens (Home / End at that end).                     |
| `highlightOption(state, value)` | Hover. Ignored while closed or for disabled options.                                                                                                      |
| `typeahead(state, text)`        | Plain mode. Component buffers keys (500 ms) and passes the buffer. Highlight the next label starting with it; repeated same char cycles. Opens if closed. |
| `search(state, text)`           | Searchable. Set `query`, open, highlight first visible enabled match (or `null`).                                                                         |
| `dismiss(state)`                | Close (Escape, Tab, outside, focus leaving). Searchable single: `query === ""` clears the selection; other text reverts (`query = null`).                 |
| `setConfig(state, config)`      | `multiple` off → keep first selected. Disabled on → close. `searchable` / `filter` change → `query = null`, fix highlight.                                |
| `reset(state)`                  | `dirty = false`, selection = `defaultSelected` options (empty → placeholder). Close.                                                                      |

Readers: `visibleOptions`, `displayText`, `formValues`, `formValue(state, name)`, `isSelected`, `hasSelection`, `shouldSubmitOnEnter`, `shouldShowClear`, `clearForKey`, `isPrintable`, `checkInvariants`.

### Invariants

Checked by `checkInvariants(state)` after every call in tests.

- Single mode: `selection.length ≤ 1`.
- `selection` has no duplicate values.
- `setOptions` never removes from a dirty `selection`; it only fills in `label: null` entries and refreshes labels of matching options.
- `navigation.items` equals the visible options.
- `navigation.highlighted` is `null` or the value of a visible, enabled option.
- Closed ⇒ nothing highlighted and `query === null`.
- `config.disabled` ⇒ closed; user calls (`selectOption`, `toggleOption`, `selectHighlighted`, `clearSelection`, `openList`, `moveHighlight`, `highlightOption`, `typeahead`, `search`) change nothing.
- Not searchable ⇒ `query === null`.
- Disabled options can't be selected by the user, but can be selected programmatically (like native).
- A no-op call returns an empty change set and leaves the state untouched (so the component can skip rendering).

### Performance

Work stays proportional to what changed, so long lists (thousands of options) cost the same per keystroke as short ones.

- `context.elements`: value → first `ce-option`, rebuilt in the same pass that reads the option data. Lookups (active descendant, `selectedOptions`) never search the DOM.
- `context.rendered` remembers what the options show (highlight, selection, hidden, multiple):
  - Highlight move (arrow keys, hover, Home / End, type-ahead): `setView` on the old and new option only.
  - Selection change: only options that were selected or deselected.
  - Every option only when the options themselves change or `multiple` flips (check mark column).
- Logic functions are pure JS: highlight moves are one pass over enabled options; only actions that change what's visible re-check the navigation items.
- Options use `content-visibility: auto` (with a remembered intrinsic height), so the browser skips style and layout for options scrolled out of view.
- Scrolling the highlighted option into view runs on the next animation frame, not while handling the key: measuring positions mid-keystroke forced an extra style and layout pass. Several moves in one frame scroll once.
- Measured at 20× CPU slowdown, typing 12 keystrokes into 2,000 searchable options: JS 357 → 236 ms, style/layout 1,121 → 757 ms; worst keystroke (showing ~1,100 options again) 318 → 124 ms layout. What's left is mostly the browser's style/layout for options that change visibility.
- Covered by tests that count `setView` calls and position reads, not by timing.

## Phases

Each phase ends with tests passing and a demo update, ready for review.

### Phase 0: internal label (core) — done

- External `<label for>` / wrapping `<label>` don't name the focusable element inside the shadow DOM. Decision: don't support them; every form control has its own label.
- `setupFieldLabel` / `updateFieldLabel` in `src/core/field-label.ts`: `<label part="label">` with a `label` slot inside the shadow root, filled by the `label` attribute when nothing is slotted. Names the control via `ariaLabelledByElements`, focuses it on click, hidden when empty.
- `label` property on `FormControl`. Applied to `ce-input` first; `ce-select` uses it from the start (the trigger is the control).

### Phase 1: state logic — done

- Originally a reducer (`reduce(state, action)` with action objects); replaced by direct logic functions in `src/ce-select/logic.ts` (see Architecture). The action layer added ~120 lines and indirection but no logic.
- State is changed in place through one `set(state, changes, field, value)` helper, which records a field only when its value actually differs.
- Tests (`logic.test.ts`): one `describe` per function, including guards; corner cases that don't need the DOM; random call sequences (seeded, 5 × 2,000 steps) with `checkInvariants` after each step and exact change-set checks. Render functions have their own unit tests (`render.test.ts`); browser tests (`ce-select.test.ts`) cover the flows.

### Phase 2: `ce-option` — done

- `src/ce-select/ce-option.ts`. Attributes: `value` (defaults to the label), `disabled`, `selected` (default selection, like native `<option selected>`; property `defaultSelected`).
- Label: default slot only, no `label` attribute. `label` property is the text of unslotted content, whitespace collapsed (comments ignored).
- Description: `description` slot (attribute TBD). `description` property is its text; the description part is hidden when empty.
- `start` slot for a decorative icon. Check mark (`part="check"`) only for selected options in multiple mode.
- Accessibility via `ElementInternals`: `role="option"`, `ariaSelected`, `ariaDisabled`, and an explicit `ariaLabel` / `ariaDescription` so the description and icons don't leak into the name.
- No `MutationObserver` per option: the select's single subtree observer calls the internal `refresh()` on options whose text changed. Slot changes (children added or removed, including while parsing) refresh on their own.
- Controlled by the select through the internal `setView({ selected, highlighted, filteredOut, showCheck })`: custom states `:state(selected)`, `:state(highlighted)`, `:state(filtered-out)`, `:state(checkable)`. Filtering hides via a state, never by changing user DOM.
- The select builds the option data list itself (`value`, `label`, `disabled`, `defaultSelected`) from its `ce-option` children.

### Phase 3: single select (plain) — done

- `src/ce-select/ce-select.ts`, extends `FormControl`, `delegatesFocus`. Shadow DOM: `FieldLabel`, trigger (`part="base"`, `role="combobox"`, `tabindex="0"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls`), display (`part="display"`), chevron, listbox (`part="listbox"`, `role="listbox"`, `popover="manual"`) with the default slot. Replaced by `ce-popover` later.
- Positioning: CSS anchor positioning (`anchor-name` on the trigger, `position-anchor` on the popover), `position-try-fallbacks: flip-block`, width `anchor-size(width)`, max-height with scroll.
- Handlers call a logic function → `#render(changes)`; `input` + `change` only when a user action changed the selection.
- Highlight via `trigger.ariaActiveDescendantElement = option`; scrolled within the listbox only (never the page).
- Trigger and listbox are both named by the label (`ariaLabelledByElements`).
- Keyboard (APG select-only combobox):
  - Closed: `↓` / `↑` / `Enter` / `Space` / `Alt+↓` open; `Home` / `End` open at first / last; printable chars open and type-ahead.
  - Open: `↓` / `↑` / `Home` / `End` / `PageUp` / `PageDown` move; `Enter` / `Alt+↑` select and close; `Space` selects unless a type-ahead is in progress; `Escape` closes without change and stops propagation; `Tab` selects the highlighted option, closes and lets focus move.
  - **Decisions:** Enter while closed opens (APG), not implicit submit. Tab selects (APG), unlike `wa-select`.
- Mouse: `mousedown` on the trigger toggles (and keeps focus); options select on `mouseup`, so press-drag-release works; `pointermove` highlights (not `mouseover`, so keyboard scrolling under a still pointer doesn't move it); `mousedown` in the listbox keeps focus on the trigger; `mousedown` outside closes (document listener only while open).
- Focus leaving the component → `logic.dismiss`.
- Form: `setFormValue(value)` or `null`; reset → `logic.reset`, restore → `logic.setValues`, disabled (attribute or fieldset) → `logic.setConfig`, plus no `tabindex` (not `-1`, which `delegatesFocus` would still focus) and `aria-disabled`.
- `value` property: `""` when nothing is selected; setting `""` clears.
- Custom states on the host: `:state(blank)`, `:state(open)`.
- Option data is built from `ce-option` children by one `MutationObserver` (from phase 4, see below).

### Phase 4: option sources

- Done in phase 3: one `MutationObserver` on the host (`childList`, `subtree`, `characterData`, attributes `value` / `disabled` / `selected`). Each batch → `refresh()` on options whose text changed, then one `logic.setOptions`. A value set before options exist is labelled when they arrive; replacing all options keeps the selection and its labels.
- Remaining: `options` setter (`[{ value, label, disabled, selected }]` → generated `ce-option` children; getter returns the snapshot).

### Phase 5: multiple — done

- `multiple` attribute (reflected) → `logic.setConfig`; applied before the first option sync so the default selection is all options marked `selected`.
- API, following native `<select>` plus one addition:
  - `value`: first selected value, or `""`; setting it selects just that value (`""` clears).
  - `selectedOptions`: selected `ce-option` elements in document order (first of duplicate values only).
  - `values: string[]` (get / set): every selected value in selection order, **including values without a current option**, which `selectedOptions` can't list.
- Display: each selected label is a `<span part="selected-option" data-value="…">` (also in single mode), so they can be restyled or replaced by custom elements later. Commas come from CSS (`::after`), not text. Single line with ellipsis; full text in the display's `title`.
- Keyboard (open, multiple): `Enter` toggles and stays open; `Space` likewise unless a type-ahead is in progress; `Escape` / `Alt+↑` / `Tab` close without toggling.
- Mouse: `mouseup` on an option toggles; the list stays open and focus stays on the trigger.
- `aria-multiselectable` on the listbox; options get `showCheck` (check mark column).
- Form: `FormData` with one `name=value` entry per value, in selection order; rebuilt when `name` changes; nothing without a name. Restore reads the values back from that `FormData`; reset → every option marked `selected`.
- Turning `multiple` off keeps the first selected value.
- `input` + `change` on every user toggle.

### Phase 6: searchable — done

- `searchable` attribute (reflected, switchable at runtime). Both triggers are in the template: the box (`part="base"`) and an `<input part="input">` inside it. The current one gets `role="combobox"`, `aria-haspopup`, `aria-controls`, `aria-expanded`, the active descendant and the label; the other loses them. Focus moves along when switching. Input: `aria-autocomplete="list"`, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`. Keyboard and focus listeners are on the box only (the input's events bubble to it).
- Input text: while searching, the typed text; otherwise single shows the selected label, multiple stays empty with the `selected-option` spans before it. The placeholder moves to the input when nothing is selected. Focus selects the text.
- Typing → `logic.search` (opens, filters by case-insensitive label substring, highlights the first match) and a `search` event (`detail: { query }`, bubbles, composed). The inner input's own `input` events are stopped: our `input` / `change` mean "value changed".
- Keyboard (APG editable combobox): characters, Space, Backspace, Home / End edit the text; ↓ / ↑ / PageUp / PageDown move; Alt+↓ opens; Enter selects (single) or toggles (multiple); Alt+↑, Escape, Tab as in the other modes; Escape restores the label. Enter while closed submits the form (it's a text input). No type-ahead.
- Dismiss (`logic.dismiss`, counts as a user action; Escape, Tab, pressing outside, focus leaving): erased text clears a single selection (fires `input` / `change`); other text is dropped and the label comes back.
- Leaving includes Tab (in single mode with the text erased, Tab doesn't pick the highlighted option: `logic.shouldSelectOnTab`) and pressing outside, which go through `logic.dismiss` too, as does Escape, so erased text clears there as well. Backspace in the erased input clears right away.
- Mouse: pressing the input opens and places the caret; pressing elsewhere on the box (chevron) toggles.
- `no-filter`: no built-in filtering; the app replaces options from `search` (server results). The selection and its labels survive.
- No results: `part="no-results"` row in the popup (not an option, `aria-hidden`). A polite live region announces "N results" / "No results" 300 ms after typing pauses.
- Performance: filtering is one pass over labels per keystroke (pure JS); only options whose visibility changed get `setView` (`#renderedHidden`); no pass at all when nothing is filtered.
- Known edge: duplicate-value elements aren't filtered (they're inert anyway).

### Phase 7: clear — done

- `with-clear` attribute (reflected): `<button part="clear-button" tabindex="-1" aria-label="Clear">` with a `clear-icon` slot (default `xmark`), before the chevron. Shown while there's a selection or search text (`logic.shouldShowClear`), hidden when disabled. Searchable single is always clearable, like `input type=search` (`logic.isClearable`); opt out by hiding `::part(clear-button)`.
- Click: `logic.clearSelection` (empties the selection and search text; doesn't open or close the list), `input` + `change` if the selection changed, focus back on the trigger. `mousedown` is prevented and stopped so focus stays and the box doesn't toggle.
- Keyboard (the button isn't in the tab order), `logic.clearForKey`: Backspace / Delete remove the last selected value in multiple mode (`logic.removeLastSelected`, one per press) and clear the value in single mode; with Cmd (Mac) or Ctrl they clear everything. Not searchable: on the closed list. Searchable: while the input is empty and not being searched, so the keys keep editing text otherwise (single searchable also clears by erasing the text and leaving).
- No separate `clear` event: `input` / `change` cover it.

## Corner cases

- Value set before options exist (frameworks set properties before children) → kept with `label: null`.
- Options removed or replaced while selected → selection and label kept, no event. Re-added → shown as selected again.
- Value set in code that never gets a matching option → kept, submitted, display shows the raw value.
- Option label changes while selected → stored label updates.
- Selected option disabled later → stays selected (like native).
- Highlighted option removed or disabled → highlight moves to the first enabled option, or `null`.
- Option label text changes → display text updates.
- Duplicate values: first option wins; later duplicates are unselectable. Document it.
- All options disabled, or no options: popup opens with nothing highlighted; Enter does nothing.
- Switching `multiple` off → keep only the first selected value. Switching `searchable` → rebuild trigger, keep value.
- Disabled while open (attribute or fieldset) → close.
- Several `ce-option selected` in single mode → last one wins (like native).
- `RESET` with no default-selected options → empty value and placeholder, not the first option (unlike native `<select>`). Same on first render.
- Option clicks while disabled → ignored.
- Option elements moved between two selects → each observer re-snapshots.
- Element disconnected while open → close and remove outside-click listener.
- Removing our own states / ARIA must not trigger `MutationObserver` (only internals and custom states are used, never attributes on user DOM).
- `Escape` while open inside a dialog → closes only the popup (`preventDefault` + `stopPropagation`), not the dialog.
- Focus moving into another shadow root → listen for `focusin` on the select's root node too, not just `document`.
- Form reset doesn't fire `input` / `change` (like native).

## Lessons from `wa-combobox`

Kept in mind, not copied:

- **Value hidden when options change.** `value` getter filters by options currently in the DOM (unless `allowCustomValue`), and single-mode input text keeps the old label. Result: text shown, value `null`. Fixed by our selection model.
- **Mutating user DOM.** It sets `id` on every option (for `aria-activedescendant`) and toggles `hidden` on options, group labels and dividers when filtering, then needs guards against its own slotchange loops. We use `ariaActiveDescendantElement` and custom states instead.
- **Typing fires `input` on the host**, same event as value changes. We use a separate `search` event.
- **State spread over flags** (`hasInteracted`, `valueHasChanged`, `hasInputSinceOpening`, `optionValues` cache, `selectionOrder` map) that must be kept in sync by hand. Our logic holds one state object.
- **Adopted:** select-on-focus, Escape restores typed-over labels, dismiss rules for single mode, Escape `stopPropagation`, `focusin` on the root node, live region for result counts.
- **Not adopted (for now):** `allowCustomValue`, `allowCreate`, tags, `Backspace` removes last selection, opening on label click, input/change on reset.

## Out of scope

`required` / validation, option groups, virtualization, tags, custom filter functions, custom values / creating options.

## Open questions

- CSS anchor positioning support is still missing in some browsers; add a JS fallback later if needed.
