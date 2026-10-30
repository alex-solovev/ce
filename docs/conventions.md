# Component conventions

Every component follows the same shape so deviations stand out in review.

## 1. Component structure: logic in functions, the class as a shell

Logic lives in plain functions that take data and either change it or return a value. The custom element class only wires things together: lifecycle, attributes, listeners, and calling those functions. This keeps the class easy to read and makes almost all behaviour testable without simulating user input.

### Files

Each component folder holds the class and two function modules:

| File           | Contents                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------ |
| `ce-select.ts` | The class: lifecycle callbacks, attribute properties, listeners, creating the context.     |
| `logic.ts`     | State type and **logic functions**: change the state, return what changed. No DOM.         |
| `render.ts`    | Context and refs types, `collectRefs`, and **render functions**: write the DOM from state. |

The class imports both as namespaces, so every call says which kind it is:

```ts
import * as logic from "./logic.ts";
import * as render from "./render.ts";

const changes = logic.selectHighlighted(context.state);

render.selection(context, this.placeholder, this.name);
```

The namespace already says what a function is, so names don't repeat it: `render.selection`, not `render.renderSelection`.

`logic.ts` and `render.ts` belong to the folder's main component; smaller components in the same folder (`ce-option` next to `ce-select`) and components without real state (`ce-icon`, `hello-world`) can keep their few lines of rendering in the class until they grow.

### Context and refs

A component keeps everything its functions need in one private context object, created in `#setup()`:

```ts
type SelectContext = {
  state: State; // what the component knows
  refs: SelectRefs; // its shadow DOM elements, looked up once
  elements: Map<string, CeOption>; // value → option element, rebuilt with the options
  rendered: RenderedOptions; // what the option elements currently show
  internals: ElementInternals;
};

type SelectRefs = {
  box: HTMLElement;
  display: HTMLElement;
  input: HTMLInputElement;
  listbox: HTMLElement;
};

export function collectRefs(root: ShadowRoot): SelectRefs {
  return {
    box: requireElement(root, "[part='base']", HTMLElement),
    display: requireElement(root, "[part='display']", HTMLElement),
    input: requireElement(root, "[part='input']", HTMLInputElement),
    listbox: requireElement(root, "[part='listbox']", HTMLElement),
  };
}
```

- Refs are looked up once; render functions never query the shadow DOM.
- The context only exists after setup, so the class checks it once instead of guarding every element (`if (!this.#display) return`).
- The context stays private to the class (`#context`); functions receive it as an argument.

### Logic functions

One exported function per thing that can happen: `logic.openList(state)`, `logic.selectOption(state, value)`, `logic.moveHighlight(state, to)`, `logic.search(state, text)`, `logic.setOptions(state, options)`…

- They change `state` in place and return the set of fields that changed (empty when nothing did). Every write goes through one `set()` helper that only records real changes.
- They carry their own guards (disabled, wrong mode), so callers don't repeat them.
- No DOM, no timers, no events.
- There is no `reduce(state, action)` dispatcher or action types: the class calls the function it means.

### Render functions

One function per thing to draw: `render.selection(context, …)`, `render.options(context)`, `render.open(context)`…

- They take the context (plus any attribute values they need) and write to the DOM directly, step by step.
- Keep them straightforward: build and write in the same function. Extract a helper only when it's shared (`displayText` is used by both the selection and the search input).
- They update only what changed, using `context.rendered` to remember what's on screen.

```ts
// render.ts
export function selection(context: SelectContext, placeholder: string, name: string): void {
  const { state, refs, internals } = context;
  const spans: HTMLSpanElement[] = [];

  for (const selected of state.selection) {
    const span = document.createElement("span");
    span.part.add("selected-option");
    span.dataset.value = selected.value;
    span.textContent = selected.label ?? selected.value;
    spans.push(span);
  }

  refs.display.replaceChildren(...spans);
  refs.display.title = logic.displayText(state);
  internals.setFormValue(logic.formValue(state, name));
}
```

### The class

Handlers read top to bottom: decide, call the logic function, render, fire events. Side effects on the event (`preventDefault`, `stopPropagation`) are written out where they happen, with a comment when the reason isn't obvious.

```ts
#onKeydown = (event: KeyboardEvent) => {
  // Searchable and closed: Enter submits the form, like a native text input.
  if (logic.shouldSubmitOnEnter(this.#context.state, event)) {
    submitImplicitly(this);
    return;
  }

  // Enter while open: single selects and closes, multiple toggles.
  const changes = logic.selectHighlighted(this.#context.state);

  this.#render(changes);
  this.#fireChangeEvents(changes);
};
```

### Tests

