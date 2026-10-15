/* The ten categories. A category's number is the first character of every
 * prompt id in it, so these numbers must never be reassigned. */

export const CATEGORIES = [
  { id: 0, slug: 'geography',  name: 'Geography',      icon: '\u{1F5FA}\u{FE0F}' },
  { id: 1, slug: 'history',    name: 'History',        icon: '\u{1F3DB}\u{FE0F}' },
  { id: 2, slug: 'literature', name: 'Literature',     icon: '\u{1F4D6}' },
  { id: 3, slug: 'science',    name: 'Science',        icon: '\u{1F52C}' },
  { id: 4, slug: 'visual',     name: 'Visual Arts',    icon: '\u{1F3A8}' },
  { id: 5, slug: 'music',      name: 'Music',          icon: '\u{1F3BC}' },
  { id: 6, slug: 'mythology',  name: 'Mythology',      icon: '\u{1F3FA}' },
  { id: 7, slug: 'philosophy', name: 'Philosophy',     icon: '\u{1F989}' },
  { id: 8, slug: 'socsci',     name: 'Social Science', icon: '\u{1F4CA}' },
  { id: 9, slug: 'popculture', name: 'Pop Culture',    icon: '\u{1F3AC}' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const isCategoryId = (n: number): n is CategoryId =>
  Number.isInteger(n) && n >= 0 && n < CATEGORIES.length;
