// Placeholder for raw payload archiving to Cloud Storage
// Recommended: store source response with date/version path and keep Firestore normalized only.
export function buildStoragePath(source: string, dateKey: string) {
  return `raw/${source}/${dateKey}.json`;
}
