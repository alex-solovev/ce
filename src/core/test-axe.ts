// Test-only helper: runs axe-core's WCAG checks on part of the page. It
// catches what hand-written accessibility assertions don't, like contrast or
// ARIA attributes a role doesn't allow. axe walks open shadow roots.
import axe from "axe-core";

// axe reads roles and states set through ElementInternals, but finds the
// internals only on a public property or in a global WeakMap. Components
// keep them private, so record every attachInternals call there (test-only).
const internalsByElement = new WeakMap<HTMLElement, ElementInternals>();
// Called with each element as `this` below.
// oxlint-disable-next-line typescript/unbound-method
const attachInternals = HTMLElement.prototype.attachInternals;

Object.assign(globalThis, { _elementInternals: internalsByElement });

HTMLElement.prototype.attachInternals = function (this: HTMLElement): ElementInternals {
  const internals = attachInternals.call(this);
  internalsByElement.set(this, internals);

  return internals;
};

/** WCAG A and AA (up to 2.2), plus axe's best practices. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/**
 * Page-level rules: a test page has no landmarks or headings, and a single
 * component can't be expected to provide them.
 */
const PAGE_RULES = ["region", "landmark-one-main", "page-has-heading-one"];

/**
 * axe violations inside the element, as "rule: selector" strings. `ignored`
 * turns off rules a caller knowingly departs from; say why at the call site.
 */
export async function axeViolations(element: Element, ignored: string[] = []): Promise<string[]> {
  const rules: axe.RuleObject = {};

  for (const rule of PAGE_RULES) {
    rules[rule] = { enabled: false };
  }

  for (const rule of ignored) {
    rules[rule] = { enabled: false };
  }

  const results = await axe.run(element, {
    runOnly: { type: "tag", values: TAGS },
    rules,
    resultTypes: ["violations"],
  });

  const result: string[] = [];

  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      // A target inside shadow roots is a list: host, then the inner selector.
      const parts: string[] = [];

      for (const selector of node.target) {
        parts.push(typeof selector === "string" ? selector : selector.join(" >>> "));
      }

      result.push(`${violation.id}: ${parts.join(" ")}`);
    }
  }

  return result;
}