- **Logic functions** (`logic.test.ts`): plain unit tests over data, one `describe` per function, plus random sequences of calls with `checkInvariants` after each.
- **Render functions** (`render.test.ts`): unit tests with a context built from real, detached elements. Assert the result (the display holds spans "Apple", "Date"), not how it got there; spies only to count work (e.g. how many options got a new view).
- **Browser tests** cover the flows only: user input reaching the right functions, focus, popover, form submission, accessibility tree, scrolling. They don't re-test every rule the unit tests already cover.

## 2. Single source of truth

- Component state lives in one place: the context's `state` for internal state, attributes for public state.
- Render functions read from that source. **Never read state back out of the DOM.**
- Back this with a test: after a sequence of interactions, DOM and state agree.

## 3. Property routes through the attribute

`attributeChangedCallback` only fires on attribute mutations, not property assignment. Route the setter through the attribute so both paths (`el.disabled = true` and `<my-el disabled>`) end up in one handler, with no double-firing.

```ts
static observedAttributes: string[] = ["disabled"];

get disabled(): boolean {
  return this.hasAttribute("disabled");
}

set disabled(value: boolean) {
  // attributeChangedCallback reacts; don't call the handler here
  this.toggleAttribute("disabled", Boolean(value));
}
```

## 4. Init guard

`attributeChangedCallback` (and `formDisabledCallback`) can fire for parse-time attributes before `connectedCallback` has set up shadow DOM. Guard it (the equivalent of Lit's `waitUntilFirstUpdate`), and apply current state once setup is done.

```ts
#initialized = false;

connectedCallback(): void {
  if (!this.#initialized) {
    this.#setup(); // shadow DOM, refs, context, listeners
    this.#initialized = true;
  }

  this.#updateDisabled();
}

attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
  if (!this.#initialized) {
    return;
  }

  if (oldValue === newValue) {
    return;
  }

  if (name === "disabled") {
    this.#updateDisabled();
    return;
  }
}
```

## 5. Observer and listener teardown

Anything started in `connectedCallback` that outlives the component (observers, `document` / `window` listeners, timers, animation frames) is torn down in `disconnectedCallback`. Listeners on the component's own shadow DOM don't need removing.

## 6. Platform APIs over custom machinery

Prefer `ElementInternals` (forms, ARIA, `states` for `:state(...)` CSS) and `MutationObserver` over hand-rolled equivalents.

## 7. Labels

Form controls are labelled by their own `label` attribute or `label` slot (`setupFieldLabel` / `updateFieldLabel` in `src/core/field-label.ts`), never by external `<label for>` or a wrapping `<label>`. An external label names the host, not the focusable element inside the shadow DOM, so screen readers would announce an unnamed control while clicking the label still appears to work.

## 8. Code style

Procedural and spacious: more lines are fine if each step reads on its own.

- **Early returns instead of `else` / `else if` chains.** Handle the exceptional case and return, then do the main thing.
- **Simple conditions.** Short combinations like `!this.#initialized || oldValue === newValue` are fine; split an `if` when its condition gets hard to read at a glance or a part needs its own comment.
- **Always use braces**, even for one-line bodies.
- **Blank lines between logical steps.**
- **Plain loops instead of transforming array methods** (`map`, `filter`, `reduce`, `flatMap`) and chains of them. Lookup methods are fine (`includes`, `indexOf`, `find`, `findIndex`): don't hand-write a loop that one of them already does.
- **Don't extract single-use helpers** that only wrap a loop or a couple of lines; inline them. Logic and render functions (section 1) are the exception: they're separated so they can be tested.
- **Boolean names read as questions:** functions and variables that are booleans start with `is`, `has`, `should` or `can` (`isPrintable(key)`, `hasSelection(state)`, `shouldSubmitOnEnter(state, key)`), not a verb like `submitsOnEnter`.
- **Named types, no inline object types.** Parameters, return types, annotations and union members use a named type (`function findLabel(root: ShadowRoot): LabelElements`), not `{ label: …; slot: … }` written in place.
- **`type` by default, `interface` only for what a class `implements`.** The one other exception is augmenting an existing interface, like `HTMLElementTagNameMap`, which only works with `interface`.
- **Function helpers over classes.** Shared behaviour goes in plain functions that take what they need (`setupFieldLabel(host, root, onChange)`). Use a class only when it's needed, e.g. custom elements themselves or a base class like `FormControl`.

```ts
export function submitImplicitly(control: FormControl): void {
  const form = control.form;

  if (!form) {
    return;
  }

  for (const element of form.elements) {
    if (!isSubmitButton(element)) {
      continue;
    }

    if (element.matches(":disabled")) {
      return;
    }

    element.click();
    return;
  }

  form.requestSubmit();
}
```
