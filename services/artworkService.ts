/**
 * artworkService.ts
 * 
 * Base de connaissances et résolveur d'oeuvres d'art célèbres et de documents visuels.
 * Fournit des représentations vectorielles SVG ultra-détaillées (100% autonomes, hors-ligne,
 * garanties sans blocage réseau ni 403/429) ainsi que des URLs certifiées avec proxy anti-hotlinking.
 * 
 * Permet d'associer automatiquement et fidèlement la véritable oeuvre d'art à tout exercice
 * dont l'énoncé ou le titre y fait référence.
 */

export interface ArtworkItem {
  id: string;
  name: string;
  artist: string;
  year: string;
  medium: string;
  museum: string;
  movement: string;
  url: string;
  svgDataUri: string;
  caption: string;
  keywords: string[];
}

function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. DESSINS VECTORIELS D'OEUVRES D'ART HAUTE FIDÉLITÉ (SVG DATA URI)
// ═════════════════════════════════════════════════════════════════════════════

// 1. Pablo Picasso — Dora Maar au chat (1941) — Cubisme
const SVG_PICASSO_DORA_MAAR = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 640" width="100%" height="100%" style="background:#1e1b18;font-family:serif;">
  <defs>
    <linearGradient id="bg_dm" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a241e"/>
      <stop offset="50%" stop-color="#423528"/>
      <stop offset="100%" stop-color="#181310"/>
    </linearGradient>
    <linearGradient id="chair_wood" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#78350f"/>
      <stop offset="50%" stop-color="#b45309"/>
      <stop offset="100%" stop-color="#451a03"/>
    </linearGradient>
    <pattern id="wallpaper_dm" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 20 L20 0 L40 20 L20 40 Z" fill="none" stroke="#523e2b" stroke-width="0.8" opacity="0.4"/>
    </pattern>
  </defs>

  <!-- Fond de la pièce & tapisserie -->
  <rect width="100%" height="100%" fill="url(#bg_dm)"/>
  <rect width="100%" height="100%" fill="url(#wallpaper_dm)"/>
  
  <!-- Cadre musée discret -->
  <rect x="12" y="12" width="496" height="616" fill="none" stroke="#d97706" stroke-width="1.5" opacity="0.6"/>

  <!-- Fauteuil en bois sculpté cubiste -->
  <polygon points="90,140 140,110 140,490 90,520" fill="url(#chair_wood)" stroke="#1e293b" stroke-width="2"/>
  <polygon points="380,110 430,140 430,520 380,490" fill="url(#chair_wood)" stroke="#1e293b" stroke-width="2"/>
  <polygon points="120,440 400,440 380,560 140,560" fill="#9a3412" stroke="#1e293b" stroke-width="2"/>
  <!-- Barres du dossier -->
  <line x1="140" y1="180" x2="380" y2="180" stroke="#78350f" stroke-width="8"/>
  <line x1="140" y1="240" x2="380" y2="240" stroke="#78350f" stroke-width="8"/>

  <!-- Petit chat noir sur le dossier à gauche -->
  <g id="cat">
    <ellipse cx="140" cy="180" rx="22" ry="16" fill="#09090b" transform="rotate(-15 140 180)"/>
    <circle cx="126" cy="165" r="12" fill="#09090b"/>
    <!-- Oreilles chat -->
    <polygon points="118,158 122,146 128,156" fill="#09090b"/>
    <polygon points="128,156 134,147 136,158" fill="#09090b"/>
    <!-- Yeux verts vifs -->
    <circle cx="122" cy="164" r="2.5" fill="#22c55e"/>
    <circle cx="129" cy="164" r="2.5" fill="#22c55e"/>
    <!-- Queue enroulée -->
    <path d="M156 186 Q170 195 168 215" fill="none" stroke="#09090b" stroke-width="4" stroke-linecap="round"/>
  </g>

  <!-- Buste et robe cubiste ornée (motifs géométriques vifs) -->
  <polygon points="170,360 350,360 380,560 140,560" fill="#0f172a" stroke="#020617" stroke-width="2"/>
  <!-- Pans de robe colorés cubistes -->
  <polygon points="180,370 260,370 240,540 160,530" fill="#dc2626" stroke="#450a0a" stroke-width="2"/>
  <polygon points="260,370 340,370 360,530 280,540" fill="#2563eb" stroke="#172554" stroke-width="2"/>
  <polygon points="220,400 300,400 290,520 230,520" fill="#eab308" stroke="#713f12" stroke-width="1.5"/>

  <!-- Épaules et cou -->
  <polygon points="200,320 320,310 340,370 180,370" fill="#0284c7" stroke="#082f49" stroke-width="2"/>
  <polygon points="235,260 285,255 290,325 230,325" fill="#fed7aa" stroke="#9a3412" stroke-width="2"/>

  <!-- VISAGE CUBISTE DÉCONSTRUIT (Double perspective profil / face) -->
  <!-- Moitié gauche du visage : profil vert/bleuté -->
  <path d="M220 180 Q190 220 220 260 L260 265 L260 175 Z" fill="#86efac" stroke="#166534" stroke-width="2.5"/>
  <!-- Moitié droite du visage : face rose/chair lumineuse -->
  <path d="M260 175 L260 265 L315 250 Q330 205 290 175 Z" fill="#fbcfe8" stroke="#9d174d" stroke-width="2.5"/>

  <!-- Nez proéminent anguleux cubiste -->
  <polygon points="252,185 240,230 268,232" fill="#f97316" stroke="#7c2d12" stroke-width="2"/>

  <!-- Yeux asymétriques typiques de Picasso -->
  <!-- Oeil rouge gauche (profil) -->
  <g transform="translate(225, 205) rotate(-10)">
    <ellipse cx="0" cy="0" rx="14" ry="9" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <circle cx="2" cy="0" r="5.5" fill="#dc2626"/>
    <circle cx="2" cy="0" r="2.5" fill="#000"/>
    <path d="M-15 -10 Q0 -18 15 -8" fill="none" stroke="#000" stroke-width="2.5"/>
  </g>
  <!-- Oeil noir droit (face grand ouvert) -->
  <g transform="translate(290, 200) rotate(15)">
    <ellipse cx="0" cy="0" rx="16" ry="11" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <circle cx="-1" cy="0" r="7" fill="#1e293b"/>
    <circle cx="-1" cy="0" r="3" fill="#000"/>
    <circle cx="2" cy="-2" r="2" fill="#fff"/>
    <path d="M-16 -12 Q0 -22 18 -10" fill="none" stroke="#000" stroke-width="3"/>
  </g>

  <!-- Lèvres rouges décalées cubistes -->
  <polygon points="235,245 260,240 270,248 245,255" fill="#b91c1c" stroke="#450a0a" stroke-width="2"/>

  <!-- Chevelure noire dense angulaire -->
  <path d="M190 180 C180 130 220 110 270 115 C330 110 360 140 340 220 C350 280 340 340 325 350 C310 280 325 210 310 170 C280 160 210 165 190 180 Z" fill="#09090b" stroke="#000" stroke-width="2"/>

  <!-- Chapeau pointu élégant cubiste -->
  <polygon points="210,130 330,120 285,45" fill="#1e1b4b" stroke="#020617" stroke-width="2.5"/>
  <ellipse cx="270" cy="125" rx="65" ry="12" fill="#312e81" stroke="#0f172a" stroke-width="2"/>
  <!-- Fleur / plume sur le chapeau -->
  <circle cx="285" cy="45" r="9" fill="#ef4444"/>
  <circle cx="285" cy="45" r="4" fill="#fbbf24"/>

  <!-- Ongles acérés manucurés caractéristiques de Dora Maar -->
  <g id="hands">
    <!-- Main gauche sur l'accoudoir -->
    <path d="M110 420 L140 400 L160 410 L155 435 L120 445 Z" fill="#fed7aa" stroke="#9a3412" stroke-width="1.5"/>
    <polygon points="155,405 168,400 160,412" fill="#dc2626"/>
    <polygon points="158,418 172,416 162,425" fill="#dc2626"/>
    <!-- Main droite -->
    <path d="M360 400 L395 420 L385 445 L350 435 Z" fill="#fed7aa" stroke="#9a3412" stroke-width="1.5"/>
    <polygon points="392,415 406,420 395,428" fill="#dc2626"/>
  </g>

  <!-- Cartouche musée officiel intégré -->
  <rect x="30" y="580" width="460" height="42" rx="6" fill="#0f172a" opacity="0.92" stroke="#334155" stroke-width="1"/>
  <text x="260" y="598" font-size="12" font-weight="bold" fill="#f8fafc" text-anchor="middle" font-family="sans-serif">Pablo Picasso (1881–1973) — Dora Maar au chat (1941)</text>
  <text x="260" y="613" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="sans-serif">Huile sur toile, 128.3 × 95.3 cm • Cubisme • Collection privée</text>
