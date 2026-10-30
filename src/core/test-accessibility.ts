// Test-only helper. Vitest's role locators don't see ElementInternals
// semantics or element references (ariaLabelledByElements), so this asks
// Chrome for its real accessibility tree through CDP (Chromium only).
import { cdp } from "vite-plus/test/browser/context";

/**
 * Accessible nodes of the test page, as "role:name" strings with trimmed
 * names, skipping ignored nodes and text runs.
 */
export async function accessibleNodes(): Promise<string[]> {
  const { frameTree } = await cdp().send("Page.getFrameTree");

  // Tests run inside an iframe of the Vitest runner page.
  const frame = frameTree.childFrames?.[0]?.frame;

  if (!frame) {
    throw new Error("No test iframe found");
  }

  const { nodes } = await cdp().send("Accessibility.getFullAXTree", { frameId: frame.id });

  const result: string[] = [];

  for (const node of nodes) {
    if (node.ignored) {
      continue;
    }

    const role = node.role?.value;

    if (role === "StaticText" || role === "InlineTextBox") {
      continue;
    }

    // Surrounding whitespace in names isn't announced.
    const name = String(node.name?.value ?? "").trim();

    result.push(`${role}:${name}`);
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
