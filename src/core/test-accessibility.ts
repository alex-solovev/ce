// Test-only helper. Vitest's role locators don't see ElementInternals
// semantics or element references (ariaLabelledByElements), so this asks
// Chrome for its real accessibility tree through CDP (Chromium only).
import { cdp } from "vite-plus/test/browser/context";

export type AccessibleNode = {
  role: string;
  /** Trimmed: surrounding whitespace isn't announced. */
  name: string;
  description: string;
  selected: boolean;
  disabled: boolean;
};

/** Accessible nodes of the test page, skipping ignored nodes and text runs. */
export async function accessibleNodeDetails(): Promise<AccessibleNode[]> {
  const { frameTree } = await cdp().send("Page.getFrameTree");

  // Tests run inside an iframe of the Vitest runner page.
  const frame = frameTree.childFrames?.[0]?.frame;

  if (!frame) {
    throw new Error("No test iframe found");
  }

  const { nodes } = await cdp().send("Accessibility.getFullAXTree", { frameId: frame.id });

  const result: AccessibleNode[] = [];

  for (const node of nodes) {
    if (node.ignored) {
      continue;
    }

    const role = String(node.role?.value ?? "");

    if (role === "StaticText" || role === "InlineTextBox") {
      continue;
    }

    let selected = false;
    let disabled = false;

    for (const property of node.properties ?? []) {
      if (property.name === "selected") {
        selected = property.value.value === true;
      }

      if (property.name === "disabled") {
        disabled = property.value.value === true;
      }
    }

    result.push({
      role,
      name: String(node.name?.value ?? "").trim(),
      description: String(node.description?.value ?? "").trim(),
      selected,
      disabled,
    });
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