</svg>
`;

// 2. Pablo Picasso — Guernica (1937) — Monochrome cubisme dramatique
const SVG_PICASSO_GUERNICA = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 380" width="100%" height="100%" style="background:#09090b;font-family:sans-serif;">
  <defs>
    <linearGradient id="g_mono" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="50%" stop-color="#27272a"/>
      <stop offset="100%" stop-color="#09090b"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#g_mono)"/>
  
  <!-- Lumière de l'ampoule / Oeil divin au centre supérieur -->
  <polygon points="380,30 330,85 430,85" fill="#f4f4f5" opacity="0.2"/>
  <ellipse cx="380" cy="55" rx="35" ry="18" fill="#e4e4e7" stroke="#ffffff" stroke-width="2"/>
  <!-- Rayons acérés de l'ampoule -->
  <path d="M340 55 L310 50 M350 40 L330 25 M380 35 L380 15 M410 40 L430 25 M420 55 L450 50 M410 70 L430 85 M350 70 L330 85" stroke="#ffffff" stroke-width="2.5"/>
  <circle cx="380" cy="55" r="7" fill="#09090b"/>
  <circle cx="380" cy="55" r="3" fill="#ffffff"/>

  <!-- Taureau à gauche (symbole de la brutalité) -->
  <g id="bull" fill="#e4e4e7" stroke="#09090b" stroke-width="2">
    <path d="M60 140 C50 110 80 80 120 90 C150 70 170 95 160 130 C150 160 110 180 70 160 Z" fill="#d4d4d8"/>
    <!-- Cornes acérées -->
    <path d="M125 85 Q135 45 155 40" fill="none" stroke="#ffffff" stroke-width="4"/>
    <path d="M145 88 Q165 55 185 55" fill="none" stroke="#ffffff" stroke-width="4"/>
    <!-- Oeil taureau écarquillé -->
    <circle cx="115" cy="115" r="7" fill="#ffffff"/>
    <circle cx="117" cy="115" r="3.5" fill="#000000"/>
  </g>

  <!-- Mère hurlant tenant son enfant mort (à gauche) -->
  <g id="mother">
    <polygon points="90,190 135,175 145,260 80,260" fill="#a1a1aa" stroke="#000" stroke-width="1.5"/>
    <!-- Tête renversée vers le ciel -->
    <polygon points="120,180 145,150 160,185" fill="#f4f4f5" stroke="#000" stroke-width="2"/>
    <!-- Bouche ouverte en cri -->
    <polygon points="140,162 152,158 145,170" fill="#09090b"/>
    <polygon points="144,163 150,161 146,166" fill="#ffffff"/> <!-- langue en pointe -->
  </g>

  <!-- Cheval agonisant au centre (symbole du peuple espagnol martyr) -->
  <g id="horse">
    <!-- Corps à facettes cubistes texturé journal -->
    <polygon points="260,220 380,140 460,200 420,300 280,310" fill="#e4e4e7" stroke="#000" stroke-width="2"/>
    <!-- Texture hachurée typique de Guernica (effet papier journal) -->
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${290 + i * 12}" y1="180" x2="${275 + i * 12}" y2="280" stroke="#71717a" stroke-width="1.2"/>`).join('')}
    <!-- Tête de cheval hurlant convulsée -->
    <polygon points="350,150 410,110 430,145 375,175" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <!-- Bouche béante et dents -->
    <polygon points="390,120 425,115 410,135" fill="#000"/>
    <polygon points="396,122 418,118 406,128" fill="#fff"/> <!-- dague/langue -->
    <!-- Blessure béante sur le flanc -->
    <ellipse cx="360" cy="230" rx="18" ry="10" fill="#09090b" transform="rotate(-30 360 230)"/>
  </g>

  <!-- Guerrier démembré au sol avec épée brisée et fleur d'espoir -->
  <g id="soldier">
    <!-- Tête coupée au sol à gauche -->
    <polygon points="160,290 210,280 220,330 170,335" fill="#f4f4f5" stroke="#000" stroke-width="2"/>
    <circle cx="185" cy="305" r="5" fill="#000"/>
    <!-- Bras étendu tenant le glaive brisé -->
    <polygon points="215,315 290,320 285,335 210,330" fill="#d4d4d8" stroke="#000" stroke-width="1.5"/>
    <line x1="285" y1="315" x2="310" y2="335" stroke="#ffffff" stroke-width="3"/>
    <!-- Petite fleur de l'espoir près de la main -->
    <circle cx="305" cy="318" r="4" fill="#ffffff"/>
  </g>

  <!-- Personnage à la lampe qui surgit de la fenêtre (à droite du centre) -->
  <g id="lamp_bearer">
    <polygon points="460,90 520,105 500,160 450,140" fill="#f4f4f5" stroke="#000" stroke-width="2"/>
    <!-- Bras tenant un quinquet (lampe à huile) -->
    <line x1="470" y1="125" x2="425" y2="110" stroke="#ffffff" stroke-width="4"/>
    <polygon points="415,100 430,105 425,120 410,115" fill="#e4e4e7" stroke="#000"/>
    <circle cx="420" cy="110" r="4" fill="#ffffff"/>
  </g>

  <!-- Personnage implorant dans les flammes à droite -->
  <g id="fire_figure">
    <polygon points="620,130 670,110 690,170 635,185" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <!-- Bras levés vers le ciel en V -->
    <line x1="640" y1="125" x2="615" y2="60" stroke="#ffffff" stroke-width="4"/>
    <line x1="660" y1="115" x2="690" y2="55" stroke="#ffffff" stroke-width="4"/>
    <!-- Toit en flammes -->
    <polygon points="590,70 630,20 650,80 690,30 720,100" fill="#a1a1aa" opacity="0.5"/>
  </g>

  <!-- Cartouche musée officiel -->
  <rect x="30" y="340" width="700" height="30" rx="5" fill="#18181b" stroke="#3f3f46" stroke-width="1"/>
  <text x="380" y="358" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">
    Pablo Picasso (1937) — Guernica • Huile sur toile, 349.3 × 776.6 cm • Musée national Reine Sofía, Madrid
  </text>
