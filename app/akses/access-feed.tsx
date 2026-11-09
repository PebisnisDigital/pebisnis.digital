"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabasePublicConfig } from "../lib/config";
import { getSupabase } from "../lib/supabase";

type Pillar = "PIKIR" | "PEMBELI" | "PRODUK" | "SISTEM";
type Filter = "SEMUA" | Pillar;
type Status = "loading" | "ready" | "locked" | "error";

type CalendarRow = { day_number: number; source_post_id: string; status: string };
type SourceRow = {
  id: string;
  prompt_version_id: string;
  image_path: string;
  caption: string;
  prompts: { title: string } | { title: string }[] | null;
};
type FeedPost = { id: string; day: number; pillar: Pillar; title: string; versionId: string; imagePath: string };

const PILLARS: Pillar[] = ["PIKIR", "PEMBELI", "PRODUK", "SISTEM"];
const PILLAR_META: Record<Pillar, { color: string; description: string }> = {
  PIKIR: { color: "#ffebba", description: "Pola pikir & keberanian memulai" },
  PEMBELI: { color: "#f5d8dd", description: "Memahami orang yang kita bantu" },
  PRODUK: { color: "#d7e9fd", description: "Membuat produk yang benar-benar berguna" },
  SISTEM: { color: "#d9efce", description: "Membangun kebiasaan & sistem jualan" },
};

