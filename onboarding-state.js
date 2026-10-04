// Onboarding is a device preference, independent from training and its backups.
export const ONBOARDING_KEY = 'repite-onboarding-v1';
const TRAINING_SOURCES = ['gym-log-v2', 'rutina-fuerza-elegante-v7-final', 'customRoutineData'];
const STATUSES = ['started', 'completed', 'skipped'];

function resolveStorage(storage) {
  try { return storage === undefined ? globalThis.localStorage : storage; }
  catch { return null; }
}

function relevantText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

export function shouldShowOnboarding(state, storage) {
  try {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
    const target = resolveStorage(storage);
    if (!target || typeof target.getItem !== 'function') return false;
    // Presence is sufficient: corrupted or unfinished markers must not force a
    // returning user through the tutorial again.
    if (target.getItem(ONBOARDING_KEY) !== null) return false;
    if (TRAINING_SOURCES.some(key => target.getItem(key) !== null)) return false;
    for (const field of ['sessions', 'legacyProgress']) {
      if (state[field] !== undefined && (!Array.isArray(state[field]) || state[field].length > 0)) return false;
    }
    if (state.activeSession != null) return false;
    if (relevantText(state.notes)) return false;
    if (state.week !== undefined && state.week !== 1 && state.week !== '1') return false;
    if (state.profile !== undefined) {
      if (!state.profile || typeof state.profile !== 'object' || Array.isArray(state.profile)) return false;
      if (relevantText(state.profile.displayName) || relevantText(state.profile.handle)) return false;
    }
    return true;
  } catch { return false; }
}

export function markOnboardingSeen(status = 'started', storage) {
  if (!STATUSES.includes(status)) return false;
  try {
    const target = resolveStorage(storage);
    if (!target || typeof target.setItem !== 'function' || typeof target.getItem !== 'function') return false;
    const marker = JSON.stringify({ version: 1, status, seenAt: new Date().toISOString() });
    target.setItem(ONBOARDING_KEY, marker);
    return target.getItem(ONBOARDING_KEY) === marker;
  } catch { return false; }
}
