/**
 * Natural (numeric-aware, case-insensitive) filename comparator, so numbered
 * exports sort the way people read them: Kai-2.jpg before Kai-10.jpg. Used
 * everywhere curated album content is listed by name.
 */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
