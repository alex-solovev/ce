/**
 * Adds an icon library, or replaces one with the same name. Icons already on
 * the page that use it are redrawn.
 *
 * SVG markup is inserted as live DOM, so only register trusted sources.
 *
 * @param icons - Icon name to SVG markup.
 */
export declare function registerIconLibrary(name: string, icons: Record<string, string>): void;

/** Returns the icon's SVG markup, or null if there's no such icon. */
export declare function getIcon(library: string, name: string): string | null;

/** Calls `listener` with a library's name whenever it's registered. */
export declare function watchIconLibraries(listener: (library: string) => void): void;

export declare function unwatchIconLibraries(listener: (library: string) => void): void;
