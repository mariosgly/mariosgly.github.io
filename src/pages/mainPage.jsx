import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
// import GibsonModel from "../components/mesh/gibson";

/**
 * MeshPage — bright, minimal, hero with large portrait, left-anchored content, sticky nav,
 * and guitar that starts big to the right of the name, then docks into a placeholder (no bg).
 *
 * Changes per request:
 * - Larger portrait image; left column holds name + ps line + actions; links are bottom-anchored
 *   to align with the portrait's bottom.
 * - Removed ML title line; kept only ps line: "PhD Student · NYU Music Technology & MARL".
 * - Sticky mini-nav (top-left) with CV + Publications once hero is passed.
 * - Guitar starts on the RIGHT of the name, as large as fits inside the hero box; brighter lighting.
 * - Guitar has NO placeholder background; it docks ON TOP of the placeholder and then follows it.
 * - Mobile: circular portrait inline with name/title, paragraphs below
 */

const FAVORITE_CHORD = "Gmaj7"; // change me

// Define your 6 images with positions and descriptions
const ABOUT_IMAGES = [
  { id: 1, src: "/guitar.png", alt: "Classical Guitar", x: -40, y: -62, delay: 0 },
  { id: 2, src: "/mix.png", alt: "Audio Processing", x: -20, y: 60, delay: 0.1 },
  { id: 3, src: "/laptop.png", alt: "Coding", x: 40, y: -70, delay: 0.2 },
  { id: 4, src: "/robots.png", alt: "Robotics", x: 55, y: 30, delay: 0.3 },
  { id: 5, src: "/camp.png", alt: "Satellite Data", x: -55, y: 40, delay: 0.4 },
  { id: 6, src: "/disk.png", alt: "Music Production", x: 0, y: -80, delay: 0.5 },
];

const LINKS = {
  github: "https://github.com/mariosgly",
  linkedin: "https://www.linkedin.com/in/marios-glytsos-90182b222/",
  scholar: "https://scholar.google.com/citations?user=i37_tFoAAAAJ&hl=en&oi=ao",
  email: "mailto:mariosgly@gmail.com",
  cv: "/CV_Marios_Glytsos.pdf", // or route to "/cv"
};

// Demo publications — replace with your real data
const PUBLICATIONS = [
    {
    id: "pub-3",
    title: "Category-Level 6D Object Pose Estimation in Agricultural Settings Using a Lattice-Deformation Framework and Diffusion-Augmented Synthetic Data",
    venue: "IROS",
    year: 2025,
    image: "/iros25.png",
    link: "https://arxiv.org/abs/2505.24636",
    bibtex: `@inproceedings{glytsos2025beat,
  title={Category-Level 6D Object Pose Estimation in Agricultural Settings Using a Lattice-Deformation Framework and Diffusion-Augmented Synthetic Data},
  author={Glytsos, Marios Filntisis, Panagiotis and Retsinas, George and Maragos, Petros},
  booktitle={IEEE/RSJ International Conference on Intelligent Robots and Systems, IROS },
  year={2025}
}`,
  },
  {
    id: "pub-2",
    title: "Power in unity: Combining in-domain and out-of-domain pre-training strategies for eeg-based person identification",
    venue: "ICASSP",
    year: 2024,
    image: "/icassp24.png",
    link: "https://ieeexplore.ieee.org/document/10889003",
    bibtex: `@inproceedings{garoufis20252ndgrandchallenge,
  title={Power in unity: Combining in-domain and out-of-domain pre-training strategies for eeg-based person identification},
  author={Garoufis, Christos and Glytsos, Marios and Chourdaki, Ioanna and Filntisis, Panagiotis and Maragos, Petros},
  booktitle={Int’l Conf. on Acoustics, Speech and Signal Processing (ICASSP)},
  year={2024}
}`,
  },
    {
    id: "pub-1",
    title: "Classical Guitar Duet Separation using GuitarDuets - a Dataset of Real and Synthesized Guitar Recordings",
    venue: "ISMIR",
    year: 2024,
    image: "/ismir24.png",
    link: "https://zenodo.org/records/14877285",
    bibtex: `@inproceedings{glytsos2024guitarduets,
  title={Classical Guitar Duet Separation using GuitarDuets - a Dataset of Real and Synthesized Guitar Recordings},
  author={Glytsos, Marios and Garoufis, Christos and Zlatintsi, Athanasia and Maragos, Petros},
  booktitle={Int'l Society for Music Information Retrieval Conf. (ISMIR)},
  year={2024}
}`,
  },

];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { const x = clamp01(t); return 1 - Math.pow(1 - x, 3); }

