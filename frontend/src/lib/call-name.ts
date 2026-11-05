/**
 * What to call someone in a greeting ("Good evening, Manuel").
 *
 * Staff names are often saved in full with initials, in capitals:
 * "D. MANUEL JEBARSON", "R. SAKTHI KUMAR", "Manuel Jebarson D". The first
 * word that isn't an initial is used, in Title case → "Manuel". A preferred
 * name set on Our Staff (Staff form → Preferred name) wins, as typed.
 */

/** "MANUEL" → "Manuel"; a mixed-case word ("McDonald") is left alone. */
function tidyCase(word: string): string {
  const isAllCaps = word === word.toUpperCase() && word !== word.toLowerCase();
  const isAllLower = word === word.toLowerCase() && word !== word.toUpperCase();
  if (!isAllCaps && !isAllLower) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function callName(fullName: string | null | undefined, preferredName?: string | null): string {
  const preferred = (preferredName ?? "").trim();
  if (preferred) return preferred;
  // Dots split too, so "D.MANUEL" and "R.K. SELVAM" lose their initials.
  const words = (fullName ?? "").split(/[\s.,]+/).filter(Boolean);
  if (words.length === 0) return "";
  // An initial is a lone letter; a name of only initials is kept whole.
  const word = words.find((w) => w.length > 1) ?? (fullName ?? "").trim();
  return tidyCase(word);
}
