"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabase } from "../lib/supabase";
import { makeEpisodeDoodleCard } from "../dashboard/episode-visual";
import batch08 from "../dashboard/batch08.json";
import batch09 from "../dashboard/batch09.json";
import batch10 from "../dashboard/batch10.json";
import batch11 from "../dashboard/batch11.json";
import batch12 from "../dashboard/batch12.json";
import batch13 from "../dashboard/batch13.json";

type Pillar = "PIKIR" | "PEMBELI" | "PRODUK" | "SISTEM";
type Filter = "SEMUA" | Pillar;
type View = "grid" | "feed" | "saved";
type Episode = { day: number; pillar: Pillar; title: string; parts: string[]; imagePath: string | null; hook?: string };
type PublicRow = { day_number: number; pillar: string; title: string; parts: unknown; image_path: string | null };

const PILLARS: Pillar[] = ["PIKIR", "PEMBELI", "PRODUK", "SISTEM"];
const PILLAR_COLORS: Record<Pillar, string> = {
  PIKIR: "#eab865", PEMBELI: "#df8e9b", PRODUK: "#9ac4eb", SISTEM: "#9fc38c",
};
const STATIC_EPISODES: Episode[] = [
  ...batch08.episodes, ...batch09.episodes, ...batch10.episodes,
  ...batch11.episodes, ...batch12.episodes, ...batch13.episodes,
].map((item) => ({
  day: item.day,
  pillar: item.pillar as Pillar,
  title: item.image_hook,
  parts: [item.material],
  imagePath: null,
  hook: item.image_hook,
}));

function Icon({ name, size = 24 }: { name: "grid" | "bookmark" | "bookmark-filled" | "search" | "close" | "arrow" | "share" | "heart" | "list" | "chevron-left" | "chevron-right" | "check" | "more" | "home" | "copy"; size?: number }) {
  const shape = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<typeof name, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="5" height="5" /><rect x="10" y="3" width="5" height="5" /><rect x="17" y="3" width="5" height="5" /><rect x="3" y="10" width="5" height="5" /><rect x="10" y="10" width="5" height="5" /><rect x="17" y="10" width="5" height="5" /><rect x="3" y="17" width="5" height="5" /><rect x="10" y="17" width="5" height="5" /><rect x="17" y="17" width="5" height="5" /></>,
    bookmark: <path d="M6 3.5h12a1 1 0 0 1 1 1V22l-7-4.7L5 22V4.5a1 1 0 0 1 1-1z" />,
    "bookmark-filled": <path d="M6 3.5h12a1 1 0 0 1 1 1V22l-7-4.7L5 22V4.5a1 1 0 0 1 1-1z" fill="currentColor" />,
    search: <><circle cx="10.7" cy="10.7" r="7.1" /><path d="m16 16 5 5" /></>,
    close: <path d="M5 5l14 14M19 5 5 19" />,
    arrow: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
    share: <><path d="M12 16V3" /><path d="m7 8 5-5 5 5" /><path d="M4 13v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /></>,
    heart: <path d="M20.8 5.7a5.3 5.3 0 0 0-7.5 0L12 7l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 22l8.8-8.8a5.3 5.3 0 0 0 0-7.5z" />,
    list: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 9h9M8 13h9M8 17h6" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 5 5L20 7" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 21v-8h6v8" /></>,
    copy: <><rect x="7" y="7" width="13" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...shape}>{paths[name]}</svg>;
}

function normalizePillar(value: string): Pillar {
  return PILLARS.find((name) => value.toUpperCase().includes(name)) ?? "PIKIR";
}

function cleanText(text: string) {
  return text.replace(/<\/?(?:b|i|strong|em|blockquote|p|br)(?:\s[^>]*)?\s*\/?>/gi, "")
    .replace(/Save materi ini, karena akan terhapus 24 jam ke depan\.?/gi, "").trim();
}

