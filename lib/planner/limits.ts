/**
 * Per-day activity ceilings. Pace (3-7 activities) is what actually sizes a
 * day; these are only safety nets against a runaway model response.
 */

/** First generation: favour a realistic, scannable day. */
export const MAX_ACTIVITIES_PER_DAY = 8;

/**
 * Revisions: the traveller may explicitly ask to ADD things ("add the train back
 * to Vienna after dinner") to a day that is already full. Cutting from the end
 * would silently drop exactly what they asked for, so revisions get headroom.
 */
export const MAX_ACTIVITIES_PER_REVISED_DAY = 12;