function Icon({ name, size = 22 }: { name: "home" | "search" | "bookmark" | "bookmark-filled" | "grid" | "arrow" | "share" | "lock" | "layers" | "menu"; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<typeof name, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></>,
    search: <><circle cx="10.7" cy="10.7" r="7.1" /><path d="m16 16 5 5" /></>,
    bookmark: <path d="M6 3.5h12a1 1 0 0 1 1 1V22l-7-4.7L5 22V4.5a1 1 0 0 1 1-1z" />,
    "bookmark-filled": <path d="M6 3.5h12a1 1 0 0 1 1 1V22l-7-4.7L5 22V4.5a1 1 0 0 1 1-1z" fill="currentColor" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    share: <><path d="M12 16V3" /><path d="m7 8 5-5 5 5" /><path d="M4 13v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

function extractPillar(text: string): Pillar {
  return PILLARS.find((pillar) => new RegExp(`\\b${pillar}\\b`, "i").test(text)) ?? "PIKIR";
}

function cleanMaterial(text: string) {
  return text
    .replace(/<\/?(?:b|i|strong|em|blockquote|p|br)(?:\s[^>]*)?\s*\/?>/gi, "")
    .replace(/^\s*(?:EPS|DAY)\s+\d+\s*[·•—-]?\s*(PIKIR|PEMBELI|PRODUK|SISTEM)\s*\n+/i, "")
    .replace(/\s*Save materi ini, karena akan terhapus 24 jam ke depan\.?/gi, "")
    .trim();
}

function materialPresentation(parts: string[]) {
  let title = "";
  const sections = parts.map((part, index) => {
    const blocks = cleanMaterial(part).split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
    // Older episodes used DAY/EPS as a separate heading, followed by the real title.
    if (index === 0) {
      while (blocks[0] && /^(?:EPS|DAY)\s+\d+\s*(?:[·•—-]\s*)?(?:PIKIR|PEMBELI|PRODUK|SISTEM)$/i.test(blocks[0])) blocks.shift();
      title = blocks.shift() ?? "";
    }
    return index === 0 ? { heading: "", paragraphs: blocks } : { heading: blocks.shift() ?? "", paragraphs: blocks };
  });
  return { title, sections };
}

function initials(name: string) { return name.slice(0, 1).toUpperCase(); }

export function AccessFeed({ config }: { config: SupabasePublicConfig | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [statusText, setStatusText] = useState("");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [total, setTotal] = useState(365);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("SEMUA");
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [visibleCount, setVisibleCount] = useState(8);
  const [saved, setSaved] = useState<number[]>([]);
  const [onlySaved, setOnlySaved] = useState(false);
  const [materials, setMaterials] = useState<Record<string, string[]>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [mediaErrors, setMediaErrors] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState("");
  const fetching = useRef(new Set<string>());

  useEffect(() => {
    try {
      const value = window.localStorage.getItem("pd-akses-bookmarks");
      if (value) {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) setSaved(parsed.filter((n) => Number.isInteger(n) && n > 0));
      }
      const deepLink = new URLSearchParams(window.location.search).get("eps");
      if (deepLink && /^\d{1,4}$/.test(deepLink)) setQuery(`EPS ${Number(deepLink)}`);
    } catch { /* Storage may be unavailable in private browsing. */ }
  }, []);

  useEffect(() => {
    if (!config) { setStatus("error"); setStatusText("Konfigurasi database belum tersedia."); return; }
    let cancelled = false;
    async function load() {
      const supabase = getSupabase(config!);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;
        if (authError || !user) { setStatus("locked"); return; }
        const { data: profile, error: profileError } = await supabase.from("admin_profiles")
          .select("role,status").eq("auth_user_id", user.id).maybeSingle();
        if (cancelled) return;
        if (profileError || profile?.status !== "ACTIVE") { setStatus("locked"); return; }

        const { data: slots, error: slotError } = await supabase.from("content_365_items")
          .select("day_number,source_post_id,status").eq("status", "ACTIVE")
          .order("day_number", { ascending: true }).limit(1200);
        if (slotError) throw slotError;
        const activeSlots = (slots ?? []) as CalendarRow[];
        const ids = [...new Set(activeSlots.map((slot) => slot.source_post_id))];
        const sourceRows: SourceRow[] = [];
        for (let offset = 0; offset < ids.length; offset += 100) {
          const { data, error } = await supabase.from("channel_posts")
            .select("id,prompt_version_id,image_path,caption,prompts(title)")
            .in("id", ids.slice(offset, offset + 100));
          if (error) throw error;
          sourceRows.push(...(data ?? []) as SourceRow[]);
        }
        if (cancelled) return;
        const sources = new Map(sourceRows.map((row) => [row.id, row]));
        const mapped: FeedPost[] = activeSlots.flatMap((slot) => {
          const source = sources.get(slot.source_post_id);
          if (!source) return [];
          const title = Array.isArray(source.prompts) ? source.prompts[0]?.title : source.prompts?.title;
          const pillar = extractPillar(`${title ?? ""} ${source.caption.split("\n")[0] ?? ""}`);
          return [{ id: source.id, day: slot.day_number, pillar, title: title ?? `EPS ${slot.day_number} · ${pillar}`, versionId: source.prompt_version_id, imagePath: source.image_path }];
        });
        setPosts(mapped);
        setTotal(Math.max(365, ...activeSlots.map((slot) => slot.day_number), 0));
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setStatusText(error instanceof Error ? error.message : "Materi belum bisa dimuat. Coba beberapa saat lagi.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [config]);

  const filtered = useMemo(() => posts.filter((post) => {
    const matchesPillar = filter === "SEMUA" || post.pillar === filter;
    const matchesSaved = !onlySaved || saved.includes(post.day);
    const normalized = query.toLowerCase().trim();
    const matchesQuery = !normalized || post.title.toLowerCase().includes(normalized)
      || String(post.day) === normalized || `eps ${post.day}`.includes(normalized);
    return matchesPillar && matchesSaved && matchesQuery;
  }).sort((a, b) => sort === "asc" ? a.day - b.day : b.day - a.day), [posts, filter, saved, onlySaved, query, sort]);
  const displayed = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  useEffect(() => { setVisibleCount(8); }, [filter, query, sort, onlySaved]);

  useEffect(() => {
    if (status !== "ready" || !config) return;
    const needed = displayed.filter((post) => !materials[post.id] && !fetching.current.has(post.id));
    if (!needed.length) return;
    for (const post of needed) fetching.current.add(post.id);
    let alive = true;
    const supabase = getSupabase(config);
    async function loadDetails() {
      const ids = [...new Set(needed.map((post) => post.versionId))];
      const { data, error } = await supabase.from("prompt_versions").select("id,parts").in("id", ids);
      const byVersion = new Map((data ?? []).map((part) => [part.id, part.parts]));
      const resolved: Record<string, string[]> = {};
      const fallback = needed.filter((post) => error || !Array.isArray(byVersion.get(post.versionId)));
      for (const post of needed) {
        const value = byVersion.get(post.versionId);
        if (!error && Array.isArray(value)) resolved[post.id] = value.filter((part): part is string => typeof part === "string");
      }
      if (fallback.length) {
        const results = await Promise.all(fallback.map(async (post) => {
          const response = await supabase.rpc("admin_get_channel_post_for_edit", { p_post_id: post.id });
          return { post, parts: (response.data as { parts?: unknown } | null)?.parts };
        }));
        for (const { post, parts } of results) {
          if (Array.isArray(parts)) resolved[post.id] = parts.filter((part): part is string => typeof part === "string");
        }
      }
      if (alive) {
        setMaterials((current) => ({ ...current, ...resolved }));
        if (Object.keys(resolved).length !== needed.length) setStatusText("Beberapa materi belum bisa dibaca. Coba muat ulang halaman.");
      }
      await Promise.all(needed.map(async (post) => {
        const { data: signed, error: imageError } = await supabase.storage.from("channel-post-images").createSignedUrl(post.imagePath, 3600);
        if (!alive) return;
        if (imageError || !signed?.signedUrl) setMediaErrors((current) => ({ ...current, [post.id]: true }));
        else setImageUrls((current) => ({ ...current, [post.id]: signed.signedUrl }));
      }));
      needed.forEach((post) => fetching.current.delete(post.id));
    }
    void loadDetails();
    return () => { alive = false; needed.forEach((post) => fetching.current.delete(post.id)); };
  }, [status, config, displayed]);

  const toggleSaved = useCallback((day: number) => {
    setSaved((current) => {
      const next = current.includes(day) ? current.filter((n) => n !== day) : [...current, day];
      try { window.localStorage.setItem("pd-akses-bookmarks", JSON.stringify(next)); } catch { /* Ignore blocked local storage. */ }
      return next;
    });
  }, []);

  const share = useCallback(async (day: number) => {
    const url = `${window.location.origin}/akses?eps=${day}`;
    try {
      if (navigator.share) await navigator.share({ title: `Pebisnis Digital · EPS ${day}`, url });
      else { await navigator.clipboard.writeText(url); setNotification("Link episode disalin."); }
    } catch { /* Sharing can be dismissed by the user. */ }
  }, []);

  const selectFilter = (next: Filter) => { setOnlySaved(false); setFilter(next); };
  const activeCount = posts.length;

  return (
    <div className="akses-app">
      <header className="akses-topbar">
        <a href="/akses" className="akses-wordmark" aria-label="Beranda ruang belajar"><span className="akses-mark">p<span>.</span></span><span className="akses-brand-group"><span className="akses-brand-name">pebisnis<span className="akses-brand-dot">.</span>digital</span><small>RUANG BELAJAR</small></span></a>
        <div className="akses-top-actions">
          <span className="akses-top-label">365 EPISODE • SATU LANGKAH SETIAP HARI</span>
          <a href="/dashboard" className="akses-top-avatar" title="Kembali ke dashboard admin">V</a>
        </div>
      </header>

      <div className="akses-body">
        <aside className="akses-sidebar" aria-label="Navigasi ruang belajar">
          <div className="akses-side-menu">
            <button className={!onlySaved && filter === "SEMUA" ? "is-active" : ""} onClick={() => selectFilter("SEMUA")}><Icon name="home" /> <span>Beranda</span></button>
            <button onClick={() => document.getElementById("akses-search")?.focus()}><Icon name="search" /> <span>Cari materi</span></button>
            <button className={onlySaved ? "is-active" : ""} onClick={() => { setOnlySaved(true); setFilter("SEMUA"); }}><Icon name="bookmark" /> <span>Tersimpan</span></button>
          </div>
          <div className="akses-side-label">JELAJAHI PILAR</div>
          <div className="akses-side-categories">
            {PILLARS.map((pillar) => <button className={!onlySaved && filter === pillar ? "is-active" : ""} key={pillar} onClick={() => selectFilter(pillar)}><span className="akses-category-dot" style={{ background: PILLAR_META[pillar].color }} /> {pillar}</button>)}
          </div>
          <div className="akses-side-bottom"><span className="akses-side-bottom-icon">✳</span><strong>Belajar sedikit,<br />praktik sungguhan.</strong><p>Jangan cuma disimpan. Cobain satu langkah hari ini.</p></div>
          <small className="akses-side-copyright">© PEBISNIS DIGITAL</small>
        </aside>

        <main className="akses-main">
          <div className="akses-intro">
            <div className="akses-welcome"><span className="akses-kicker"><span /> PERPUSTAKAAN DIGITAL</span><h1>Ilmu yang bisa<br /><em>langsung dipakai.</em></h1><p>Buka gambarnya, baca materinya, lalu praktik. Sesimpel itu.</p></div>
            <div className="akses-progress-card"><span className="akses-progress-symbol">✦</span><strong>{status === "ready" ? activeCount : "365"}<small>EPISODE</small></strong><span className="akses-progress-caption">Bukan cuma buat dibaca.<br />Buat dikerjakan.</span></div>
          </div>

          {status === "loading" && <div className="akses-state-card" role="status"><div className="akses-spinner" /><h2>Menyiapkan ruang belajar...</h2><p>Sedang mengambil daftar episode dari kalender konten.</p></div>}

          {status === "locked" && <div className="akses-state-card akses-locked" role="status"><span className="akses-state-icon"><Icon name="lock" size={28} /></span><span className="akses-kicker">AKSES KHUSUS</span><h2>Materinya ada.<br />Pintunya masih terkunci.</h2><p>Untuk sekarang, ruang belajar bisa dibuka oleh admin terdaftar. Akses pembeli akan dihubungkan ke pesanan yang sudah terverifikasi.</p><a className="akses-primary" href="/login">Masuk Admin <Icon name="arrow" size={18} /></a><small>Sudah login? Muat ulang halaman ini.</small></div>}

          {status === "error" && <div className="akses-state-card" role="alert"><span className="akses-state-icon">!</span><h2>Waduh, materinya belum muncul.</h2><p>{statusText || "Coba buka lagi beberapa saat."}</p><button className="akses-primary" onClick={() => window.location.reload()}>Coba Lagi <Icon name="arrow" size={18} /></button></div>}

          {status === "ready" && <>
            <div className="akses-controls">
              <div className="akses-search-wrap"><Icon name="search" size={19} /><input id="akses-search" type="search" placeholder="Cari EPS atau topik..." value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" /><kbd>⌕</kbd></div>
              <button className="akses-sort" onClick={() => setSort(sort === "asc" ? "desc" : "asc")} aria-label="Ubah urutan episode">{sort === "asc" ? "EPS 1 → 365" : "EPS 365 → 1"} <span>↕</span></button>
            </div>
            <div className="akses-pill-row" role="group" aria-label="Filter pilar materi"><button className={!onlySaved && filter === "SEMUA" ? "selected" : ""} onClick={() => selectFilter("SEMUA")}>✳ Semua</button>{PILLARS.map((pillar) => <button key={pillar} className={!onlySaved && filter === pillar ? "selected" : ""} onClick={() => selectFilter(pillar)}>{pillar}</button>)}<button className={onlySaved ? "selected" : ""} onClick={() => { setOnlySaved(true); setFilter("SEMUA"); }}>☆ Tersimpan</button></div>
            <div className="akses-feed-heading"><div><span className="akses-feed-eyebrow">{onlySaved ? "KOLEKSI PRIBADI" : filter === "SEMUA" ? "UNTUK KAMU" : `PILAR ${filter}`}</span><h2>{onlySaved ? "Disimpan untuk nanti" : filter === "SEMUA" ? "Mulai dari satu langkah" : PILLAR_META[filter].description}</h2></div><span>{filtered.length} materi</span></div>
            {statusText && <p className="akses-inline-note" role="status">{statusText}</p>}
            {notification && <div className="akses-toast" role="status" onClick={() => setNotification("")}>{notification} ×</div>}
            <section className="akses-post-list" aria-label="Materi pembelajaran">
              {displayed.map((post) => {
                const parts = materials[post.id];
                const presentation = parts ? materialPresentation(parts) : null;
                const hasSaved = saved.includes(post.day);
                return <article className="akses-post" key={post.id} id={`episode-${post.day}`}>
                  <div className="akses-post-top"><div className="akses-post-avatar">{initials(post.pillar)}</div><div className="akses-post-author"><strong>pebisnis.digital <span className="akses-verified">✓</span></strong><small>Episode {String(post.day).padStart(3, "0")} <span>·</span> {post.pillar}</small></div><span className="akses-post-more">✳</span></div>
                  {imageUrls[post.id] ? <div className="akses-post-image"><img src={imageUrls[post.id]} alt={`Ilustrasi materi ${post.title}`} loading={post.day > 2 ? "lazy" : "eager"} /></div> : <div className="akses-post-image akses-image-placeholder" style={{ background: PILLAR_META[post.pillar].color }}><span className="akses-placeholder-label">PEBISNIS DIGITAL</span><span className="akses-placeholder-star">✳</span><strong>{mediaErrors[post.id] ? "Gambar belum tersedia" : "Menyiapkan ilustrasi..."}</strong><small>EPS {String(post.day).padStart(3, "0")}</small></div>}
                  <div className="akses-post-inner"><div className="akses-post-actions"><div><button aria-label="Bagikan episode" title="Bagikan" onClick={() => void share(post.day)}><Icon name="share" /></button><span className="akses-post-tag">{post.pillar}</span></div><button onClick={() => toggleSaved(post.day)} title={hasSaved ? "Hapus dari tersimpan" : "Simpan materi"} aria-label={hasSaved ? "Hapus dari tersimpan" : "Simpan materi"}><Icon name={hasSaved ? "bookmark-filled" : "bookmark"} /></button></div>
                    <span className="akses-episode-label">MATERI {String(post.day).padStart(3, "0")} / {total}</span>
                    <h3>{presentation?.title || post.title}</h3>
                    {!presentation ? <div className="akses-material-loading"><span /><span /><span /></div> : <div className="akses-material">{presentation.sections.map((section, i) => <section className="akses-material-section" key={i}>{section.heading && <h4>{section.heading}</h4>}{section.paragraphs.map((block, k) => <p key={k}>{block}</p>)}</section>)}</div>}
                    <div className="akses-post-footer"><span>✦ Pelan-pelan, yang penting jalan.</span><span>EPS {post.day}</span></div>
                  </div>
                </article>;
              })}
            </section>
            {!filtered.length && <div className="akses-empty"><Icon name="search" size={32} /><h3>Belum ketemu, Teh.</h3><p>Coba cari nomor episode, atau pilih pilar lain.</p><button onClick={() => { setQuery(""); setOnlySaved(false); setFilter("SEMUA"); }}>Lihat semua materi</button></div>}
            {filtered.length > visibleCount && <button className="akses-load-more" onClick={() => setVisibleCount((count) => count + 8)}>Muat 8 episode lagi <Icon name="arrow" size={18} /></button>}
            {filtered.length > 0 && <p className="akses-list-count">Menampilkan {Math.min(visibleCount, filtered.length)} dari {filtered.length} materi • Simpan yang mau kamu praktikkan</p>}
          </>}
        </main>

        <aside className="akses-rightbar" aria-label="Informasi ruang belajar"><div className="akses-right-head"><span className="akses-right-icon">✳</span><div><strong>RUANG BELAJAR</strong><small>Pebisnis Digital</small></div><span>AKTIF</span></div><div className="akses-right-divider" /><div className="akses-right-highlight"><span>BUKAN SEKADAR KONTEN</span><h2>Satu ide.<br />Satu aksi.<br /><em>Setiap hari.</em></h2><p>Nggak harus jago teknologi dulu. Mulai dari apa yang bisa kamu kerjakan hari ini.</p><div className="akses-right-decor">✦</div></div><div className="akses-right-section"><strong>4 PILAR UTAMA</strong>{PILLARS.map((pillar, index) => <button key={pillar} onClick={() => selectFilter(pillar)}><span style={{ background: PILLAR_META[pillar].color }}>0{index + 1}</span><div><b>{pillar}</b><small>{PILLAR_META[pillar].description}</small></div><span>↗</span></button>)}</div><p className="akses-right-foot">© 2026 Pebisnis Digital.<br />Materi untuk pembelajaran pribadi.</p></aside>
      </div>

      <nav className="akses-mobile-nav" aria-label="Navigasi bawah"><button className={!onlySaved && filter === "SEMUA" ? "active" : ""} onClick={() => selectFilter("SEMUA")}><Icon name="home" /><span>Beranda</span></button><button onClick={() => document.getElementById("akses-search")?.focus()}><Icon name="search" /><span>Cari</span></button><button className={onlySaved ? "active" : ""} onClick={() => { setOnlySaved(true); setFilter("SEMUA"); }}><Icon name="bookmark" /><span>Tersimpan</span></button><a href="/dashboard"><Icon name="grid" /><span>Admin</span></a></nav>
    </div>
  );
}
