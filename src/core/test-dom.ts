// Test-only helpers for finding elements without null checks everywhere.

/** Like `querySelector`, but throws when nothing matches. */
export function query<K extends keyof HTMLElementTagNameMap>(
  root: ParentNode,
  selector: K,
): HTMLElementTagNameMap[K];
export function query<T extends Element = Element>(root: ParentNode, selector: string): T;
export function query(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);

  if (!element) {
    throw new Error(`No element matches "${selector}"`);
  }

  return element;
}

/** Like `query`, but inside `host`'s open shadow root. */
export function queryShadow<K extends keyof HTMLElementTagNameMap>(
  host: Element,
  selector: K,
): HTMLElementTagNameMap[K];
export function queryShadow<T extends Element = Element>(host: Element, selector: string): T;
export function queryShadow(host: Element, selector: string): Element {
  if (!host.shadowRoot) {
    throw new Error(`<${host.localName}> has no open shadow root`);
  }

  return query(host.shadowRoot, selector);
}
