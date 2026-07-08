# VULCAN GLASS — Anvelopa de sticlă

Demo tehnologic interactiv 3D pentru vulcanizări, inspirat de [igloo.inc](https://www.igloo.inc/): o anvelopă de sticlă randată live în browser.

**Live:** https://flaviusvranau1.github.io/vulcan-glass/

## Ce face

- **Intro de asamblare** — roata se construiește din piese împrăștiate, cu fizică de arcuri
- **Interacțiune cu cursorul** — crampoanele și prezoanele se feresc din calea mouse-ului și revin elastic; forța crește cu viteza cursorului
- **Cameră pe scroll** — 5 cadre cinematice, scroll cu inerție (Lenis)
- **Reactivitate la viteza de scroll** — turație, dâre de zăpadă, aberație cromatică
- **Strat ambiental** — puls pe inelele neon, micro-evenimente, plutire; scena nu stă niciodată nemișcată
- **Gardă de FPS** — calitatea coboară automat în trepte pe dispozitive lente

## Tehnologii

Three.js (MeshPhysicalMaterial cu transmission + dispersion, environment din lightformers, MSAA, bloom + grain soft-light) · GSAP (ScrollTrigger, SplitText) · Lenis. Fără bundler — trei fișiere statice.

---
Demo realizat de **Flavius Vranău** · se adaptează oricărui service auto