function readMaterial(episode: Episode) {
  const blocks = episode.parts.flatMap((part) => cleanText(part).split(/\n\s*---\s*\n|\n\s*\n\s*---\s*\n\s*\n/g))
    .map((part) => part.trim()).filter(Boolean);
  const firstLines = (blocks.shift() ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (/^(EPS|DAY)\s+\d+/i.test(firstLines[0] ?? "")) firstLines.shift();
  const title = firstLines.shift() || episode.title;
  const sections: Array<{ heading: string; body: string }> = [];
  if (firstLines.length) sections.push({ heading: "", body: firstLines.join("\n") });
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    const heading = lines.shift() ?? "";
    sections.push({ heading, body: lines.join("\n").trim() });
  }
  return { title, sections };
}

function BrandAvatar({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "ig-avatar ig-avatar-small" : "ig-avatar"} aria-label="Logo Pebisnis Digital">
    <span className="ig-logo-lines">✦ <b>PEBISNIS</b><strong>.DIGITAL</strong><span className="ig-logo-dots">•• ✳ ••</span></span>
  </span>;
}

export function AccessFeed({ config }: { config: SupabasePublicConfig | null }) {
  const [episodes, setEpisodes] = useState<Episode[]>(STATIC_EPISODES);
  const [source, setSource] = useState<"static" | "loading" | "live">("loading");
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [view, setView] = useState<View>("grid");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [showCount, setShowCount] = useState(20);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [toast, setToast] = useState("");
  const fetchingImages = useRef(new Set<number>());
  const ownedUrls = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("pd-akses-bookmarks");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) setSaved(parsed.filter((n) => Number.isInteger(n) && n > 0));
      }
      const deepLink = new URLSearchParams(window.location.search).get("eps");
      if (deepLink && /^\d{1,4}$/.test(deepLink)) setSelectedDay(Number(deepLink));
    } catch { /* Private browsing can block storage. */ }
  }, []);

  useEffect(() => {
    if (!config) { setSource("static"); return; }
    let cancelled = false;
    const supabase = getSupabase(config);
    void Promise.resolve(supabase.rpc("public_akses_episodes")).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !Array.isArray(data) || !data.length) { setSource("static"); return; }
      const incoming = (data as PublicRow[]).map((row) => ({
        day: row.day_number,
        title: row.title,
        pillar: normalizePillar(row.pillar),
        parts: Array.isArray(row.parts) ? row.parts.filter((item): item is string => typeof item === "string") : [],
        imagePath: row.image_path,
        hook: STATIC_EPISODES.find((item) => item.day === row.day_number)?.hook,
      }));
      setEpisodes(incoming);
      setSource("live");
    }).catch(() => { if (!cancelled) setSource("static"); });
    return () => { cancelled = true; };
  }, [config]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = episodes.filter((episode) => (
      (filter === "SEMUA" || episode.pillar === filter)
      && (view !== "saved" || saved.includes(episode.day))
      && (!needle || String(episode.day) === needle || ("eps " + episode.day).includes(needle)
        || episode.title.toLowerCase().includes(needle) || readMaterial(episode).title.toLowerCase().includes(needle))
    ));
    return rows.sort((a, b) => sort === "newest" ? b.day - a.day : a.day - b.day);
  }, [episodes, filter, search, sort, saved, view]);
  const visible = useMemo(() => filtered.slice(0, showCount), [filtered, showCount]);
  const selected = episodes.find((episode) => episode.day === selectedDay) ?? null;
  const selectedIndex = selected ? filtered.findIndex((episode) => episode.day === selected.day) : -1;

  useEffect(() => { setShowCount(20); }, [filter, search, view, sort]);

  useEffect(() => {
    if (source === "loading") return;
    const targets = [...visible, ...(selected ? [selected] : [])].filter((episode) => !imageUrls[episode.day] && !fetchingImages.current.has(episode.day));
    if (!targets.length) return;
    for (const episode of targets) fetchingImages.current.add(episode.day);
    const supabase = config ? getSupabase(config) : null;
    async function resolveImage(episode: Episode) {
      let url = "";
      if (supabase && episode.imagePath && source === "live") {
        const result = await supabase.storage.from("channel-post-images").createSignedUrl(episode.imagePath, 3600);
        if (!result.error && result.data?.signedUrl) url = result.data.signedUrl;
      }
      if (!url && episode.hook) {
        const card = await makeEpisodeDoodleCard({ day: episode.day, pillar: episode.pillar, image_hook: episode.hook });
        url = URL.createObjectURL(card);
        ownedUrls.current.add(url);
      }
      if (mounted.current && url) setImageUrls((current) => ({ ...current, [episode.day]: url }));
      fetchingImages.current.delete(episode.day);
    }
    void Promise.all(targets.map((episode) => resolveImage(episode).catch(() => { fetchingImages.current.delete(episode.day); })));
  }, [config, imageUrls, selected, source, visible]);

  useEffect(() => {
    const owner = ownedUrls.current;
    mounted.current = true;
    return () => { mounted.current = false; for (const url of owner) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    if (selectedDay === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedDay(null);
      if (event.key === "ArrowRight" && selectedIndex >= 0) setSelectedDay(filtered[Math.min(selectedIndex + 1, filtered.length - 1)]?.day ?? null);
      if (event.key === "ArrowLeft" && selectedIndex >= 0) setSelectedDay(filtered[Math.max(selectedIndex - 1, 0)]?.day ?? null);
    };
    document.addEventListener("keydown", onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = originalOverflow; };
  }, [selectedDay, filtered, selectedIndex]);

  const toggleSaved = useCallback((day: number) => {
    setSaved((current) => {
      const next = current.includes(day) ? current.filter((n) => n !== day) : [...current, day];
      try { window.localStorage.setItem("pd-akses-bookmarks", JSON.stringify(next)); } catch { /* Ignore storage errors. */ }
      return next;
    });
  }, []);

  const share = useCallback(async (day: number) => {
    const url = window.location.origin + "/akses?eps=" + day;
    try {
      if (navigator.share) await navigator.share({ title: "Pebisnis Digital • EPS " + day, url });
      else { await navigator.clipboard.writeText(url); setToast("Link episode disalin"); }
    } catch { /* User may cancel sharing. */ }
  }, []);

  const showEpisode = (day: number) => {
    setSelectedDay(day);
    window.history.replaceState(null, "", "/akses?eps=" + day);
  };
  const closeEpisode = () => {
    setSelectedDay(null);
    window.history.replaceState(null, "", "/akses");
  };
  const focusSearch = () => {
    setShowSearch(true);
    requestAnimationFrame(() => document.getElementById("ig-search")?.focus());
  };
  const goGrid = () => { setView("grid"); document.getElementById("ig-posts")?.scrollIntoView({ behavior: "smooth" }); };
  const material = selected ? readMaterial(selected) : null;

  return (
    <div className="ig-akses">
      <header className="ig-site-head">
        <a href="/akses" className="ig-site-brand">pebisnis<span>.</span>digital <span className="ig-brand-star">✳</span></a>
        <div className="ig-site-head-actions">
          <button onClick={focusSearch} title="Cari materi" aria-label="Cari materi"><Icon name="search" /></button>
          <button onClick={() => { setView("saved"); document.getElementById("ig-posts")?.scrollIntoView({ behavior: "smooth" }); }} title="Materi tersimpan" aria-label="Materi tersimpan"><Icon name="bookmark" /></button>
        </div>
      </header>

      <main>
        <section className="ig-profile" aria-label="Profil Pebisnis Digital">
          <div className="ig-profile-photo"><BrandAvatar /></div>
          <div className="ig-profile-info">
            <div className="ig-name-row"><h1>pebisnis.digital</h1><span className="ig-verified" title="Pebisnis Digital"><Icon name="check" size={13} /></span><span className="ig-name-icon">✳</span></div>
            <div className="ig-stats">
              <span><b>{source === "live" ? episodes.length : 365}</b> postingan</span>
              <span><b>4</b> pilar belajar</span>
              <span><b>Gratis</b> dibaca</span>
            </div>
            <div className="ig-bio">
              <strong>PEBISNIS DIGITAL</strong>
              <span className="ig-bio-muted">Education &amp; Digital Creator</span>
              <p>Belajar bikin usaha sendiri di era AI. ✨<br />Dari ide, bikin produk, sampai berani jualan.<br />Nggak harus jago teknologi. Yang penting mulai!<br />👇 Semua materinya ada di sini.</p>
              <span className="ig-bio-link">✳ #PebisnisDigital</span>
            </div>
            <div className="ig-profile-actions">
              <button onClick={goGrid}>Lihat semua materi</button>
              <button onClick={focusSearch}>Cari episode <Icon name="search" size={17} /></button>
            </div>
          </div>
        </section>

        <section className="ig-highlights" aria-label="Kategori materi">
          <button className={filter === "SEMUA" ? "ig-highlight active" : "ig-highlight"} onClick={() => setFilter("SEMUA")}><span className="ig-highlight-ring"><span className="ig-highlight-icon">✦</span></span><strong>Semua EPS</strong></button>
          {PILLARS.map((pillar) => <button className={filter === pillar ? "ig-highlight active" : "ig-highlight"} key={pillar} onClick={() => setFilter(pillar)}><span className="ig-highlight-ring"><span className="ig-highlight-icon" style={{ color: PILLAR_COLORS[pillar] }}>{pillar === "PIKIR" ? "✳" : pillar === "PEMBELI" ? "♡" : pillar === "PRODUK" ? "◇" : "↗"}</span></span><strong>{pillar[0] + pillar.slice(1).toLowerCase()}</strong></button>)}
        </section>

        <section id="ig-posts" className="ig-collection" aria-label="Semua materi dan episode">
          <div className="ig-tabs" role="tablist" aria-label="Tampilan materi">
            <button role="tab" aria-selected={view === "grid"} className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")} title="Grid"><Icon name="grid" size={22} /><span>POSTINGAN</span></button>
            <button role="tab" aria-selected={view === "feed"} className={view === "feed" ? "selected" : ""} onClick={() => setView("feed")} title="Daftar"><Icon name="list" size={22} /><span>DAFTAR</span></button>
            <button role="tab" aria-selected={view === "saved"} className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")} title="Tersimpan"><Icon name="bookmark" size={22} /><span>TERSIMPAN</span></button>
            <button role="tab" aria-selected={false} onClick={() => setSort((current) => current === "newest" ? "oldest" : "newest")} title="Ubah urutan"><Icon name="arrow" size={22} /><span>{sort === "newest" ? "TERBARU" : "TERLAMA"}</span></button>
            <button role="tab" aria-selected={showSearch} onClick={focusSearch} title="Cari"><Icon name="search" size={22} /><span>CARI</span></button>
          </div>

          {showSearch && <div className="ig-search-line"><Icon name="search" size={20} /><input id="ig-search" type="search" placeholder="Cari EPS, judul, atau topik..." value={search} onChange={(event) => setSearch(event.target.value)} /><button onClick={() => { setSearch(""); setShowSearch(false); }} title="Tutup pencarian"><Icon name="close" size={18} /></button></div>}
          <div className="ig-count-row"><span>{view === "saved" ? "Materi tersimpan" : filter === "SEMUA" ? "Semua postingan" : "Pilar " + filter}</span><span>{filtered.length} episode</span></div>

          <div className={view === "feed" ? "ig-photo-grid ig-photo-list" : "ig-photo-grid"}>
            {visible.map((episode) => <button className="ig-tile" key={episode.day} onClick={() => showEpisode(episode.day)} aria-label={"Baca materi EPS " + episode.day + ": " + episode.title}>
              {imageUrls[episode.day] ? <img src={imageUrls[episode.day]} alt={"Ilustrasi EPS " + episode.day} loading="lazy" /> : <span className="ig-tile-fallback"><small>PEBISNIS.DIGITAL</small><b>{episode.hook || episode.title}</b><em>EPS {String(episode.day).padStart(3, "0")}</em></span>}
              <span className="ig-tile-shade"><strong><Icon name="heart" size={18} /> EPS {String(episode.day).padStart(3, "0")}</strong><small>Buka materi</small></span>
              <span className="ig-tile-number">{String(episode.day).padStart(3, "0")}</span>
            </button>)}
          </div>

          {source !== "live" && <div className="ig-sync-note" role="status"><span>✦</span><p><b>{episodes.length} episode bisa dibaca sekarang.</b> Arsip sisanya menunggu sambungan baca publik ke kalender. Pengunjung tetap tidak perlu login.</p></div>}
          {!filtered.length && <div className="ig-empty"><Icon name="search" size={32} /><h2>Belum ada di sini.</h2><p>Coba cari episode lain atau pilih kategori berbeda.</p><button onClick={() => { setFilter("SEMUA"); setSearch(""); setView("grid"); }}>Lihat Semua</button></div>}
          {filtered.length > showCount && <button className="ig-more" onClick={() => setShowCount((count) => count + 20)}>Muat postingan lagi <Icon name="arrow" size={17} /></button>}
          <p className="ig-footer">© {new Date().getFullYear()} Pebisnis Digital · Belajar, praktik, lanjut lagi.</p>
        </section>
      </main>

      <nav className="ig-mobile-nav" aria-label="Navigasi cepat"><button onClick={() => { setFilter("SEMUA"); setView("grid"); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Beranda"><Icon name="home" /></button><button onClick={focusSearch} aria-label="Cari"><Icon name="search" /></button><button onClick={goGrid} aria-label="Postingan"><Icon name="grid" /></button><button onClick={() => { setView("saved"); document.getElementById("ig-posts")?.scrollIntoView({ behavior: "smooth" }); }} aria-label="Tersimpan"><Icon name="bookmark" /></button><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Profil"><BrandAvatar compact /></button></nav>

      {selected && material && <div className="ig-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEpisode(); }}>
        <button className="ig-modal-close" onClick={closeEpisode} aria-label="Tutup"><Icon name="close" size={29} /></button>
        {selectedIndex > 0 && <button className="ig-prev" onClick={() => setSelectedDay(filtered[selectedIndex - 1].day)} aria-label="Episode sebelumnya"><Icon name="chevron-left" /></button>}
        <article className="ig-modal" role="dialog" aria-modal="true" aria-label={"Materi EPS " + selected.day}>
          <div className="ig-modal-media">
            {imageUrls[selected.day] ? <img src={imageUrls[selected.day]} alt={"Gambar EPS " + selected.day} /> : <span className="ig-modal-placeholder"><span>PEBISNIS.DIGITAL</span><strong>{selected.hook || material.title}</strong><small>EPS {selected.day}</small></span>}
          </div>
          <div className="ig-modal-content">
            <div className="ig-modal-author"><BrandAvatar compact /><div><strong>pebisnis.digital <span className="ig-verified ig-verified-small"><Icon name="check" size={10} /></span></strong><small>EPS {String(selected.day).padStart(3, "0")} · {selected.pillar}</small></div><button onClick={() => void share(selected.day)} aria-label="Bagikan"><Icon name="more" /></button></div>
            <div className="ig-modal-reading"><span className="ig-episode-label">EPISODE {String(selected.day).padStart(3, "0")} / 365 <span>·</span> {selected.pillar}</span><h2>{material.title}</h2>{material.sections.map((section, index) => <section className="ig-section" key={index}>{section.heading && <h3>{section.heading}</h3>}{section.body && <p>{section.body}</p>}</section>)}<div className="ig-reading-signoff">✳ Simpan ilmunya. Praktikkan langkahnya.</div></div>
            <div className="ig-modal-bottom"><div className="ig-modal-tools"><button onClick={() => toggleSaved(selected.day)} aria-label={saved.includes(selected.day) ? "Hapus simpan" : "Simpan materi"} title="Simpan">{<Icon name={saved.includes(selected.day) ? "bookmark-filled" : "bookmark"} />}</button><button onClick={() => void share(selected.day)} aria-label="Bagikan" title="Bagikan"><Icon name="share" /></button><button onClick={() => { void navigator.clipboard.writeText(material.title + "\n\n" + material.sections.map((section) => section.heading + "\n" + section.body).join("\n\n")).then(() => setToast("Materi disalin")); }} aria-label="Salin materi" title="Salin materi"><Icon name="copy" /></button></div><span>{saved.includes(selected.day) ? "Tersimpan ✓" : "Materi gratis • Tanpa komentar"}</span></div>
          </div>
        </article>
        {selectedIndex >= 0 && selectedIndex < filtered.length - 1 && <button className="ig-next" onClick={() => setSelectedDay(filtered[selectedIndex + 1].day)} aria-label="Episode selanjutnya"><Icon name="chevron-right" /></button>}
      </div>}
      {toast && <button className="ig-toast" onClick={() => setToast("")} role="status">{toast} ×</button>}
    </div>
  );
}
