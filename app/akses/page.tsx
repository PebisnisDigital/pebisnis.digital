import type { Metadata } from "next";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabasePublicConfig } from "../lib/config";
import { AccessFeed } from "./access-feed";
import "./akses.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ruang Belajar · Pebisnis Digital",
  description: "Jelajahi episode dan materi belajar Pebisnis Digital dalam satu feed.",
  robots: { index: false, follow: false },
};

export default function AksesPage() {
  const config: SupabasePublicConfig | null = getSupabasePublicConfig();
  return <AccessFeed config={config} />;
}