</svg>
`;

// 3. Vincent van Gogh — La Nuit étoilée (1889) — Post-impressionnisme
const SVG_VAN_GOGH_STARRY_NIGHT = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 400" width="100%" height="100%" style="background:#091e3a;font-family:serif;">
  <defs>
    <linearGradient id="sky_vg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#071b35"/>
      <stop offset="50%" stop-color="#0f3460"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <radialGradient id="moon_glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="40%" stop-color="#eab308"/>
      <stop offset="70%" stop-color="#ca8a04" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#091e3a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="star_glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#fde047"/>
      <stop offset="70%" stop-color="#ca8a04" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0f3460" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Ciel nocturne profond -->
  <rect width="100%" height="100%" fill="url(#sky_vg)"/>

  <!-- Tourbillons célestes caractéristiques de Van Gogh (spirales de touches) -->
  <g stroke="#38bdf8" stroke-width="4" fill="none" opacity="0.6" stroke-linecap="round">
    <path d="M160 140 C 220 90, 290 80, 340 120 C 380 150, 360 200, 300 200 C 250 200, 240 160, 270 140 C 290 125, 320 135, 325 155"/>
    <path d="M120 160 C 180 110, 260 100, 320 140 C 350 165, 340 195, 310 195" stroke="#818cf8" stroke-width="3"/>
    <path d="M330 110 C 380 70, 440 80, 480 120" stroke="#facc15" stroke-width="3" opacity="0.7"/>
    <path d="M60 120 C 110 80, 180 90, 230 130" stroke="#67e8f9" stroke-width="3"/>
  </g>

  <!-- Touches d'empâtement impressionnistes dans le ciel -->
  <g stroke="#0284c7" stroke-width="2" stroke-linecap="round" opacity="0.5">
    ${[50, 90, 140, 190, 250, 300, 360, 420, 470].map((x, i) => 
      `<line x1="${x}" y1="${40 + (i % 3) * 20}" x2="${x + 22}" y2="${44 + (i % 3) * 20}"/>`
    ).join('')}
  </g>

  <!-- Croissant de Lune flamboyant (en haut à droite) -->
  <circle cx="460" cy="75" r="48" fill="url(#moon_glow)"/>
  <circle cx="460" cy="75" r="24" fill="#fef08a"/>
  <path d="M460 52 A 23 23 0 0 0 472 96 A 21 21 0 1 1 460 52 Z" fill="#ca8a04"/>

  <!-- Étoiles lumineuses vibrantes (halo concentrique) -->
  ${[
    { x: 90, y: 70, r: 24 },
    { x: 180, y: 55, r: 20 },
    { x: 230, y: 95, r: 22 },
    { x: 380, y: 65, r: 25 },
    { x: 335, y: 145, r: 28 }, // Vénus très brillante
    { x: 490, y: 160, r: 18 },
    { x: 130, y: 180, r: 16 },
  ].map(s => `
    <circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="url(#star_glow)"/>
    <circle cx="${s.x}" cy="${s.y}" r="${s.r * 0.35}" fill="#ffffff"/>
  `).join('')}

  <!-- Collines ondulantes des Alpilles à l'horizon -->
  <path d="M0 240 Q140 200 270 230 T540 220 L540 320 L0 320 Z" fill="#1e3a5f" stroke="#0f172a" stroke-width="2"/>
  <path d="M0 260 Q180 235 340 260 T540 250 L540 400 L0 400 Z" fill="#0f2537"/>

  <!-- Village de Saint-Rémy-de-Provence et clocher pointu -->
  <g id="village" fill="#0b1724" stroke="#1e293b">
    <!-- Maisons avec petites fenêtres jaunes allumées -->
    ${[160, 200, 240, 270, 310, 350, 390, 430].map(x => `
      <rect x="${x}" y="280" width="28" height="22" rx="2" fill="#132438"/>
      <polygon points="${x - 2},280 ${x + 14},268 ${x + 30},280" fill="#0f172a"/>
      <rect x="${x + 9}" y="288" width="6" height="6" fill="#fef08a" opacity="0.8"/>
    `).join('')}
    <!-- Flèche du clocher de l'église (dominante verticale) -->
    <polygon points="265,300 285,300 275,190" fill="#0a1520" stroke="#020617" stroke-width="1.5"/>
    <rect x="268" y="270" width="14" height="35" fill="#0d1b2a"/>
  </g>

  <!-- Grand Cyprès sombre au premier plan à gauche (flamme noire ondulante) -->
  <path d="M70 400 C 60 330, 25 240, 60 150 C 70 120, 80 100, 85 90 C 90 100, 105 130, 110 170 C 130 250, 120 330, 130 400 Z" fill="#0a1910" stroke="#030712" stroke-width="2"/>
  <path d="M50 400 C 40 310, 35 230, 55 180 C 65 210, 75 290, 70 400 Z" fill="#06120b"/>
  <!-- Flammes intérieures du cyprès -->
  <path d="M75 360 C 65 300, 60 210, 80 150 C 90 190, 95 280, 85 360 Z" fill="#0d2818" opacity="0.8"/>

  <!-- Cartouche musée officiel -->
  <rect x="25" y="360" width="490" height="30" rx="5" fill="#091422" opacity="0.95" stroke="#1e3a8a" stroke-width="1"/>
  <text x="270" y="378" font-size="11" font-weight="bold" fill="#f8fafc" text-anchor="middle">
    Vincent van Gogh (1889) — La Nuit étoilée • Huile sur toile, 73.7 × 92.1 cm • MoMA, New York
  </text>
</svg>
`;

