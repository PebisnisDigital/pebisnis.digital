import type { Metadata } from "next";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabasePublicConfig } from "../lib/config";
import { AccessFeed } from "./access-feed";
import "./akses.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "365 Materi Gratis · Pebisnis Digital",
  description: "Buka gambar dan baca langsung materi Pebisnis Digital, tanpa login dan tanpa harus komentar. Belajar bikin usaha di era AI, satu episode setiap hari.",
};

export default function AksesPage() {
  const config: SupabasePublicConfig | null = getSupabasePublicConfig();
  return <AccessFeed config={config} />;
}
