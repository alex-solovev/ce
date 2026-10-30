/**
 * Renders a greeting.
 *
 * @attr name - Who to greet. Defaults to "World".
 * @csspart greeting - The greeting text.
 */
export declare class HelloWorld extends HTMLElement {
  static observedAttributes: string[];
  /** Reflects the `name` attribute. */
  name: string;
  connectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "hello-world": HelloWorld;
  }
}