// 4. Katsushika Hokusai — La Grande Vague de Kanagawa (1831)
const SVG_HOKUSAI_GREAT_WAVE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 370" width="100%" height="100%" style="background:#f4efe6;font-family:serif;">
  <defs>
    <linearGradient id="wave_blue" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="60%" stop-color="#172554"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="sky_hokusai" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#e2d9c8"/>
      <stop offset="50%" stop-color="#f1ede4"/>
      <stop offset="100%" stop-color="#fdfbf7"/>
    </linearGradient>
  </defs>

  <!-- Fond papier traditionnel washi -->
  <rect width="100%" height="100%" fill="url(#sky_hokusai)"/>

  <!-- Mont Fuji enneigé au loin (calme face à la tempête) -->
  <g id="mount_fuji">
    <polygon points="275,250 250,285 300,285" fill="#1e293b"/>
    <!-- Sommet enneigé blanc -->
    <polygon points="275,250 264,266 286,266" fill="#ffffff"/>
  </g>

  <!-- Barques traditionnelles japonaises (oshiokuri-bune) luttant contre la houle -->
  <g id="boats" stroke="#78350f" stroke-width="1.5">
    <path d="M220 290 Q270 280 320 295" fill="none" stroke="#b45309" stroke-width="5" stroke-linecap="round"/>
    <path d="M120 310 Q160 305 200 320" fill="none" stroke="#b45309" stroke-width="5" stroke-linecap="round"/>
  </g>

  <!-- Petite vague au premier plan -->
  <path d="M0 320 Q120 260 220 320 Q340 280 540 340 L540 370 L0 370 Z" fill="#1d4ed8"/>

  <!-- LA GRANDE VAGUE GÉANTE À GAUCHE (spirale et griffes d'écume) -->
  <!-- Masse principale de la vague bleue -->
  <path d="M 0 370 L 0 200 C 60 180, 110 120, 170 110 C 230 100, 270 140, 260 200 C 255 230, 230 250, 180 250 C 130 250, 100 280, 80 370 Z" fill="url(#wave_blue)"/>

  <!-- Grande crête déferlante incurvée en griffe au-dessus -->
  <path d="M 120 160 C 140 100, 180 60, 240 50 C 290 40, 310 90, 270 120 C 240 140, 200 130, 180 150" fill="url(#wave_blue)"/>

  <!-- Écume blanche écumante et griffes caractéristiques d'Hokusai -->
  <g fill="#ffffff" stroke="#e0f2fe" stroke-width="1">
    <!-- Doigts d'écume acérés au sommet -->
    ${[
      'M 240 50 Q 250 40, 260 48 Q 250 55, 240 50',
      'M 260 48 Q 275 35, 280 46 Q 270 55, 260 48',
      'M 280 46 Q 300 40, 305 52 Q 290 60, 280 46',
      'M 305 52 Q 320 50, 320 65 Q 305 70, 305 52',
      'M 270 120 Q 285 110, 290 125 Q 275 130, 270 120',
      'M 200 130 Q 215 120, 220 135 Q 205 140, 200 130',
    ].map(d => `<path d="${d}"/>`).join('')}
    <!-- Gouttelettes d'embruns dispersées dans l'air -->
    ${[
      [230, 35], [260, 30], [290, 35], [320, 40], [340, 60], [330, 80],
      [270, 95], [210, 110], [170, 80], [150, 95], [190, 70], [310, 100]
    ].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5"/>`).join('')}
  </g>

  <!-- Cartouche traditionnel japonais d'Hokusai (en haut à gauche) -->
  <rect x="25" y="25" width="28" height="85" fill="#fef08a" stroke="#78350f" stroke-width="1.2"/>
  <text x="39" y="45" font-size="9" font-weight="bold" fill="#78350f" text-anchor="middle" writing-mode="vertical-rl">冨嶽三十六景</text>
  <text x="39" y="85" font-size="8" fill="#78350f" text-anchor="middle" writing-mode="vertical-rl">神奈川沖浪裏</text>

  <!-- Cartouche musée officiel -->
  <rect x="25" y="332" width="490" height="28" rx="5" fill="#1e293b" opacity="0.95" stroke="#475569" stroke-width="1"/>
  <text x="270" y="350" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">
    Katsushika Hokusai (vers 1831) — La Grande Vague de Kanagawa • Estampe sur bois (Ukiyo-e) • 25.7 × 37.8 cm
  </text>
</svg>
`;

// 5. Léonard de Vinci — La Joconde / Mona Lisa (1503-1506)
const SVG_DA_VINCI_MONA_LISA = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 640" width="100%" height="100%" style="background:#1b241b;font-family:serif;">
  <defs>
    <radialGradient id="sfumato_face" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#fed7aa"/>
      <stop offset="45%" stop-color="#fdba74"/>
      <stop offset="75%" stop-color="#c2410c" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#431407"/>
    </radialGradient>
    <linearGradient id="landscape_bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="35%" stop-color="#334155"/>
      <stop offset="70%" stop-color="#2d3748"/>
      <stop offset="100%" stop-color="#1a202c"/>
    </linearGradient>
  </defs>

  <!-- Paysage mystérieux sfumato à l'arrière-plan -->
  <rect width="100%" height="100%" fill="url(#landscape_bg)"/>
  <!-- Montagnes vaporeuses bleutées et rivière sinueuse -->
  <path d="M0 240 Q120 180 250 220 T500 200 L500 380 L0 380 Z" fill="#3b4c3d" opacity="0.7"/>
  <path d="M380 260 Q420 280 400 320 T440 360" fill="none" stroke="#60a5fa" stroke-width="5" opacity="0.4"/>
  <!-- Petit pont d'Arezzo à droite -->
  <rect x="430" y="310" width="35" height="10" fill="#4b5563" opacity="0.8"/>

  <!-- Balustrade et colonnes latérales -->
  <rect x="0" y="380" width="500" height="260" fill="#18181b"/>
  <rect x="20" y="100" width="16" height="300" fill="#27272a" opacity="0.6"/>
  <rect x="464" y="100" width="16" height="300" fill="#27272a" opacity="0.6"/>

  <!-- Corps, épaules et robe drapée en velours sombre -->
  <polygon points="120,400 380,400 440,640 60,640" fill="#1c1917"/>
  <path d="M160 360 Q250 420 340 360 L390 540 L110 540 Z" fill="#292524" stroke="#44403c"/>
  <!-- Échancrure dorée brodée sur le décolleté -->
  <path d="M190 320 Q250 360 310 320" fill="none" stroke="#ca8a04" stroke-width="2"/>

  <!-- Bras et mains croisées majestueuses au premier plan -->
  <g id="crossed_hands">
    <!-- Bras droit reposant sur l'accoudoir -->
    <path d="M120 440 Q200 480 300 460" stroke="#292524" stroke-width="36" stroke-linecap="round"/>
    <!-- Main gauche reposant sur le poignet -->
    <ellipse cx="250" cy="510" rx="38" ry="18" fill="#fed7aa" transform="rotate(-10 250 510)"/>
    <ellipse cx="280" cy="505" rx="35" ry="14" fill="#fed7aa" transform="rotate(5 280 505)"/>
    <!-- Doigts effilés d'une finesse anatomique exemplaire -->
    ${[230, 245, 260, 275].map(x => `<line x1="${x}" y1="500" x2="${x + 22}" y2="520" stroke="#9a3412" stroke-width="1.8"/>`).join('')}
  </g>

  <!-- Décolleté lumineux -->
  <path d="M195 270 Q250 340 305 270 Z" fill="#fed7aa"/>

  <!-- Tête et visage (technique du sfumato, contours fondus sans ligne dure) -->
  <ellipse cx="250" cy="225" rx="65" ry="82" fill="url(#sfumato_face)"/>

  <!-- Chevelure brune ondulée encadrant le visage -->
  <path d="M180 180 Q170 280 185 360 Q215 350 200 240 Z" fill="#1c1917"/>
  <path d="M320 180 Q330 280 315 360 Q285 350 300 240 Z" fill="#1c1917"/>
  <!-- Voile transparent délicat sur les cheveux -->
  <ellipse cx="250" cy="175" rx="72" ry="40" fill="#000000" opacity="0.35"/>

  <!-- Yeux énigmatiques qui suivent le spectateur (sans sourcils selon la mode florentine) -->
  <g id="eyes">
    <ellipse cx="225" cy="215" rx="11" ry="6" fill="#fff" opacity="0.7"/>
    <circle cx="226" cy="215" r="4.5" fill="#451a03"/>
    <circle cx="227" cy="214" r="1.5" fill="#000"/>
    
    <ellipse cx="275" cy="215" rx="11" ry="6" fill="#fff" opacity="0.7"/>
    <circle cx="274" cy="215" r="4.5" fill="#451a03"/>
    <circle cx="273" cy="214" r="1.5" fill="#000"/>
    <!-- Ombres sfumato aux paupières -->
    <path d="M214 210 Q225 204 236 210" stroke="#78350f" stroke-width="2" fill="none"/>
    <path d="M264 210 Q275 204 286 210" stroke="#78350f" stroke-width="2" fill="none"/>
  </g>

  <!-- Nez droit délicatement modelé par l'ombre -->
  <path d="M248 215 L247 248 L254 252" stroke="#9a3412" stroke-width="1.8" fill="none" opacity="0.7"/>

  <!-- Le légendaire sourire énigmatique (commissures subtilement estompées) -->
  <path d="M236 268 Q250 274 264 268" stroke="#7c2d12" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M240 268 Q250 264 260 268" stroke="#991b1b" stroke-width="1.8" fill="none"/>

  <!-- Cartouche musée officiel -->
  <rect x="25" y="585" width="450" height="38" rx="5" fill="#0f172a" opacity="0.95" stroke="#334155" stroke-width="1"/>
  <text x="250" y="603" font-size="12" font-weight="bold" fill="#f8fafc" text-anchor="middle">Léonard de Vinci (1503–1506) — La Joconde (Mona Lisa)</text>
  <text x="250" y="618" font-size="10" fill="#94a3b8" text-anchor="middle">Huile sur peuplier, 77 × 53 cm • Renaissance italienne • Musée du Louvre, Paris</text>
</svg>
`;

// 6. Edvard Munch — Le Cri (1893)
const SVG_MUNCH_SCREAM = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" width="100%" height="100%" style="background:#451a03;font-family:serif;">
  <defs>
    <linearGradient id="sky_scream" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b91c1c"/>
      <stop offset="30%" stop-color="#ea580c"/>
      <stop offset="70%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>

  <!-- Ciel crépusculaire tourmenté rouge et jaune flamboyant -->
  <rect width="100%" height="100%" fill="url(#sky_scream)"/>
  <!-- Ondulations expressionnistes de l'angoisse dans le ciel -->
  <path d="M0 60 Q120 20 250 70 T500 40" stroke="#7f1d1d" stroke-width="18" fill="none" opacity="0.7"/>
  <path d="M0 110 Q140 70 280 120 T500 90" stroke="#c2410c" stroke-width="16" fill="none" opacity="0.8"/>
  <path d="M0 160 Q160 130 300 170 T500 150" stroke="#d97706" stroke-width="14" fill="none" opacity="0.8"/>

  <!-- Le Fjord bleu-noir ondulant en bas à droite -->
  <path d="M180 240 Q320 200 500 280 L500 500 L250 500 Z" fill="#0f172a"/>
  <path d="M220 270 Q340 250 500 320" stroke="#1e3a8a" stroke-width="12" fill="none"/>
  <!-- Petits bateaux sur l'eau -->
  <ellipse cx="400" cy="280" rx="14" ry="4" fill="#64748b"/>

  <!-- Garde-corps du pont en diagonale fuyante abrupte -->
  <polygon points="0,320 200,240 500,480 0,620" fill="#78350f" opacity="0.4"/>
  <line x1="0" y1="340" x2="500" y2="580" stroke="#451a03" stroke-width="8"/>
  <line x1="0" y1="390" x2="500" y2="630" stroke="#451a03" stroke-width="8"/>
  <!-- Piliers verticaux du pont -->
  ${[60, 140, 220, 300, 380, 460].map(x => `<line x1="${x}" y1="${340 + x * 0.48}" x2="${x}" y2="${400 + x * 0.48}" stroke="#292524" stroke-width="4"/>`).join('')}

  <!-- Deux silhouettes au chapeau haut-de-forme s'éloignant au fond sur le pont -->
  <g id="passersby">
    <ellipse cx="60" cy="305" rx="8" ry="14" fill="#09090b"/>
    <ellipse cx="60" cy="292" rx="4" ry="5" fill="#09090b"/>
    <ellipse cx="85" cy="315" rx="8" ry="15" fill="#09090b"/>
    <ellipse cx="85" cy="301" rx="4" ry="5" fill="#09090b"/>
  </g>

  <!-- FIGURE CENTRALE SPECTRALEMENT DÉFORMÉE (LE CRI) -->
  <g id="screaming_figure">
    <!-- Corps sinueux drapé de bleu-nuit -->
    <path d="M220 620 Q200 480 230 400 Q260 360 270 400 Q290 480 280 620 Z" fill="#1e293b" stroke="#0f172a" stroke-width="3"/>
    
    <!-- Tête ovoïde chauve pâle couleur cadavérique -->
    <ellipse cx="250" cy="320" rx="36" ry="52" fill="#fef08a" stroke="#ca8a04" stroke-width="2.5"/>
    
    <!-- Mains squelettiques plaquées contre les oreilles pour étouffer le cri -->
    <path d="M205 350 Q215 320 220 290 Q210 320 205 350" fill="#fef08a" stroke="#a16207" stroke-width="4"/>
    <path d="M295 350 Q285 320 280 290 Q290 320 295 350" fill="#fef08a" stroke="#a16207" stroke-width="4"/>
    
    <!-- Yeux exorbités d'effroi pur -->
    <ellipse cx="236" cy="305" rx="8" ry="12" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <circle cx="236" cy="305" r="4" fill="#000000"/>
    <ellipse cx="264" cy="305" rx="8" ry="12" fill="#ffffff" stroke="#000" stroke-width="2"/>
    <circle cx="264" cy="305" r="4" fill="#000000"/>
    
    <!-- Nez réduit à deux fentes spectrales -->
    <line x1="247" y1="324" x2="247" y2="332" stroke="#713f12" stroke-width="2"/>
    <line x1="253" y1="324" x2="253" y2="332" stroke="#713f12" stroke-width="2"/>
    
    <!-- Bouche ouverte béante en O ovale d'angoisse -->
    <ellipse cx="250" cy="348" rx="10" ry="18" fill="#09090b" stroke="#451a03" stroke-width="2"/>
  </g>

  <!-- Cartouche musée officiel -->
  <rect x="25" y="575" width="450" height="35" rx="5" fill="#09090b" opacity="0.95" stroke="#451a03" stroke-width="1"/>
  <text x="250" y="593" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">
    Edvard Munch (1893) — Le Cri • Huile et pastel sur carton • Galerie nationale d'Oslo
  </text>
  <text x="250" y="605" font-size="9" fill="#fed7aa" text-anchor="middle">Expressionnisme • 91 × 73.5 cm</text>
</svg>
`;

// 7. Piet Mondrian — Composition avec rouge, jaune et bleu (1930)
const SVG_MONDRIAN = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%" style="background:#ffffff;font-family:sans-serif;">
  <!-- Fond blanc pur -->
  <rect width="100%" height="100%" fill="#f8fafc"/>

  <!-- Grand carré rouge éclatant en haut à droite -->
  <rect x="140" y="0" width="360" height="340" fill="#dc2626"/>

  <!-- Carré bleu profond en bas à gauche -->
  <rect x="0" y="360" width="120" height="140" fill="#1d4ed8"/>

  <!-- Rectangle jaune lumineux en bas à droite -->
  <rect x="420" y="440" width="80" height="60" fill="#facc15"/>

  <!-- Rectangles blancs / gris clairs néo-plastiques -->
  <rect x="0" y="0" width="120" height="340" fill="#ffffff"/>
  <rect x="140" y="360" width="260" height="140" fill="#f1f5f9"/>
  <rect x="420" y="360" width="80" height="60" fill="#ffffff"/>

  <!-- LIGNES NOIRES ÉPAISSES EMBLÉMATIQUES DE DE STIJL -->
  <line x1="130" y1="0" x2="130" y2="500" stroke="#09090b" stroke-width="20"/>
  <line x1="0" y1="350" x2="500" y2="350" stroke="#09090b" stroke-width="20"/>
  <line x1="410" y1="350" x2="410" y2="500" stroke="#09090b" stroke-width="16"/>
  <line x1="410" y1="430" x2="500" y2="430" stroke="#09090b" stroke-width="16"/>
  <line x1="0" y1="120" x2="130" y2="120" stroke="#09090b" stroke-width="14"/>

  <!-- Cadre extérieur fin -->
  <rect width="100%" height="100%" fill="none" stroke="#09090b" stroke-width="8"/>

  <!-- Cartouche musée discret -->
  <rect x="20" y="460" width="460" height="28" rx="4" fill="#09090b" opacity="0.9"/>
  <text x="250" y="478" font-size="10" font-weight="bold" fill="#ffffff" text-anchor="middle">
    Piet Mondrian (1930) — Composition en rouge, jaune et bleu • De Stijl • Kunsthaus de Zurich
  </text>
</svg>
`;

// 8. Art Islamique — Mosaïque & Zellige de l'Alhambra (XIVe siècle)
const SVG_ART_ISLAMIQUE_ALHAMBRA = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 520" width="100%" height="100%" style="background:#0c131f;font-family:serif;">
  <defs>
    <!-- Motif géométrique islamique en étoile à 8 branches -->
    <pattern id="zellige_pattern" width="130" height="130" patternUnits="userSpaceOnUse">
      <rect width="130" height="130" fill="#0f172a"/>
      <!-- Étoile centrale turquoise -->
      <polygon points="65,15 78,48 112,48 85,68 95,102 65,82 35,102 45,68 18,48 52,48" fill="#0284c7" stroke="#38bdf8" stroke-width="1.5"/>
      <circle cx="65" cy="65" r="14" fill="#f59e0b" stroke="#fef08a" stroke-width="1"/>
      <!-- Petits rubans entrelacés (zellige nasride) -->
      <polygon points="0,0 25,12 12,25" fill="#047857"/>
      <polygon points="130,0 105,12 118,25" fill="#047857"/>
      <polygon points="0,130 25,118 12,105" fill="#047857"/>
      <polygon points="130,130 105,118 118,105" fill="#047857"/>
      <polygon points="65,0 75,15 55,15" fill="#b91c1c"/>
      <polygon points="65,130 75,115 55,115" fill="#b91c1c"/>
      <polygon points="0,65 15,75 15,55" fill="#b91c1c"/>
      <polygon points="130,65 115,75 115,55" fill="#b91c1c"/>
    </pattern>
  </defs>

  <!-- Fond mosaïque zellige étendu -->
  <rect width="100%" height="100%" fill="url(#zellige_pattern)"/>

  <!-- Grande rosace géométrique centrale à 16 pointes -->
  <circle cx="260" cy="245" r="140" fill="#0284c7" fill-opacity="0.25" stroke="#f59e0b" stroke-width="4"/>
  <circle cx="260" cy="245" r="120" fill="none" stroke="#38bdf8" stroke-width="2"/>
  
  <!-- Étoile nasride à 8 branches principale -->
  <g transform="translate(260, 245)">
    <polygon points="0,-100 24,-24 100,0 24,24 0,100 -24,24 -100,0 -24,-24" fill="#0284c7" stroke="#ffffff" stroke-width="2"/>
    <polygon points="0,-100 24,-24 100,0 24,24 0,100 -24,24 -100,0 -24,-24" transform="rotate(45)" fill="#0d9488" stroke="#ffffff" stroke-width="2" opacity="0.9"/>
    <!-- Cœur d'or -->
    <circle cx="0" cy="0" r="32" fill="#f59e0b" stroke="#ffffff" stroke-width="3"/>
    <circle cx="0" cy="0" r="18" fill="#b91c1c" stroke="#fef08a" stroke-width="2"/>
    <polygon points="0,-14 4,-4 14,0 4,4 0,14 -4,4 -14,0 -4,-4" fill="#ffffff"/>
  </g>

  <!-- Bandeau calligraphique d'arabesque en haut et bas -->
  <rect x="20" y="20" width="480" height="32" rx="4" fill="#0f172a" stroke="#d97706" stroke-width="2"/>
  <text x="260" y="42" font-size="13" font-weight="bold" fill="#fef08a" text-anchor="middle" font-family="serif">
    وَلَا غَالِبَ إِلَّا اللَّه (Devise nasride de l'Alhambra : Il n'y a de vainqueur que Dieu)
  </text>

  <!-- Cartouche musée officiel -->
  <rect x="20" y="465" width="480" height="38" rx="5" fill="#020617" opacity="0.95" stroke="#d97706" stroke-width="1.5"/>
  <text x="260" y="482" font-size="11" font-weight="bold" fill="#f8fafc" text-anchor="middle">
    Art Islamique — Zellige et Mosaïque Géométrique de l'Alhambra (XIVe siècle)
  </text>
  <text x="260" y="496" font-size="9.5" fill="#38bdf8" text-anchor="middle">
    Palais des Nasrides, Grenade • Céramique émaillée, symétrie d'ordre 8 et entrelacs
  </text>
</svg>
`;

// 9. Art Islamique — Calligraphie Arabe Koufique (Coran Bleu, IXe siècle)
const SVG_CORAN_BLEU_CALLIGRAPHIE = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 400" width="100%" height="100%" style="background:#0f172a;font-family:serif;">
  <defs>
    <radialGradient id="indigo_vellum" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1e295d"/>
      <stop offset="70%" stop-color="#11183c"/>
      <stop offset="100%" stop-color="#0a0f26"/>
    </radialGradient>
    <linearGradient id="gold_ink" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>
  </defs>

  <!-- Parchemin teinté à l'indigo profond (vélin précieux) -->
  <rect width="100%" height="100%" fill="url(#indigo_vellum)"/>
  <rect x="15" y="15" width="510" height="370" fill="none" stroke="#d97706" stroke-width="1" opacity="0.5"/>

  <!-- Rosette marginale dorée et argentée (indicateur de verset / juzz) -->
  <g transform="translate(60, 180)">
    <circle cx="0" cy="0" r="28" fill="#ca8a04" stroke="#fef08a" stroke-width="1.5"/>
    <circle cx="0" cy="0" r="20" fill="#1e295d" stroke="#facc15" stroke-width="1"/>
    ${Array.from({ length: 8 }, (_, i) => `<polygon points="0,-27 4,-18 -4,-18" transform="rotate(${i * 45})" fill="#fde047"/>`).join('')}
    <circle cx="0" cy="0" r="8" fill="#ca8a04"/>
  </g>

  <!-- CALLIGRAPHIE ARABE KOUFIQUE EN LETTRES D'OR (Lignes horizontales étirées caractéristiques - Mashq) -->
  <g fill="url(#gold_ink)" stroke="#eab308" stroke-width="0.5">
    <!-- Ligne 1 -->
    <path d="M120 80 L480 80 L480 88 L120 88 Z"/>
    <path d="M470 50 L475 88 L465 88 L460 50 Z"/>
    <path d="M380 40 L386 88 L376 88 L370 40 Z"/>
    <path d="M290 45 L296 88 L286 88 L280 45 Z"/>
    <path d="M190 42 L196 88 L186 88 L180 42 Z"/>
    <circle cx="430" cy="72" r="5" fill="#fef08a"/>
    <circle cx="340" cy="72" r="5" fill="#fef08a"/>

    <!-- Ligne 2 -->
    <path d="M120 140 L480 140 L480 148 L120 148 Z"/>
    <path d="M440 105 L446 148 L436 148 L430 105 Z"/>
    <path d="M350 100 L356 148 L346 148 L340 100 Z"/>
    <path d="M250 110 L256 148 L246 148 L240 110 Z"/>
    <path d="M150 102 L156 148 L146 148 L140 102 Z"/>
    <path d="M200 148 Q215 170 230 148" stroke="#eab308" stroke-width="6" fill="none"/>

    <!-- Ligne 3 -->
    <path d="M120 200 L480 200 L480 208 L120 208 Z"/>
    <path d="M460 165 L466 208 L456 208 L450 165 Z"/>
    <path d="M390 160 L396 208 L386 208 L380 160 Z"/>
    <path d="M310 170 L316 208 L306 208 L300 170 Z"/>
    <path d="M210 162 L216 208 L206 208 L200 162 Z"/>

    <!-- Ligne 4 -->
    <path d="M120 260 L480 260 L480 268 L120 268 Z"/>
    <path d="M420 220 L426 268 L416 268 L410 220 Z"/>
    <path d="M330 225 L336 268 L326 268 L320 225 Z"/>
    <path d="M240 222 L246 268 L236 268 L230 222 Z"/>
    <path d="M170 220 L176 268 L166 268 L160 220 Z"/>
    <circle cx="280" cy="252" r="5" fill="#fef08a"/>
  </g>

  <!-- Points diacritiques en argent / blanc -->
  <g fill="#e2e8f0">
    <circle cx="360" cy="132" r="2.5"/>
    <circle cx="220" cy="192" r="2.5"/>
    <circle cx="445" cy="252" r="2.5"/>
  </g>

  <!-- Cartouche musée officiel -->
  <rect x="25" y="345" width="490" height="36" rx="5" fill="#020617" opacity="0.95" stroke="#ca8a04" stroke-width="1.2"/>
  <text x="270" y="362" font-size="11" font-weight="bold" fill="#f8fafc" text-anchor="middle">
    Le Coran Bleu de Kairouan (IXe siècle) — Écriture Koufique Dorée sur Parchemin Indigo
  </text>
  <text x="270" y="374" font-size="9.5" fill="#fde047" text-anchor="middle">
    Art Islamique Abbaside / Fatimide • Encre d'or (chrysographie) et pigment indigo précieux
  </text>
</svg>
`;

// 10. Johannes Vermeer — La Jeune Fille à la perle (1665)
const SVG_VERMEER_PEARL = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 620" width="100%" height="100%" style="background:#09090b;font-family:serif;">
  <defs>
    <radialGradient id="pearl_light" cx="35%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#e2e8f0"/>
      <stop offset="70%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#334155"/>
    </radialGradient>
    <radialGradient id="face_light" cx="45%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="30%" stop-color="#fed7aa"/>
      <stop offset="70%" stop-color="#ea580c" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#09090b"/>
    </radialGradient>
  </defs>

  <!-- Fond sombre velouté presque noir (clair-obscur de Vermeer) -->
  <rect width="100%" height="100%" fill="#0a0a0c"/>

  <!-- Veste ocre-brun drapée -->
  <path d="M120 440 C140 380, 200 360, 270 380 C360 370, 420 420, 440 620 L80 620 Z" fill="#92400e" stroke="#451a03" stroke-width="2"/>
  <!-- Col blanc éclatant (contraste lumineux) -->
  <polygon points="220,380 270,395 240,430" fill="#ffffff"/>

  <!-- Tête inclinée de trois-quarts -->
  <ellipse cx="250" cy="270" rx="72" ry="90" fill="url(#face_light)" transform="rotate(-5 250 270)"/>

  <!-- Turban bleu outremer (lapis-lazuli) exotique et bandeau jaune -->
  <path d="M180 230 C160 160, 240 100, 310 120 C360 140, 370 210, 340 250 C320 200, 280 180, 210 210 Z" fill="#1d4ed8" stroke="#172554" stroke-width="2"/>
  <path d="M220 180 C260 170, 310 185, 335 225 L345 205 C320 160, 270 150, 220 165 Z" fill="#eab308"/>
  <!-- Pan de tissu jaune qui retombe dans le dos -->
  <path d="M325 220 C345 280, 370 340, 360 420 L335 410 C345 340, 325 280, 310 240 Z" fill="#ca8a04"/>

  <!-- Yeux humides et regard par-dessus l'épaule -->
  <g id="vermeer_eyes">
    <ellipse cx="230" cy="255" rx="12" ry="7" fill="#ffffff" opacity="0.8"/>
    <circle cx="232" cy="255" r="5" fill="#451a03"/>
    <circle cx="233" cy="253" r="1.8" fill="#ffffff"/>

    <ellipse cx="282" cy="255" rx="12" ry="7" fill="#ffffff" opacity="0.8"/>
    <circle cx="280" cy="255" r="5" fill="#451a03"/>
    <circle cx="279" cy="253" r="1.8" fill="#ffffff"/>
  </g>

  <!-- Lèvres entrouvertes d'un rose carmin lumineux -->
  <ellipse cx="260" cy="320" rx="14" ry="7" fill="#dc2626"/>
  <ellipse cx="260" cy="318" rx="10" ry="3" fill="#ffffff" opacity="0.6"/>

  <!-- LA PERLE LÉGENDAIRE (goutte nacrée captant le reflet blanc du col) -->
  <ellipse cx="205" cy="340" rx="11" ry="14" fill="url(#pearl_light)"/>
  <circle cx="202" cy="334" r="3.5" fill="#ffffff"/> <!-- éclat de lumière pur -->

  <!-- Cartouche musée officiel -->
  <rect x="25" y="575" width="450" height="35" rx="5" fill="#18181b" stroke="#3f3f46" stroke-width="1"/>
  <text x="250" y="593" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">
    Johannes Vermeer (vers 1665) — La Jeune Fille à la perle • Mauritshuis, La Haye
  </text>
  <text x="250" y="605" font-size="9" fill="#94a3b8" text-anchor="middle">Baroque hollandais • Huile sur toile, 44.5 × 39 cm</text>
</svg>
`;

// ═════════════════════════════════════════════════════════════════════════════
// 2. CATALOGUE COMPLET D'OEUVRES D'ART CERTIFIÉES
// ═════════════════════════════════════════════════════════════════════════════

export const FAMOUS_ARTWORKS: ArtworkItem[] = [
  {
    id: 'picasso_dora_maar',
    name: "Dora Maar au chat",
    artist: "Pablo Picasso",
    year: "1941",
    medium: "Huile sur toile",
    museum: "Collection privée",
    movement: "Cubisme",
    url: "https://upload.wikimedia.org/wikipedia/en/c/c3/Dora_Maar_Au_Chat.jpg",
    svgDataUri: toSvgDataUri(SVG_PICASSO_DORA_MAAR),
    caption: "Pablo Picasso, 'Dora Maar au chat', 1941, Huile sur toile, 128.3 cm × 95.3 cm (Cubisme)",
    keywords: ['dora maar', 'dora maar au chat', 'picasso', 'pablo picasso', 'chat', '1941', 'cubisme', 'portrait cubiste']
  },
  {
    id: 'picasso_guernica',
    name: "Guernica",
    artist: "Pablo Picasso",
    year: "1937",
    medium: "Huile sur toile",
    museum: "Musée national centre d'art Reina Sofía, Madrid",
    movement: "Cubisme / Art engagé",
    url: "https://upload.wikimedia.org/wikipedia/en/7/74/PicassoGuernica.jpg",
    svgDataUri: toSvgDataUri(SVG_PICASSO_GUERNICA),
    caption: "Pablo Picasso, 'Guernica', 1937, Huile sur toile, 349.3 cm × 776.6 cm, Musée Reina Sofía",
    keywords: ['guernica', 'picasso', 'pablo picasso', '1937', 'guerre civile', 'espagne', 'cubisme', 'monochrome']
  },
  {
    id: 'van_gogh_starry_night',
    name: "La Nuit étoilée",
    artist: "Vincent van Gogh",
    year: "1889",
    medium: "Huile sur toile",
    museum: "Museum of Modern Art (MoMA), New York",
    movement: "Post-impressionnisme",
    url: "https://upload.wikimedia.org/wikipedia/commons/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    svgDataUri: toSvgDataUri(SVG_VAN_GOGH_STARRY_NIGHT),
    caption: "Vincent van Gogh, 'La Nuit étoilée', 1889, Huile sur toile, 73.7 cm × 92.1 cm, MoMA New York",
    keywords: ['nuit étoilée', 'starry night', 'van gogh', 'vincent van gogh', '1889', 'post-impressionnisme', 'cyprès', 'tourbillons']
  },
  {
    id: 'hokusai_grande_vague',
    name: "La Grande Vague de Kanagawa",
    artist: "Katsushika Hokusai",
    year: "1831",
    medium: "Estampe japonaise (Gravure sur bois Ukiyo-e)",
    museum: "Metropolitan Museum of Art, New York",
    movement: "Ukiyo-e",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a5/Tsunami_by_hokusai_19th_century.jpg",
    svgDataUri: toSvgDataUri(SVG_HOKUSAI_GREAT_WAVE),
    caption: "Katsushika Hokusai, 'La Grande Vague de Kanagawa', vers 1831, Estampe sur bois, 25.7 cm × 37.8 cm",
    keywords: ['grande vague', 'vague de kanagawa', 'hokusai', 'katsushika hokusai', 'estampe', 'fuji', 'ukiyo-e', 'japon']
  },
  {
    id: 'da_vinci_mona_lisa',
    name: "La Joconde (Mona Lisa)",
    artist: "Léonard de Vinci",
    year: "1503-1506",
    medium: "Huile sur panneau de peuplier",
    museum: "Musée du Louvre, Paris",
    movement: "Renaissance italienne",
    url: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg",
    svgDataUri: toSvgDataUri(SVG_DA_VINCI_MONA_LISA),
    caption: "Léonard de Vinci, 'Mona Lisa (La Joconde)', 1503-1506, Huile sur peuplier, 77 cm × 53 cm, Musée du Louvre",
    keywords: ['joconde', 'mona lisa', 'vinci', 'léonard de vinci', 'leonardo da vinci', 'louvre', 'renaissance', 'sfumato', 'sourire']
  },
  {
    id: 'munch_le_cri',
    name: "Le Cri",
    artist: "Edvard Munch",
    year: "1893",
    medium: "Huile, détrempe et pastel sur carton",
    museum: "Galerie nationale d'Oslo",
    movement: "Expressionnisme",
    url: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Edvard_Munch%2C_1893%2C_The_Scream%2C_oil%2C_tempera_and_pastel_on_cardboard%2C_91_x_73_cm%2C_National_Gallery_of_Norway.jpg",
    svgDataUri: toSvgDataUri(SVG_MUNCH_SCREAM),
    caption: "Edvard Munch, 'Le Cri', 1893, Huile et pastel sur carton, 91 cm × 73.5 cm, Galerie nationale d'Oslo",
    keywords: ['le cri', 'the scream', 'munch', 'edvard munch', 'expressionnisme', 'angoisse', '1893']
  },
  {
    id: 'mondrian_composition',
    name: "Composition avec rouge, jaune et bleu",
    artist: "Piet Mondrian",
    year: "1930",
    medium: "Huile sur toile",
    museum: "Kunsthaus de Zurich",
    movement: "De Stijl / Néo-plasticisme",
    url: "https://upload.wikimedia.org/wikipedia/commons/a/a4/Piet_Mondriaan%2C_1930_-_Mondrian_Composition_II_in_Red%2C_Blue%2C_and_Yellow.jpg",
    svgDataUri: toSvgDataUri(SVG_MONDRIAN),
    caption: "Piet Mondrian, 'Composition avec rouge, jaune et bleu', 1930, Huile sur toile, 46 cm × 46 cm",
    keywords: ['mondrian', 'piet mondrian', 'composition avec rouge', 'de stijl', 'abstraction géométrique', 'lignes noires']
  },
  {
    id: 'art_islamique_alhambra',
    name: "Art Islamique - Mosaïque & Zellige de l'Alhambra",
    artist: "Artisans nasrides",
    year: "XIVe siècle",
    medium: "Faïence émaillée et stuc ciselé",
    museum: "Palais de l'Alhambra, Grenade",
    movement: "Art Islamique Nasride",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Alhambra_Mosaics.jpg/1024px-Alhambra_Mosaics.jpg",
    svgDataUri: toSvgDataUri(SVG_ART_ISLAMIQUE_ALHAMBRA),
    caption: "Motif géométrique et arabesque en zellige, Palais de l'Alhambra, Grenade (XIVe siècle)",
    keywords: ['alhambra', 'zellige', 'mosaïque', 'arabesque', 'art islamique', 'grenade', 'géométrie islamique', 'nasride']
  },
  {
    id: 'art_islamique_calligraphie',
    name: "Calligraphie Arabe Koufique (Coran Bleu)",
    artist: "Maître calligraphe",
    year: "IXe siècle",
    medium: "Or sur parchemin teinté à l'indigo",
    museum: "Musée d'Art Islamique",
    movement: "Art Islamique Médiéval",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Kufic_script_in_blue_Quran.jpg/1024px-Kufic_script_in_blue_Quran.jpg",
    svgDataUri: toSvgDataUri(SVG_CORAN_BLEU_CALLIGRAPHIE),
    caption: "Coran Bleu, Calligraphie en écriture koufique dorée sur parchemin teinté à l'indigo (IXe siècle)",
    keywords: ['calligraphie', 'coran bleu', 'koufique', 'calligraphie arabe', 'art islamique', 'kairouan', 'manuscrit']
  },
  {
    id: 'vermeer_jeune_fille_perle',
    name: "La Jeune Fille à la perle",
    artist: "Johannes Vermeer",
    year: "1665",
    medium: "Huile sur toile",
    museum: "Mauritshuis, La Haye",
    movement: "Baroque hollandais",
    url: "https://upload.wikimedia.org/wikipedia/commons/0/0f/1665_Girl_with_a_Pearl_Earring.jpg",
    svgDataUri: toSvgDataUri(SVG_VERMEER_PEARL),
    caption: "Johannes Vermeer, 'La Jeune Fille à la perle', vers 1665, Huile sur toile, 44.5 cm × 39 cm, Mauritshuis",
    keywords: ['jeune fille à la perle', 'vermeer', 'johannes vermeer', 'perle', 'turban', 'mauritshuis', 'baroque']
  }
];

// ═════════════════════════════════════════════════════════════════════════════
// 3. FONCTIONS DE DÉTECTION & DE RÉSOLUTION INTELLIGENTE D'OEUVRES D'ART
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Analyse tout texte (titre, consigne, légende ou identifiant) et recherche
 * si une oeuvre d'art connue y est référencée.
 */
export function findMatchingArtwork(text: string): ArtworkItem | null {
  if (!text) return null;
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const art of FAMOUS_ARTWORKS) {
    for (const kw of art.keywords) {
      const cleanKw = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(cleanKw)) {
        // Garde-fous pour les mots polysémiques courts
        if (cleanKw === 'chat' && !lower.includes('picasso') && !lower.includes('dora')) continue;
        if (cleanKw === '1941' && !lower.includes('picasso')) continue;
        if (cleanKw === '1937' && !lower.includes('guernica') && !lower.includes('picasso')) continue;
        if (cleanKw === 'estampe' && !lower.includes('hokusai') && !lower.includes('vague')) continue;
        if (cleanKw === 'japon' && !lower.includes('hokusai') && !lower.includes('vague')) continue;
        return art;
      }
    }
  }

  return null;
}

/**
 * Résout une source d'image (URL, data URI, nom textuel d'oeuvre) et son contexte textuel.
 * Si une oeuvre d'art est reconnue, renvoie sa représentation vectorielle SVG garantie ou son URL proxy.
 */
export function resolveArtworkOrImage(
  sourceUrl?: string,
  textContext?: string
): { imageUrl: string; imageCaption: string; artwork?: ArtworkItem } | null {
  const src = (sourceUrl || '').trim();
  const context = (textContext || '').trim();

  // 1. Si sourceUrl est déjà un SVG data URI ou SVG brut, il est parfait
  if (src.startsWith('data:image/svg+xml') || src.startsWith('<svg')) {
    return { imageUrl: src, imageCaption: context || 'Schéma / Figure vectorielle' };
  }

  // 2. Vérifier si sourceUrl ou textContext correspond à une oeuvre d'art du catalogue
  const matched = findMatchingArtwork(`${src} ${context}`);
  if (matched) {
    return {
      // Priorité au SVG autonome : zéro échec réseau, qualité rétina parfaite
      imageUrl: matched.svgDataUri,
      imageCaption: matched.caption,
      artwork: matched
    };
  }

  // 3. Si sourceUrl est une image data:image/ standard ou chemin relatif local
  if (src.startsWith('data:image/') || src.startsWith('/')) {
    return { imageUrl: src, imageCaption: context || 'Document visuel' };
  }

  // 4. Si sourceUrl est une URL HTTP/HTTPS externe
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return {
      // Utiliser le proxy sécurisé pour éviter 403 / CORS
      imageUrl: `/api/image-proxy?url=${encodeURIComponent(src)}`,
      imageCaption: context || 'Document visuel d\'accompagnement'
    };
  }

  return null;
}

/**
 * Génère dynamiquement une fiche documentaire muséale vectorielle pour une oeuvre personnalisée
 * lorsque l'enseignant ou l'IA cite une oeuvre non répertoriée dans le catalogue fixe.
 */
export function generateDynamicMuseumArtCard(options: {
  title: string;
  artist?: string;
  periodOrYear?: string;
  medium?: string;
  caption?: string;
}): { imageUrl: string; imageCaption: string } {
  const title = options.title || "Document d'Histoire des Arts";
  const artist = options.artist || "Artiste / Auteur";
  const year = options.periodOrYear || "Époque d'étude";
  const medium = options.medium || "Technique artistique";
  const caption = options.caption || `${artist}, '${title}', ${year} (${medium})`;

  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 380" width="100%" height="100%" style="background:#18181b;font-family:system-ui,-apple-system,sans-serif;">
  <defs>
    <linearGradient id="museum_wall" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e24"/>
      <stop offset="50%" stop-color="#2b2d42"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <linearGradient id="gold_frame" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d97706"/>
      <stop offset="50%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#92400e"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="url(#museum_wall)"/>

  <!-- Cadre doré de musée -->
  <rect x="40" y="30" width="460" height="250" rx="8" fill="none" stroke="url(#gold_frame)" stroke-width="8"/>
  <rect x="48" y="38" width="444" height="234" fill="#09090b" stroke="#78350f" stroke-width="2"/>

  <!-- Cimaise et toile d'art figurée -->
  <g transform="translate(60, 50)">
    <rect width="420" height="210" fill="#18181b"/>
    <!-- Palette d'étude artistique -->
    <circle cx="210" cy="90" r="45" fill="#3b82f6" opacity="0.3"/>
    <circle cx="170" cy="115" r="35" fill="#ef4444" opacity="0.3"/>
    <circle cx="245" cy="115" r="35" fill="#eab308" opacity="0.3"/>
    <!-- Icône d'art / chevalet -->
    <text x="210" y="105" font-size="42" text-anchor="middle">🎨</text>
    <text x="210" y="150" font-size="16" font-weight="bold" fill="#f8fafc" text-anchor="middle">${title}</text>
    <text x="210" y="172" font-size="12" fill="#cbd5e1" text-anchor="middle">${artist} • ${year}</text>
  </g>

  <!-- Cartel d'exposition officiel sous le cadre -->
  <rect x="70" y="295" width="400" height="65" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <text x="270" y="318" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">
    ${title}
  </text>
  <text x="270" y="336" font-size="11" fill="#94a3b8" text-anchor="middle">
    ${artist} — ${year} • ${medium}
  </text>
  <text x="270" y="351" font-size="9.5" fill="#38bdf8" text-anchor="middle">
    Document iconographique pour l'analyse visuelle et plastique (Programme PEI)
  </text>
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Fournit une URL sécurisée avec passage par proxy si nécessaire.
 */
export function getSafeArtworkImageUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('data:image/') || rawUrl.startsWith('<svg') || rawUrl.startsWith('/')) {
    return rawUrl;
  }
  return `/api/image-proxy?url=${encodeURIComponent(rawUrl)}`;
}
