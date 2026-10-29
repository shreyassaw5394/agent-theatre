// agenttheatre.dev. No analytics, no cookies, no third-party requests.
// The headline reveal, the "now showing" board, the copy button, the FAQ drawer and section entrances.
(() => {
  document.documentElement.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const live = (m) => { const l = $("#live"); if (l) l.textContent = m; };

  const init = () => {
    // copy
    for (const b of $$(".cmd[data-copy]")) b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch { return; }
      const a = $(".cmd-act", b); b.classList.add("done"); if (a) a.textContent = "Copied"; live(`Copied: ${b.dataset.copy}`);
      setTimeout(() => { b.classList.remove("done"); if (a) a.textContent = "Copy"; }, 1600);
    });

    // the title card: each line rises from behind its baseline, then the rest settles in
    const hero = $(".hero"), shout = $(".shout");
    requestAnimationFrame(() => setTimeout(() => { hero?.classList.add("in"); shout?.classList.add("in"); }, reduce ? 0 : 120));

    // now showing: one open row at a time
    const rows = $$(".b-row:not(.b-ghost)");
    const open = (row) => {
      for (const r of rows) {
        const on = r === row;
        r.classList.toggle("open", on);
        $(".b-btn", r)?.setAttribute("aria-expanded", String(on));
      }
    };
    rows.forEach((r) => $(".b-btn", r)?.addEventListener("click", () => open(r)));
    const board = $(".board");
    $$(".b-row", board ?? document).forEach((r, i) => r.style.setProperty("--d", `${i * 60}ms`));

    // the FAQ drawer opens one card at a time (the name attribute does this natively; this covers older browsers)
    const cards = $$(".drawer details");
    cards.forEach((d) => d.addEventListener("toggle", () => { if (d.open) cards.forEach((o) => { if (o !== d) o.open = false; }); }));

    // the film band plays only on screen, never under reduced motion, and can be paused
    const vid = $("#film-video"), ctl = $(".film-ctl");
    if (vid && !reduce && "IntersectionObserver" in window) {
      let userPaused = false;
      const label = () => { if (ctl) ctl.textContent = vid.paused ? "Play" : "Pause"; };
      vid.addEventListener("play", label); vid.addEventListener("pause", label);
      label();
      if (ctl) { ctl.hidden = false; ctl.addEventListener("click", () => { userPaused = !vid.paused; if (userPaused) vid.pause(); else vid.play().catch(() => {}); }); }
      new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting && !userPaused) vid.play().catch(() => {}); else vid.pause(); } }, { threshold: 0.25 }).observe(vid);
    }

    // entrances: the parts of each section arrive in reading order, once
    const parts = $$("[data-r]"), seen = new Map();
    for (const p of parts) { const s = p.closest("section") ?? document.body; const n = seen.get(s) ?? 0; p.style.setProperty("--d", `${Math.min(n, 8) * 70}ms`); seen.set(s, n + 1); }
    const targets = board ? [...parts, board] : parts;
    if (reduce || !("IntersectionObserver" in window)) targets.forEach((p) => p.classList.add("in"));
    else {
      const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }, { rootMargin: "0px 0px 8% 0px", threshold: 0 });
      targets.forEach((p) => io.observe(p));
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
