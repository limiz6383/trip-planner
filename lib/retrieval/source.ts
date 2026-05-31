/**
 * Content source abstraction.
 *
 * A ContentSource knows how to fetch CommunityPost candidates for a given
 * destination. Swap implementations to pull from different backends
 * (Postgres, a vector store, an external API, etc.) without changing the
 * ranking or planner logic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommunityPost } from "@/lib/types";
import { getCommunityPostsForDestination } from "@/lib/db/queries";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface FetchOptions {
  /** Maximum number of posts to return (before ranking) */
  limit?: number;
}

/**
 * Any object that can supply CommunityPost candidates for a destination.
 */
export interface ContentSource {
  fetchForDestination(
    destination: string,
    options?: FetchOptions
  ): Promise<CommunityPost[]>;
}

// ---------------------------------------------------------------------------
// Postgres-backed implementation
// ---------------------------------------------------------------------------

/**
 * Reads community_posts from the Supabase / Postgres database.
 *
 * Uses the anon-key client (RLS enforces public read on community_posts),
 * so this is safe to call from both server and authenticated contexts.
 */
export class PostgresContentSource implements ContentSource {
  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async fetchForDestination(
    destination: string,
    options: FetchOptions = {}
  ): Promise<CommunityPost[]> {
    const limit = options.limit ?? 200;
    return getCommunityPostsForDestination(this.client, destination, limit);
  }
}
