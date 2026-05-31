/**
 * Two-axis authenticity-first ranking for community posts.
 *
 * Axis 1 (primary): Author authenticity
 *   local > blogger > tourist > unknown
 *
 * Axis 2 (secondary): Locality dial alignment
 *   How closely the post's locality_score matches the user's local_touristy_dial.
 *   A dial of 0.0 means the user wants very local content; 1.0 means touristy.
 *   Note: locality_score is 0.0=touristy, 1.0=local — the INVERSE of the dial.
 *
 * Final score = authorWeight + localityAlignment * secondaryWeight
 *
 * Design goals:
 *   - Pure function: no I/O, fully unit-testable.
 *   - Stable sort: ties keep their original order.
 *   - Configurable weights for A/B experimentation.
 */

import type { CommunityPost, AuthorType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Author authenticity weights
// ---------------------------------------------------------------------------

const AUTHOR_WEIGHTS: Record<AuthorType, number> = {
  local: 1.0,
  blogger: 0.7,
  tourist: 0.4,
  unknown: 0.3,
};

// ---------------------------------------------------------------------------
// Ranking config
// ---------------------------------------------------------------------------

export interface RankingConfig {
  /**
   * Weight for the locality-dial alignment axis (0–1).
   * Author authenticity is always the primary axis (weight = 1.0).
   * Default: 0.5 means locality alignment can close at most half the gap
   * between two posts with different author types.
   */
  localityAlignmentWeight: number;
}

const DEFAULT_CONFIG: RankingConfig = {
  localityAlignmentWeight: 0.5,
};

// ---------------------------------------------------------------------------
// Core ranking function
// ---------------------------------------------------------------------------

/**
 * Ranks `posts` by authenticity-first, then locality-dial alignment.
 *
 * @param posts            The candidate posts to rank.
 * @param localTouristyDial  User's preference: 0.0 = very local, 1.0 = very touristy.
 * @param config           Optional weight overrides.
 * @returns A new array of posts sorted highest-score first.
 */
export function rankPosts(
  posts: CommunityPost[],
  localTouristyDial: number,
  config: RankingConfig = DEFAULT_CONFIG
): CommunityPost[] {
  const dial = clamp(localTouristyDial, 0, 1);
  const { localityAlignmentWeight } = config;

  return [...posts].sort((a, b) => {
    const scoreA = computeScore(a, dial, localityAlignmentWeight);
    const scoreB = computeScore(b, dial, localityAlignmentWeight);
    // Descending; preserve insertion order on tie
    return scoreB - scoreA;
  });
}

/**
 * Computes the ranking score for a single post.
 * Exported for unit testing.
 */
export function computeScore(
  post: CommunityPost,
  localTouristyDial: number,
  localityAlignmentWeight: number
): number {
  const authorScore = AUTHOR_WEIGHTS[post.author_type] ?? AUTHOR_WEIGHTS.unknown;

  // locality_score: 1.0 = very local, 0.0 = very touristy
  // dial:           0.0 = user wants local, 1.0 = user wants touristy
  // alignment = 1 - |locality_score - (1 - dial)|
  //           = 1 - |locality_score + dial - 1|
  // Perfect alignment = 1.0, worst = 0.0
  const userLocalityPreference = 1 - localTouristyDial; // 1.0 = wants local
  const localityAlignment = 1 - Math.abs(post.locality_score - userLocalityPreference);

  return authorScore + localityAlignment * localityAlignmentWeight;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Re-export config type for consumers
// ---------------------------------------------------------------------------

export type { RankingConfig as PostRankingConfig };