export default function MainPage() {
  const heroRef = useRef(null);
  const heroCardRef = useRef(null);
  const textColRef = useRef(null);
  const portraitRef = useRef(null);
  const placeholderRef = useRef(null);
  const publicationsRef = useRef(null);

  const [scrollY, setScrollY] = useState(0);
  const [showNav, setShowNav] = useState(false);
  const [revealChord, setRevealChord] = useState(false);
  const [introT, setIntroT] = useState(0); // time-based intro (0→1)
  const [portraitH, setPortraitH] = useState(480);

  const [bgSketchOn, setBgSketchOn] = useState(false);
  const [showAboutImages, setShowAboutImages] = useState(false);

  // Smooth intro for subtle drop-in at load
  useEffect(() => {
    let raf = 0; let start = performance.now();
    const dur = 700; // ms
    const loop = (now) => {
      const t = clamp01((now - start) / dur);
      setIntroT(t);
      if (t < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scroll + reveal mini nav
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrollY(y);
      const hero = heroRef.current;
      if (hero) {
        const heroBottom = hero.offsetTop + hero.offsetHeight;
        setShowNav(y > heroBottom - 60);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Measure portrait height to anchor links baseline with its bottom
  useEffect(() => {
    const measure = () => setPortraitH(portraitRef.current?.clientHeight || 480);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Viewport + target rect helpers
  const viewport = useViewportSize();
  const dockRect = useDockRect(placeholderRef);

  // Docking threshold (when to aim for the placeholder center)
  const dockStartY = useMemo(() => {
    const phDocTop = dockRect.docTop;
    return Math.max(0, phDocTop - viewport.h * 0.6);
  }, [dockRect.docTop, viewport.h]);

  // Easing from start (near hero) → placeholder center
  const travelT = useMemo(() => {
    const span = Math.max(1, dockStartY - 120); // give it more scroll runway
    return easeOutCubic((scrollY - 0) / span);
  }, [scrollY, dockStartY]);

  // Compute guitar's start position: right side of the hero card (to the right of the name/text)
  const heroRect = heroCardRef.current?.getBoundingClientRect();
  const startY = heroRect ? heroRect.top + heroRect.height / 2 : viewport.h * 0.4;

  // Size: as large as fits hero visually (slightly smaller to avoid covering text)
  const canvasH = heroRect ? Math.min(Math.max(heroRect.height * 0.75, 320), 520) : Math.min(viewport.h * 0.48, 520);
  const canvasW = Math.min(Math.max(canvasH * 0.65, 300), 640);

  const startX = heroRect ? (heroRect.right - canvasW * 0.55) : viewport.w * 0.8;

  // End position: placeholder center (updates so it follows when docked)
  const endX = dockRect.centerX;
  const endY = dockRect.centerY;

  const currX = travelT < 1 ? lerp(startX, endX, travelT) : endX;
  const currY = travelT < 1 ? lerp(startY, endY, travelT) : endY;

  // Intro offset & opacity
  const introOffsetY = (1 - easeOutCubic(introT)) * 22; // px
  const introOpacity = 0.6 + 0.4 * easeOutCubic(introT);

  const handleScrollToPubs = () => publicationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleCopy = async (txt) => {
    try { await navigator.clipboard.writeText(txt); } catch (e) {
      const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
  };

  return (
    <>
      <style>{`
        :root {
          --bg: #f6f7fb;            /* page background */
          --fg: #0f172a;            /* primary text */
          --muted: #475569;         /* slate-600 */
          --accent: #6b9cff;        /* soft blue */
          --accent-2: #ffd166;      /* warm highlight */
          --card: #ffffff;          /* cards */
          --ring: rgba(20,30,60,0.12);
          --ring-strong: rgba(20,30,60,0.22);
          --shadow: 0 10px 30px rgba(16,24,40,0.12);
          --shadow-lg: 0 24px 70px rgba(16,24,40,0.16);
        }
        html, body, #root { height: 100%; }
        body { margin: 0; background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, "Helvetica Neue", Arial; }
        a { color: var(--fg); text-decoration: none; }

        /* Fixed mini-nav */
        .miniNav { position: fixed; top: 18px; right: 18px; z-index: 40; display: flex; gap: 10px; padding: 8px; background: rgba(255,255,255,0.85); border: 1px solid var(--ring); border-radius: 14px; box-shadow: var(--shadow); backdrop-filter: blur(6px); opacity: 0; pointer-events: none; transform: translateY(-10px); transition: all .25s ease; }
        .miniNav.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
        .miniLink { padding: 8px 12px; border-radius: 10px; border: 1px solid transparent; transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease; }
        .miniLink:hover { transform: translateY(-1px); border-color: var(--ring-strong); background: #fff; box-shadow: var(--shadow); }

        /* Guitar Canvas — no background or border */
        .canvasWrap { position: fixed; z-index: 20; pointer-events: auto; will-change: transform, opacity; }
        .canvasInner { width: 100%; height: 100%; border-radius: 0; overflow: visible; box-shadow: none; }

        /* HERO */
        .hero { min-height: 100vh; display: grid; place-items: center;}
        .heroCard { max-width: 1200px;  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.76)); border: 1px solid var(--ring); border-radius: 24px; padding: clamp(18px, 4vw, 40px); box-shadow: var(--shadow); backdrop-filter: blur(8px); transition: transform .5s ease, box-shadow .5s ease, border-color .5s ease; }
        .heroCard:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--ring-strong); }

        /* About card with hover images */
        .aboutCard {
          position: relative;
          overflow: visible; /* Allow images to show outside card bounds */
          transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease;
        }

        .aboutCard:hover {
          transform: translateY(-5px) scale(1.02);
          box-shadow: var(--shadow-lg);
          border-color: var(--ring-strong);
        }

        .aboutImages {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: -1;
        }

        .aboutImage {
          position: absolute;
          width: 60px;
          height: 60px;
          object-fit: cover;
          opacity: 0;
          transform: translateZ(0) scale(0.5);
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          background: transparent;
        }

        .aboutImages.show .aboutImage {
          opacity: 1;
          transform: translateZ(0) scale(1);
        }


        .heroGrid { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: clamp(18px, 5vw, 56px); align-items: stretch; }

        .textCol { display: flex; flex-direction: column; min-height: 360px; text-align: left; position: relative; }
        .name { font-size: clamp(32px, 5.2vw, 54px); line-height: 1.00; margin: 0; letter-spacing: 0.2px; text-align: left; }
        .ps { margin: 6px 0 8px; font-weight: 300; color: var(--muted); text-align: left; }
        .blurb { margin: 8px 0 10px; color: var(--muted); text-align: left; }
        .paragraph { margin: 8px 0 10px; text-align: left; color: black; }

        .lead {
          margin-block-start: clamp(40px, 8.4vw, 62px);
        }


         /* === NEW: page-wide background image with sketch reveal === */
        .bgImage {
          position: fixed;
          inset: 0;
          z-index: 0;             /* sits under all content */
          background: url("/background.png") center / cover no-repeat;
          opacity: 0;             /* hidden by default */
          filter: saturate(0.85) contrast(1.02) brightness(0.98);
          transition: opacity 1.2s ease;
          pointer-events: none;   /* never blocks clicks */
        }
        /* Hatching overlay that fades out, giving a “drawn” feel */
        .bgImage::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 1;
          /* diagonal pencil-hatch look */
          background:
            repeating-linear-gradient(115deg,
              rgba(255,255,255,0.98) 0 14px,
              rgba(255,255,255,0.65) 14px 28px);
          mix-blend-mode: lighten;
          opacity: 0;             /* off when bg is hidden */
          pointer-events: none;
        }
        .bgImage.reveal {
          opacity: 1;
        }
        .bgImage.reveal::after {
          /* wipe from left->right, then fade the hatch away */
          animation: hatchWipe 1.6s ease-out forwards, hatchFade 0.8s 1.2s ease forwards;
          opacity: 1;
        }
        @keyframes hatchWipe {
          0%   { clip-path: inset(0 0 0 100%); }
          60%  { clip-path: inset(0 0 0 0); }
          100% { clip-path: inset(0 0 0 0); }
        }
        @keyframes hatchFade {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }


        /* Mobile header layout */
        .mobileHeader { display: none; }
        .mobileBody { display: none; }
        .portraitMobile { width: clamp(100px, 12vw, 100px); height: clamp(100px, 12vw, 100px); border-radius: 50%; object-fit: cover; box-shadow: var(--shadow); margin-right: 16px; }
        .nameAndTitle { flex: 1; }

        /* if you want a bit more breathing room on narrow screens */
        @media (max-width: 940px) {
          .lead { margin-block-start: 18px; }
        }

        .bottomRow {
          position: absolute;
          bottom: 0; left: 0; right: 0; margin-top: auto;
          display: flex; align-items: flex-end; gap: 14px;
          justify-content: space-between; /* links left, buttons right */
        }

        /* kill the auto-push on links when inside bottomRow */
        .linksBottom { margin-top: 0; }

        /* mobile: fall back to normal flow */
        @media (max-width: 980px) {
          .bottomRow { position: static; flex-wrap: wrap; justify-content: flex; align-items: flex-end; gap: 12px; }
        }

        .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 0px 0; }
        .btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px; border-radius: 14px; border: 1px solid var(--ring); background: #fff; box-shadow: var(--shadow); transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease; }
        .btn:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); border-color: var(--ring-strong); }
        .btnAccent { background: linear-gradient(135deg, var(--accent), #8ec5ff); color: #0b1220; border-color: transparent; }

        .linksBottom { margin-top: auto; display: flex; gap: 14px; align-items: flex-end; }
        .linkItem { border-bottom: 1px dashed rgba(20,30,60,0.25); padding-bottom: 2px; opacity: 0.9; transition: opacity .2s ease, transform .2s ease; }
        .linkItem:hover { opacity: 1; transform: translateY(-1px); }

        .linkScholar::after { content: "Google Scholar"; }

        /* shrink on narrow screens */
        @media (max-width: 1020px) {
          .linkScholar::after { content: "Scholar"; }
        }

        .portrait { height: clamp(340px, 54vh, 480px); width: auto; max-width: 44vw; object-fit: cover; border-radius: 22px; box-shadow: var(--shadow); }

        /* Sections */
        // .afterHero { background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%); }
        .section { padding: 8vh 6vw; max-width: 1200px; margin: 0 auto; }
        .twoCol { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: clamp(18px, 5vw, 64px); align-items: start; }
        .card { background: var(--card); border: 1px solid var(--ring); border-radius: 18px; padding: clamp(16px, 2.4vw, 28px); box-shadow: var(--shadow); transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
        .card:hover { transform: translateY(-3px); box-shadow: var(--shadow-lg); border-color: var(--ring-strong); }
        .small { color: var(--muted); font-size: 0.95rem; }
        .tap { cursor: pointer; user-select: none; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        /* Publications grid */
        .pubGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
        .pubCard { display: grid; grid-template-rows: 160px auto; gap: 10px; padding: 12px; border-radius: 16px; border: 1px solid var(--ring); background: #fff; box-shadow: var(--shadow); transition: transform .2s ease, box-shadow .2s ease; }
        .pubCard:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
        .pubImg { width: 100%; height: 160px; border-radius: 12px; border: 1px solid var(--ring); }
        .pubMeta { display: grid; gap: 6px; }
        .pubTitle { font-size: 1.05rem; margin: 0; }
        .pubVenue { color: var(--muted); font-size: 0.95rem; }
        .pubRow { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .copyBtn { padding: 6px 10px; border-radius: 10px; border: 1px solid var(--ring); background: #fff; transition: transform .15s ease, box-shadow .15s ease; color: black; }
        .copyBtn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }


        @media (max-width: 500px) {
         .bottomRow { 
            position: static; 
            margin-top: 24px; 
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }
          
          .linksBottom { 
            justify-content: center; 
            order: 2; /* Links go below actions */
          }
        }

        @media (max-width: 600px) { 
        
          .aboutImage[data-id="1"] { left: calc(50% - 40%) !important; top: calc(50% - 57%) !important; }
          .aboutImage[data-id="2"] { left: calc(50% - 20%) !important; top: calc(50% + 60%) !important; }
          .aboutImage[data-id="3"] { left: calc(50%  -70%px) !important; top: calc(50% - 60%) !important; }
          .aboutImage[data-id="4"] { left: calc(50% - 30 %) !important; top: calc(50% + 50%) !important; }
          .aboutImage[data-id="5"] { left: calc(50% - 55 %) !important; top: calc(50% + 40%) !important; }
          .aboutImage[data-id="6"] { left: calc(50%) !important; top: calc(50% - 65%) !important; }
        }

        /* Responsive - Mobile Layout */
        @media (max-width: 940px) {
          /* Hide desktop grid, show mobile layout */
          .heroGrid { display: none; }
          .mobileHeader { display: flex; align-items: flex-start; margin-bottom: 24px; }
          
          /* Text column adjustments for mobile */
          .textCol { 
            min-height: auto; 
            position: static; /* Remove relative positioning */
          }

          .mobileBody { display: block; }
          
          /* Bottom row becomes normal flow on mobile */
          
          
          .actions { 
            justify-content: center;
            order: 1; /* Actions go above links */
          }
        }
      `}</style>


      {/* <div className={`bgImage ${bgSketchOn ? "reveal" : ""}`} /> */}

      {/* Mini Nav */}
      <div className={`miniNav ${showNav ? "show" : ""}`}>
        <a className="miniLink" href={LINKS.cv} target="_blank" rel="noopener noreferrer">CV</a>
        <button className="miniLink" onClick={() => publicationsRef.current?.scrollIntoView({ behavior: "smooth" })}>Publications</button>
      </div>



      <main>
        {/* HERO */}
        <section ref={heroRef} className="hero">
          <div ref={heroCardRef} className="heroCard"
          //  onMouseEnter={() => setBgSketchOn(true)}
          //   onMouseLeave={() => setBgSketchOn(false)}
          >
            {/* Desktop layout */}
            <div className="heroGrid">
              {/* Left: large portrait */}
              <div style={{ display: "grid", placeItems: "center" }}>
                <img ref={portraitRef} className="portrait" src="/profile.png" alt="Marios Glytsos" />
              </div>

              {/* Right: text, left-aligned; links baseline aligned to portrait bottom */}
              <div ref={textColRef} className="textCol" style={{ minHeight: portraitH }}>
                <div>
                  <h1 className="name">Marios Glytsos</h1>
                  <p className="ps">PhD Student · NYU Music Technology & MARL</p>

                  <p className="paragraph lead">Hey there! My name is Marios Glytsos, and I'm from Athens, Greece. I'm currently a PhD student in Music Technology at New York University, working with Prof. Brian McFee. Before that, I studied Electrical and Computer Engineering at the National Technical University of Athens (NTUA), where I had the chance to work under Prof. Petros Maragos.</p>
                  <p className="paragraph">I'm fascinated by signal and audio processing, multimodal perception, and 3D worlds, but above all, I just love building, exploring, and discovering new ways technology, creativity and discovery can meet.</p>
                </div>
                <div className="bottomRow">
                  <div className="linksBottom">
                    <a className="linkItem" href={LINKS.github} target="_blank" rel="noopener noreferrer">GitHub</a>
                    <a
                      className="linkItem linkScholar"
                      href={LINKS.scholar}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                    <a className="linkItem" href={LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                  </div>
                  <div className="actions">
                    <a className="btn btnAccent" href={LINKS.cv} target="_blank" rel="noopener noreferrer">View CV</a>
                    <a className="btn" href={LINKS.email}>Email</a>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile layout */}
            <div className="mobileHeader">
              <img className="portraitMobile" src="/profile.png" alt="Marios Glytsos" />
              <div className="nameAndTitle">
                <h1 className="name">Marios Glytsos</h1>
                <p className="ps">PhD Student · NYU Music Technology & MARL</p>
              </div>
            </div>

            {/* Mobile content - only shows on mobile */}
            <div className="mobileBody">
              <div className="textCol">
                <div style={{ display: 'block' }}>
                  <p className="paragraph lead">Hey there! My name is Marios Glytsos, and I'm from Athens, Greece. I'm currently a PhD student in Music Technology at New York University, working with Prof. Brian McFee. Before that, I studied Electrical and Computer Engineering at the National Technical University of Athens (NTUA), where I had the chance to work under Prof. Petros Maragos.</p>
                  <p className="paragraph">I'm fascinated by signal and audio processing, multimodal perception, and 3D worlds, but above all, I just love building, exploring, and discovering new ways technology, creativity and discovery can meet.</p>
                </div>

                <div className="bottomRow">
                  <div className="actions">
                    <a className="btn btnAccent" href={LINKS.cv} target="_blank" rel="noopener noreferrer">View CV</a>
                    <a className="btn" href={LINKS.email}>Email</a>
                  </div>
                  <div className="linksBottom">
                    <a className="linkItem" href={LINKS.github} target="_blank" rel="noopener noreferrer">GitHub</a>
                    <a
                      className="linkItem linkScholar"
                      href={LINKS.scholar}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                    <a className="linkItem" href={LINKS.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom half with light background */}
        <div className="afterHero">
          {/* ABOUT + Placeholder (guitar docks ON this card; no guitar background) */}
          {/* <section className="section">
            <div className="twoCol">
              <article className="card">
                <h2 style={{ marginTop: 0 }}>About me</h2>
                <p>
                  I like building things, exploring ideas, and blending music, technology, and creativity. I grew up in Athens, Greece, where I studied Computer Engineering and classical guitar. My research interests are in multimodal machine perception, which means applying deep learning to audio and visual data. This can range from 6D pose estimation for robotics to audio localization and music source separation. Music has always been a big part of my life: I perform live as a soloist and with bands, and I also produce, record, mix, and master music. Outside academia, I co-founded Caius, a startup that uses AI and satellite data to digitize and protect rural areas. With my team, we’ve mapped trails, supported sustainability projects, and were featured in Forbes Greece 30 Under 30 and funded by the European Space Agency.
                </p>
              </article>

              Placeholder — NO heading/name, just the small line
              <aside ref={placeholderRef} className="card" style={{ position: "relative", minHeight: 260 }}>
                <p className="small" style={{ marginTop: 0, opacity: 0.8 }}>tap me if you want to know what my favorite chord is</p>
                <div className="mono" style={{ fontSize: "2rem", letterSpacing: "1px", opacity: revealChord ? 1 : 0.15, transition: "opacity .25s ease" }}>
                  {revealChord ? `🎸 ${FAVORITE_CHORD}` : ""}
                </div>
              </aside>
            </div>
          </section> */}

          <section className="section">
            <article
              className="card aboutCard"
              onMouseEnter={() => setShowAboutImages(true)}
              onMouseLeave={() => setShowAboutImages(false)}
            >
              <h2 style={{ marginTop: 0 }}>About me</h2>
              <p>
                I like building things, exploring ideas, and blending music, technology, and creativity. I grew up in Athens, Greece, where I studied Computer Engineering and classical guitar. My research interests are in multimodal machine perception, which means applying deep learning to audio and visual data. This can range from 6D pose estimation for robotics to audio localization and music source separation. Music has always been a big part of my life: I perform live as a soloist and with bands, and I also produce, record, mix, and master music. Outside academia, I co-founded Caius, a startup that uses AI and satellite data to digitize and protect rural areas. With our team, we've mapped trails, supported sustainability projects, and were featured in Forbes Greece 30 Under 30 and funded by the European Space Agency.
              </p>

              {/* Floating images */}
              <div className={`aboutImages ${showAboutImages ? 'show' : ''}`}>
                {ABOUT_IMAGES.map((img) => (
                  <img
                    key={img.id}
                    className="aboutImage"
                    data-id={img.id}
                    src={img.src}
                    alt={img.alt}
                    style={{
                      left: `calc(50% + ${img.x}%)`,
                      top: `calc(50% + ${img.y}%)`,
                      transitionDelay: showAboutImages ? `${img.delay}s` : '0s',
                      transform: `translate(-50%, -50%) ${showAboutImages ? 'scale(1)' : 'scale(0.5)'}`,
                    }}
                  />
                ))}
              </div>
            </article>
          </section>

          {/* Publications grid */}
          <section ref={publicationsRef} id="publications" className="section">
            <h2 style={{ marginTop: 0 }}>Publications</h2>
            <div className="pubGrid">
              {PUBLICATIONS.map((p) => (
                <article key={p.id} className="pubCard">
                  <img className="pubImg" src={p.image} alt={p.title} />
                  <div className="pubMeta">
                    <h4 className="pubTitle">{p.title}</h4>
                    <div className="pubVenue">{p.venue} · {p.year}</div>
                    <div className="pubRow">
                      <button className="copyBtn" onClick={() => handleCopy(p.bibtex)}>Copy BibTeX</button>
                      <a
                        className="linkItem"
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >Paper</a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="section" style={{ paddingBottom: "16vh" }}>
            <div className="small" style={{ opacity: 0.65 }}>© {new Date().getFullYear()} Marios Glytsos</div>
          </section>
        </div>
      </main>
    </>
  );
}

// ---- Hooks ----
function useViewportSize() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onR = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return vp;
}

function useDockRect(ref) {
  const [rect, setRect] = useState({ docTop: 500, centerX: window.innerWidth * 0.75, centerY: window.innerHeight * 0.62 });
  useEffect(() => {
    const compute = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const docTop = r.top + window.scrollY;
      const centerX = r.left + r.width / 2;
      const centerY = r.top + r.height / 2;
      setRect({ docTop, centerX, centerY });
    };
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => { window.removeEventListener("scroll", compute); window.removeEventListener("resize", compute); };
  }, [ref]);
  return rect;
}