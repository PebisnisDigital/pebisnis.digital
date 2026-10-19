import { getSupabasePublicConfig } from "../lib/config";
import { Dashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const config = getSupabasePublicConfig() ?? (params.visual === "onboarding"
    ? { url: "https://visual.invalid", publishableKey: "visual-preview" }
    : null);
  return config ? <Dashboard config={config} /> : <main className="loading">Konfigurasi staging belum terpasang.</main>;
}
