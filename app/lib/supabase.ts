"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | null = null;

export function getSupabase(config: SupabasePublicConfig) {
  if (!browserClient) browserClient = createBrowserClient(config.url, config.publishableKey);
  return browserClient;
}
