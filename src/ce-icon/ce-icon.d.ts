/**
 * An SVG icon from a registered icon library.
 *
 * @attr name - Icon name within the library.
 * @attr library - Library name. Defaults to "default".
 * @attr label - Accessible label. Without one the icon is decorative.
 * @csspart svg - The rendered SVG.
 */
export declare class CeIcon extends HTMLElement {
  static observedAttributes: string[];
  /** Reflects the `name` attribute. */
  name: string;
  /** Reflects the `library` attribute. */
  library: string;
  /** Reflects the `label` attribute. */
  label: string;
  connectedCallback(): void;
  disconnectedCallback(): void;
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "ce-icon": CeIcon;
  }
}
