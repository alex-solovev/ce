import { defaultIcons } from "./icon-library-default.ts";

/** Icon name to SVG markup. */
export type IconLibrary = Record<string, string>;

type LibraryListener = (library: string) => void;

/** Library name to its icons. */
const libraries = new Map<string, IconLibrary>([["default", defaultIcons]]);

/** Called with a library's name whenever it's registered. */
const listeners = new Set<LibraryListener>();

/**
 * Adds an icon library, or replaces one with the same name. Icons already
 * on the page that use it are redrawn.
 *
 * SVG markup is inserted as live DOM, so only register trusted sources.
 */
export function registerIconLibrary(name: string, icons: IconLibrary): void {
  libraries.set(name, icons);

  for (const listener of listeners) {
    listener(name);
  }
}

/** Returns the icon's SVG markup, or null if there's no such icon. */
export function getIcon(library: string, name: string): string | null {
  const icons = libraries.get(library);

  if (!icons) {
    return null;
  }

  // Own properties only, so names like "constructor" don't resolve.
  if (!Object.hasOwn(icons, name)) {
    return null;
  }

  return icons[name] ?? null;
}

/** Calls `listener` with a library's name whenever it's registered. */
export function watchIconLibraries(listener: LibraryListener): void {
  listeners.add(listener);
}

export function unwatchIconLibraries(listener: LibraryListener): void {
  listeners.delete(listener);
}
