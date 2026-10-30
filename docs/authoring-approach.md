# Authoring approach

**Decision:** write components as vanilla custom elements, no runtime library.

## Options considered

| Option                    | Runtime shipped        | Notes                                                                    |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Lit                       | ~5 KB gz               | De facto standard. Reactive properties, `html` templates, scoped styles. |
| FAST (Microsoft)          | Own runtime, Lit-sized | Same territory as Lit, less momentum.                                    |
| Vue `defineCustomElement` | 15–40 KB+              | Bundles Vue runtime per element unless shared.                           |
| Svelte custom elements    | A few KB               | "Zero runtime" only for the authoring layer.                             |
| Stencil                   | ~1–2 KB shared loader  | Compiler; JSX + decorators compiled away; generates framework wrappers.  |
| Vanilla                   | 0                      | Hand-rolled reactivity, templating and lifecycle guards.                 |

Only vanilla is truly zero-runtime; Stencil is the near-zero alternative if we ever want framework-like DX.

## Why vanilla

The cost of vanilla is verbosity: imperative updates and a few lifecycle guarantees that Lit provides for free have to be written by hand. That boilerplate is fixed and one-time per component (see [conventions.md](conventions.md)), and it suits agent-written code:

- **Locality.** Each handler is a small single-purpose function (`_updateDisabledState`, `_moveHighlight`) that can be read, changed and verified alone. Reactive systems have implicit dependencies and ordering that are easy to get wrong.
- **Verifiability.** Assertions like "after `_moveHighlight(1)`, `aria-activedescendant` is the third option's id" are concrete and synchronous. Tests against output after an async render cycle are flakier.
- **No framework knowledge to get wrong.** Platform APIs (`attributeChangedCallback`, `ElementInternals`, `MutationObserver`) are stable and well documented. Framework lifecycles (`willUpdate`, `updated`, `waitUntilFirstUpdate`) and version differences are where agents hallucinate or mix versions.
- **Verbosity is cheap for agents**, while the explicitness still helps reading and review.

## What we give up from Lit, and the replacement

| Lit gives                                                      | Vanilla replacement                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@property` handles both `el.x = …` and `setAttribute('x', …)` | Property setter routes through the attribute; react only in `attributeChangedCallback` |
| `waitUntilFirstUpdate` on watchers                             | Explicit init guard in `attributeChangedCallback`                                      |
| Declarative re-render                                          | Small imperative update functions reading from one state source                        |

Platform APIs such as `ElementInternals.states` (`:state(...)` selectors) work the same either way.

## TypeScript

Sources are TypeScript (`.ts`), with no hand-written `.d.ts` files.

- **Type-only syntax** (`erasableSyntaxOnly`): no enums, namespaces or constructor parameter properties. Stripping the types leaves the plain JavaScript we'd have written anyway, so nothing extra ships.
- **Explicit types on exports** (`isolatedDeclarations`): declarations can be generated per file, without whole-program inference.
- Relative imports use the `.ts` extension.
- Component docs (`@attr`, `@slot`, `@csspart`, `@fires`) live in JSDoc on the class.
- Each component file adds its tag to `HTMLElementTagNameMap`, so `querySelector("ce-input")` is typed.
