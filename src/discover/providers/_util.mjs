// Shared helper for provider modules. Filename starts with "_": not a provider.

export function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
}
