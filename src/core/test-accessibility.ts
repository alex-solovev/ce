// Test-only helper. Vitest's role locators don't see ElementInternals
// semantics or element references (ariaLabelledByElements), so this asks
// Chrome for its real accessibility tree through CDP (Chromium only).
import { cdp } from "vite-plus/test/browser/context";

export type AccessibleNode = {
  role: string;
  /** Trimmed: surrounding whitespace isn't announced. */
  name: string;
  description: string;
  /** What's read as the current value, e.g. a combobox's selection. Trimmed. */
  value: string;
  selected: boolean;
  disabled: boolean;
  focused: boolean;
  /** Null when the node can't expand at all. */
  expanded: boolean | null;
  multiselectable: boolean;
  /** `aria-autocomplete`, or "" without one. */
  autocomplete: string;
  /** `aria-haspopup`, or "" without one. */
  hasPopup: string;
  /** Live region politeness, or "" outside one. */
  live: string;
  /** The active descendant as "role:name", or null. */
  activeDescendant: string | null;
  /** Controlled nodes as "role:name". */
  controls: string[];
};

/** A CDP accessibility property: a plain value, or references to other nodes. */
type RawProperty = {
  name: string;
  value: { value?: unknown; relatedNodes?: { backendDOMNodeId: number }[] };
};

type RawNode = {
  ignored: boolean;
  backendDOMNodeId?: number;
  role?: { value?: unknown };
  name?: { value?: unknown };
  description?: { value?: unknown };
  value?: { value?: unknown };
  properties?: RawProperty[];
};

/** Accessible nodes of the test page, skipping ignored nodes and text runs. */
export async function accessibleNodeDetails(): Promise<AccessibleNode[]> {
  const { frameTree } = await cdp().send("Page.getFrameTree");

  // Tests run inside an iframe of the Vitest runner page.
  const frame = frameTree.childFrames?.[0]?.frame;

  if (!frame) {
    throw new Error("No test iframe found");
  }

  const response = await cdp().send("Accessibility.getFullAXTree", { frameId: frame.id });
  const nodes = response.nodes as RawNode[];

  // Relations point at DOM nodes; first learn what each one is announced as.
  const labels = new Map<number, string>();

  for (const node of nodes) {
    if (node.ignored || node.backendDOMNodeId === undefined) {
      continue;
    }

    labels.set(node.backendDOMNodeId, `${text(node.role)}:${text(node.name)}`);
  }

  const result: AccessibleNode[] = [];

  for (const node of nodes) {
    if (node.ignored) {
      continue;
    }

    const role = text(node.role);

    if (role === "StaticText" || role === "InlineTextBox") {
      continue;
    }

    const details: AccessibleNode = {
      role,
      name: text(node.name),
      description: text(node.description),
      value: text(node.value),
      selected: false,
      disabled: false,
      focused: false,
      expanded: null,
      multiselectable: false,
      autocomplete: "",
      hasPopup: "",
      live: "",
      activeDescendant: null,
      controls: [],
    };

    for (const property of node.properties ?? []) {
      const value = property.value.value;
      const related = property.value.relatedNodes ?? [];

      switch (property.name) {
        case "selected":
          details.selected = value === true;
          break;
        case "disabled":
          details.disabled = value === true;
          break;
        case "focused":
          details.focused = value === true;
          break;
        case "expanded":
          details.expanded = value === true;
          break;
        case "multiselectable":
          details.multiselectable = value === true;
          break;
        case "autocomplete":
          details.autocomplete = typeof value === "string" ? value : "";
          break;
        case "hasPopup":
          details.hasPopup = typeof value === "string" ? value : "";
          break;
        case "live":
          details.live = typeof value === "string" ? value : "";
          break;
        case "activedescendant":
          details.activeDescendant = related[0]
            ? (labels.get(related[0].backendDOMNodeId) ?? null)
            : null;
          break;
        case "controls":
          for (const target of related) {
            details.controls.push(labels.get(target.backendDOMNodeId) ?? "?");
          }
          break;
      }
    }

    result.push(details);
  }

  return result;
}

/** A CDP value as trimmed text: surrounding whitespace isn't announced. */
function text(field: { value?: unknown } | undefined): string {
  const value = field?.value;

  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return "";
}

/** The nodes with the given role. */
export function withRole(nodes: AccessibleNode[], role: string): AccessibleNode[] {
  const result: AccessibleNode[] = [];

  for (const node of nodes) {
    if (node.role === role) {
      result.push(node);
    }
  }

  return result;
}

/** Accessible nodes of the test page, as "role:name" strings. */
export async function accessibleNodes(): Promise<string[]> {
  const result: string[] = [];

  for (const node of await accessibleNodeDetails()) {
    result.push(`${node.role}:${node.name}`);
  }

  return result;
}

/** Accessible nodes with the given role, as "role:name" strings. */
export async function accessibleNodesWithRole(role: string): Promise<string[]> {
  const result: string[] = [];

  for (const node of await accessibleNodes()) {
    if (node.startsWith(`${role}:`)) {
      result.push(node);
    }
  }

  return result;
}
