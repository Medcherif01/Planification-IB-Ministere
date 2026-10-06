/**
 * educationalDiagramService.ts
 * 
 * Fournit des schémas vectoriels éducatifs de haute qualité (SVG vectoriels ultra-nets),
 * des figures géométriques cotées, des diagrammes scientifiques à légender ([A], [B], [C] ou [1], [2], [3])
 * et des graphiques de données pour enrichir les évaluations en ligne et imprimées.
 */

export interface EducationalDiagram {
  id: string;
  title: string;
  subjectCategory: 'math' | 'sciences' | 'geography' | 'data' | 'arts';
  caption: string;
  svgDataUri: string;
  description: string;
}

/**
 * Nettoie scrupuleusement toute balise HTML (<p>, <strong>, etc.) pour garantir
 * qu'aucun code source n'apparaît textuellement dans les questions ou sur les copies imprimées.
 * Gère le décodage d'entités HTML imbriquées (&lt;p class="mb-2"&gt;) et les balises orphelines.
 */
export function stripHtmlTags(str?: string): string {
  if (!str) return '';
  let result = str;

  // Décodage et décapage récursif (jusqu'à 3 passes pour les entités imbriquées)
  for (let pass = 0; pass < 3; pass++) {
    result = result
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '') // Supprime toute balise HTML standard <...>
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&');

    // S'il n'y a plus de crochets ni d'entités résiduelles, on sort
    if (!/<[a-z!\/]/i.test(result) && !/&(lt|gt|amp|quot|#39);/i.test(result)) {
      break;
    }
  }

  // Nettoyage de sécurité renforcé : supprime tout reste textuel de balises connues même mal formées
  result = result
    .replace(/<\/?(?:p|strong|b|em|i|u|span|div|table|tr|td|th|tbody|thead|ul|ol|li|h[1-6]|font|a|section|article)[^>]*>/gi, '')
    .replace(/<[a-zA-Z][^>]*>/g, '')
    .replace(/<\/[a-zA-Z]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}

/**
 * Encode un SVG propre en Data URI
 */
function toSvgDataUri(svgXml: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgXml.trim())}`;
}

// ── 1. GÉOMÉTRIE & MATHÉMATIQUES ─────────────────────────────────────────────

const SVG_TRIANGLE_RECTANGLE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="230" y="28" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Figure 1 : Triangle ABC rectangle en B</text>
  
  <!-- Triangle ABC -->
  <polygon points="70,220 370,220 70,70" fill="#f1f5f9" stroke="#334155" stroke-width="3"/>
  
  <!-- Angle droit en B (70, 220) -->
  <path d="M 70,195 L 95,195 L 95,220" fill="none" stroke="#dc2626" stroke-width="2.5"/>
  <circle cx="82" cy="207" r="2.5" fill="#dc2626"/>
  
  <!-- Sommets -->
  <circle cx="70" cy="70" r="5" fill="#4f46e5"/>
  <text x="50" y="65" font-size="16" font-weight="900" fill="#4f46e5">A</text>
  
  <circle cx="70" cy="220" r="5" fill="#dc2626"/>
  <text x="50" y="240" font-size="16" font-weight="900" fill="#dc2626">B</text>
  
  <circle cx="370" cy="220" r="5" fill="#4f46e5"/>
  <text x="385" y="228" font-size="16" font-weight="900" fill="#4f46e5">C</text>
  
  <!-- Cotes et mesures -->
  <text x="45" y="145" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">c = AB = 6 cm</text>
  <text x="220" y="244" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">a = BC = 8 cm</text>
  <text x="240" y="130" font-size="13" font-weight="bold" fill="#4f46e5" text-anchor="start">Hypoténuse b = AC = ?</text>
  
  <!-- Arc d'angle C -->
  <path d="M 330,220 A 40 40 0 0 0 342,206" fill="none" stroke="#7c3aed" stroke-width="2"/>
  <text x="310" y="212" font-size="12" font-weight="bold" fill="#7c3aed">α</text>
</svg>
`);

const SVG_REPERE_FONCTION = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 290" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="230" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Figure 2 : Repère orthonormé (O, I, J) et droite (D)</text>
  
  <!-- Grille -->
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="40" y="40" width="380" height="220" fill="url(#grid)"/>
  
  <!-- Axes (Origine à 190, 190) -->
  <line x1="40" y1="190" x2="420" y2="190" stroke="#334155" stroke-width="2"/>
  <polygon points="420,190 412,185 412,195" fill="#334155"/>
  <text x="415" y="210" font-size="13" font-weight="bold" fill="#334155">x</text>
  
  <line x1="190" y1="260" x2="190" y2="40" stroke="#334155" stroke-width="2"/>
  <polygon points="190,40 185,48 195,48" fill="#334155"/>
  <text x="175" y="52" font-size="13" font-weight="bold" fill="#334155">y</text>
  
  <!-- Origine O -->
  <text x="178" y="208" font-size="13" font-weight="bold" fill="#334155">O</text>
  
  <!-- Graduations -->
  <text x="220" y="206" font-size="11" fill="#64748b">1</text>
  <text x="250" y="206" font-size="11" fill="#64748b">2</text>
  <text x="280" y="206" font-size="11" fill="#64748b">3</text>
  <text x="178" y="164" font-size="11" fill="#64748b">1</text>
  <text x="178" y="134" font-size="11" fill="#64748b">2</text>
  
  <!-- Droite (D) : y = 0.8x + 1 -->
  <line x1="60" y1="225" x2="380" y2="105" stroke="#7c3aed" stroke-width="3"/>
  <text x="350" y="98" font-size="13" font-weight="bold" fill="#7c3aed">(D) : y = f(x)</text>
  
  <!-- Points remarquables -->
  <circle cx="190" cy="160" r="4.5" fill="#dc2626"/>
  <text x="200" y="156" font-size="12" font-weight="bold" fill="#dc2626">A(0, 1)</text>
  
  <circle cx="280" cy="130" r="4.5" fill="#dc2626"/>
  <text x="290" y="126" font-size="12" font-weight="bold" fill="#dc2626">B(3, 2)</text>
</svg>
`);

const SVG_PAVE_DROIT = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="230" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Figure 3 : Pavé droit ABCDEFGH en perspective cavalière</text>
  
  <!-- Arêtes cachées (pointillées) -->
  <line x1="80" y1="200" x2="160" y2="130" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,5"/>
  <line x1="160" y1="130" x2="380" y2="130" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,5"/>
  <line x1="160" y1="130" x2="160" y2="60" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5,5"/>
  
  <!-- Face avant ABFE -->
  <polygon points="80,200 300,200 300,130 80,130" fill="#f8fafc" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Face supérieure EFGH -->
  <polygon points="80,130 300,130 380,60 160,60" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Face latérale droite BCGF -->
  <polygon points="300,200 380,130 380,60 300,130" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Sommets -->
  <text x="68" y="215" font-size="13" font-weight="bold" fill="#4f46e5">A</text>
  <text x="305" y="215" font-size="13" font-weight="bold" fill="#4f46e5">B</text>
  <text x="388" y="142" font-size="13" font-weight="bold" fill="#4f46e5">C</text>
  <text x="145" y="140" font-size="13" font-weight="bold" fill="#64748b">D</text>
  <text x="68" y="128" font-size="13" font-weight="bold" fill="#4f46e5">E</text>
  <text x="290" y="124" font-size="13" font-weight="bold" fill="#4f46e5">F</text>
  <text x="388" y="58" font-size="13" font-weight="bold" fill="#4f46e5">G</text>
  <text x="150" y="55" font-size="13" font-weight="bold" fill="#4f46e5">H</text>
  
  <!-- Dimensions -->
  <text x="190" y="222" font-size="13" font-weight="bold" fill="#dc2626" text-anchor="middle">Longueur L = 8 cm</text>
  <text x="355" y="185" font-size="12" font-weight="bold" fill="#dc2626">Largeur l = 5 cm</text>
  <text x="52" y="170" font-size="12" font-weight="bold" fill="#dc2626">Hauteur h = 4 cm</text>
</svg>
`);

// ── 2. SCIENCES & SCHÉMAS À LÉGENDER ─────────────────────────────────────────

const SVG_CIRCUIT_ELECTRIQUE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 1 : Schéma du circuit électrique en boucle simple</text>
  <text x="240" y="44" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Identifiez les composants repérés par les lettres [A], [B], [C] et [D]</text>
  
  <!-- Boucle du circuit -->
  <rect x="70" y="70" width="340" height="180" fill="none" stroke="#334155" stroke-width="3" rx="8"/>
  
  <!-- [A] Générateur / Pile en haut -->
  <rect x="200" y="60" width="80" height="20" fill="#ffffff"/>
  <line x1="225" y1="58" x2="225" y2="82" stroke="#dc2626" stroke-width="3"/>
  <line x1="245" y1="64" x2="245" y2="76" stroke="#1e293b" stroke-width="4"/>
  <text x="215" y="55" font-size="12" font-weight="bold" fill="#dc2626">+</text>
  <text x="255" y="55" font-size="14" font-weight="bold" fill="#1e293b">-</text>
  <!-- Repère [A] -->
  <circle cx="235" cy="105" r="14" fill="#ef4444"/>
  <text x="235" y="110" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">A</text>
  
  <!-- [B] Interrupteur à droite -->
  <rect x="400" y="130" width="20" height="60" fill="#ffffff"/>
  <circle cx="410" cy="140" r="3.5" fill="#334155"/>
  <line x1="410" y1="140" x2="425" y2="165" stroke="#334155" stroke-width="3"/>
  <circle cx="410" cy="180" r="3.5" fill="#334155"/>
  <!-- Repère [B] -->
  <circle cx="445" cy="160" r="14" fill="#3b82f6"/>
  <text x="445" y="165" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">B</text>
  
  <!-- [C] Lampe en bas -->
  <rect x="210" y="240" width="60" height="20" fill="#ffffff"/>
  <circle cx="240" cy="250" r="16" fill="#fef08a" stroke="#ca8a04" stroke-width="2"/>
  <line x1="229" y1="239" x2="251" y2="261" stroke="#ca8a04" stroke-width="2.5"/>
  <line x1="251" y1="239" x2="229" y2="261" stroke="#ca8a04" stroke-width="2.5"/>
  <!-- Repère [C] -->
  <circle cx="240" cy="215" r="14" fill="#eab308"/>
  <text x="240" y="220" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">C</text>
  
  <!-- [D] Résistance / Conducteur ohmique à gauche -->
  <rect x="60" y="135" width="20" height="50" fill="#ffffff"/>
  <rect x="58" y="140" width="24" height="40" fill="#e0e7ff" stroke="#4338ca" stroke-width="2"/>
  <!-- Repère [D] -->
  <circle cx="35" cy="160" r="14" fill="#8b5cf6"/>
  <text x="35" y="165" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">D</text>
  
  <!-- Flèche sens du courant (conventionnel) -->
  <polygon points="140,65 150,70 140,75" fill="#dc2626"/>
  <text x="145" y="60" font-size="11" font-weight="bold" fill="#dc2626">I (courant)</text>
</svg>
`);

const SVG_CELLULE_BIOLOGIQUE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 2 : Structure d'une cellule animale observée au microscope</text>
  <text x="240" y="44" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Associez chaque numéro [1, 2, 3, 4] au bon constituant cellulaire</text>
  
  <!-- Membrane plasmique -->
  <ellipse cx="240" cy="165" rx="150" ry="90" fill="#e0f2fe" stroke="#0284c7" stroke-width="3.5"/>
  
  <!-- Cytoplasme (fond) -->
  
  <!-- Noyau avec nucléole -->
  <circle cx="210" cy="155" r="40" fill="#c084fc" stroke="#7e22ce" stroke-width="3"/>
  <circle cx="205" cy="150" r="14" fill="#6b21a8"/>
  
  <!-- Mitochondries -->
  <ellipse cx="320" cy="140" rx="18" ry="10" fill="#fca5a5" stroke="#b91c1c" stroke-width="2" transform="rotate(-25 320 140)"/>
  <ellipse cx="160" cy="205" rx="16" ry="9" fill="#fca5a5" stroke="#b91c1c" stroke-width="2" transform="rotate(30 160 205)"/>
  
  <!-- Réticulum / Vacuoles -->
  <circle cx="300" cy="195" r="8" fill="#bae6fd" stroke="#0369a1" stroke-width="1.5"/>
  
  <!-- Flèches et étiquettes à légender -->
  <!-- 1. Membrane plasmique -->
  <line x1="390" y1="165" x2="435" y2="135" stroke="#0369a1" stroke-width="2"/>
  <circle cx="445" cy="128" r="13" fill="#0284c7"/>
  <text x="445" y="133" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
  
  <!-- 2. Cytoplasme -->
  <line x1="270" cy1="225" x2="310" y2="265" stroke="#0369a1" stroke-width="2"/>
  <circle cx="320" cy="272" r="13" fill="#0284c7"/>
  <text x="320" y="277" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
  
  <!-- 3. Noyau -->
  <line x1="210" cy1="115" x2="160" y2="75" stroke="#7e22ce" stroke-width="2"/>
  <circle cx="150" cy="68" r="13" fill="#7e22ce"/>
  <text x="150" y="73" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
  
  <!-- 4. Mitochondrie -->
  <line x1="335" y1="135" x2="400" y2="85" stroke="#b91c1c" stroke-width="2"/>
  <circle cx="410" cy="78" r="13" fill="#b91c1c"/>
  <text x="410" y="83" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
</svg>
`);

const SVG_CYCLE_EAU = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 3 : Schéma du cycle biogéochimique de l'eau</text>
  <text x="240" y="44" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Nommez les quatre étapes du cycle numérotées [1, 2, 3, 4]</text>
  
  <!-- Océan / Eau -->
  <path d="M 0,230 Q 150,215 300,230 L 480,225 L 480,300 L 0,300 Z" fill="#38bdf8"/>
  <text x="400" y="270" font-size="13" font-weight="bold" fill="#0369a1">Océan</text>
  
  <!-- Relief / Montagne -->
  <polygon points="0,230 110,120 220,230" fill="#a3e635" stroke="#65a30d" stroke-width="2"/>
  <polygon points="80,150 110,120 140,150" fill="#ffffff"/>
  
  <!-- Nuages -->
  <ellipse cx="260" cy="100" rx="35" ry="18" fill="#e2e8f0"/>
  <ellipse cx="285" cy="95" rx="30" ry="20" fill="#e2e8f0"/>
  <ellipse cx="235" cy="105" rx="25" ry="15" fill="#e2e8f0"/>
  
  <ellipse cx="120" cy="90" rx="30" ry="16" fill="#cbd5e1"/>
  
  <!-- Soleil -->
  <circle cx="430" cy="70" r="24" fill="#facc15" stroke="#eab308" stroke-width="2"/>
  
  <!-- Étape 1 : Évaporation -->
  <path d="M 370,220 C 365,180 340,150 320,130" fill="none" stroke="#0284c7" stroke-width="3" stroke-dasharray="6,4"/>
  <polygon points="320,130 323,138 316,134" fill="#0284c7"/>
  <circle cx="380" cy="170" r="13" fill="#0284c7"/>
  <text x="380" y="175" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
  
  <!-- Étape 2 : Condensation -->
  <circle cx="260" cy="65" r="13" fill="#0284c7"/>
  <text x="260" y="70" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
  
  <!-- Étape 3 : Précipitations -->
  <line x1="110" y1="110" x2="100" y2="140" stroke="#0284c7" stroke-width="2" stroke-dasharray="4,4"/>
  <line x1="125" y1="110" x2="115" y2="140" stroke="#0284c7" stroke-width="2" stroke-dasharray="4,4"/>
  <circle cx="70" cy="100" r="13" fill="#0284c7"/>
  <text x="70" y="105" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
  
  <!-- Étape 4 : Ruissellement / Infiltration -->
  <path d="M 140,210 Q 220,240 310,235" fill="none" stroke="#0284c7" stroke-width="3"/>
  <circle cx="210" cy="205" r="13" fill="#0284c7"/>
  <text x="210" y="210" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
</svg>
`);

// ── 3. DONNÉES & GRAPHIQUES ──────────────────────────────────────────────────

const SVG_GRAPHIQUE_BARRES = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="230" y="26" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 4 : Résultats comparatifs d'une étude expérimentale</text>
  
  <!-- Axe Y -->
  <line x1="60" y1="220" x2="60" y2="50" stroke="#334155" stroke-width="2"/>
  <polygon points="60,50 56,58 64,58" fill="#334155"/>
  <text x="50" y="44" font-size="11" font-weight="bold" fill="#334155" text-anchor="end">Valeur (%)</text>
  
  <!-- Axe X -->
  <line x1="60" y1="220" x2="420" y2="220" stroke="#334155" stroke-width="2"/>
  <polygon points="420,220 412,216 412,224" fill="#334155"/>
  <text x="415" y="238" font-size="11" font-weight="bold" fill="#334155">Groupe</text>
  
  <!-- Graduations Y -->
  <line x1="56" y1="180" x2="60" y2="180" stroke="#334155" stroke-width="2"/>
  <text x="50" y="184" font-size="10" fill="#64748b" text-anchor="end">25%</text>
  <line x1="60" y1="180" x2="410" y2="180" stroke="#f1f5f9" stroke-width="1"/>
  
  <line x1="56" y1="140" x2="60" y2="140" stroke="#334155" stroke-width="2"/>
  <text x="50" y="144" font-size="10" fill="#64748b" text-anchor="end">50%</text>
  <line x1="60" y1="140" x2="410" y2="140" stroke="#f1f5f9" stroke-width="1"/>
  
  <line x1="56" y1="100" x2="60" y2="100" stroke="#334155" stroke-width="2"/>
  <text x="50" y="104" font-size="10" fill="#64748b" text-anchor="end">75%</text>
  <line x1="60" y1="100" x2="410" y2="100" stroke="#f1f5f9" stroke-width="1"/>
  
  <line x1="56" y1="60" x2="60" y2="60" stroke="#334155" stroke-width="2"/>
  <text x="50" y="64" font-size="10" fill="#64748b" text-anchor="end">100%</text>
  <line x1="60" y1="60" x2="410" y2="60" stroke="#f1f5f9" stroke-width="1"/>
  
  <!-- Barres -->
  <!-- A: 45% (hauteur 72px) -->
  <rect x="95" y="148" width="50" height="72" fill="#3b82f6" rx="4"/>
  <text x="120" y="140" font-size="11" font-weight="bold" fill="#3b82f6" text-anchor="middle">45%</text>
  <text x="120" y="238" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">Groupe A</text>
  
  <!-- B: 80% (hauteur 128px) -->
  <rect x="175" y="92" width="50" height="128" fill="#10b981" rx="4"/>
  <text x="200" y="84" font-size="11" font-weight="bold" fill="#10b981" text-anchor="middle">80%</text>
  <text x="200" y="238" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">Groupe B</text>
  
  <!-- C: 60% (hauteur 96px) -->
  <rect x="255" y="124" width="50" height="96" fill="#f59e0b" rx="4"/>
  <text x="280" y="116" font-size="11" font-weight="bold" fill="#f59e0b" text-anchor="middle">60%</text>
  <text x="280" y="238" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">Groupe C</text>
  
  <!-- D: 30% (hauteur 48px) -->
  <rect x="335" y="172" width="50" height="48" fill="#8b5cf6" rx="4"/>
  <text x="360" y="164" font-size="11" font-weight="bold" fill="#8b5cf6" text-anchor="middle">30%</text>
  <text x="360" y="238" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">Témoin</text>
</svg>
`);

// ── 4. SCIENCES DU VIVANT & PHYSIQUE-CHIMIE COMPLÉMENTAIRES ─────────────────

const SVG_SYSTEME_RESPIRATOIRE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="24" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 5 : Appareil respiratoire humain à légender</text>
  <text x="240" y="42" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Associez chaque numéro [1, 2, 3, 4] à l'organe correspondant</text>
  
  <!-- Silhouette trachée & larynx -->
  <path d="M 230,55 L 250,55 L 250,120 L 230,120 Z" fill="#fed7aa" stroke="#c2410c" stroke-width="2.5"/>
  <!-- Anneaux trachéaux -->
  <line x1="230" y1="70" x2="250" y2="70" stroke="#c2410c" stroke-width="1.5"/>
  <line x1="230" y1="85" x2="250" y2="85" stroke="#c2410c" stroke-width="1.5"/>
  <line x1="230" y1="100" x2="250" y2="100" stroke="#c2410c" stroke-width="1.5"/>
  
  <!-- Repère [1] Trachée -->
  <line x1="250" y1="85" x2="340" y2="70" stroke="#dc2626" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="355" cy="70" r="14" fill="#ef4444"/>
  <text x="355" y="75" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
  
  <!-- Bifurcation bronchique -->
  <path d="M 230,120 L 195,155 L 205,165 L 240,130" fill="#fed7aa" stroke="#c2410c" stroke-width="2"/>
  <path d="M 250,120 L 285,155 L 275,165 L 240,130" fill="#fed7aa" stroke="#c2410c" stroke-width="2"/>
  
  <!-- Repère [3] Bronches -->
  <line x1="205" y1="160" x2="110" y2="135" stroke="#2563eb" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="95" cy="135" r="14" fill="#3b82f6"/>
  <text x="95" y="140" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
  
  <!-- Poumon Droit -->
  <path d="M 190,130 C 130,140 120,200 135,240 C 150,260 210,255 220,230 C 225,200 215,145 190,130 Z" fill="#fecdd3" stroke="#e11d48" stroke-width="2.5"/>
  
  <!-- Poumon Gauche (légèrement plus petit pour le cœur) -->
  <path d="M 290,130 C 350,140 360,200 345,240 C 330,260 270,255 260,230 C 255,200 265,145 290,130 Z" fill="#fecdd3" stroke="#e11d48" stroke-width="2.5"/>
  
  <!-- Repère [2] Poumon gauche -->
  <line x1="330" y1="190" x2="410" y2="180" stroke="#059669" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="425" cy="180" r="14" fill="#10b981"/>
  <text x="425" y="185" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
  
  <!-- Diaphragme en bas -->
  <path d="M 110,270 Q 240,240 370,270" fill="none" stroke="#7c3aed" stroke-width="4"/>
  <!-- Repère [4] Diaphragme -->
  <line x1="240" y1="255" x2="240" y2="295" stroke="#7c3aed" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="240" cy="298" r="14" fill="#8b5cf6"/>
  <text x="240" y="303" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
</svg>
`);

const SVG_PHOTOSYNTHESE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="24" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 6 : Le processus de la photosynthèse végétale</text>
  <text x="240" y="42" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Légendez les flux [A], [B], [C] et [D] intervenant dans la réaction</text>
  
  <!-- Feuille centrale stylisée -->
  <path d="M 120,200 C 120,110 240,70 340,90 C 350,180 280,240 120,200 Z" fill="#bbf7d0" stroke="#16a34a" stroke-width="3"/>
  <path d="M 120,200 Q 220,150 340,90" fill="none" stroke="#15803d" stroke-width="2"/>
  <path d="M 180,170 Q 200,130 220,120" fill="none" stroke="#15803d" stroke-width="1.5"/>
  <path d="M 230,150 Q 260,130 280,110" fill="none" stroke="#15803d" stroke-width="1.5"/>
  
  <!-- Soleil & Rayonnement lumineux [A] -->
  <circle cx="60" cy="65" r="22" fill="#fde047" stroke="#eab308" stroke-width="2"/>
  <line x1="85" y1="75" x2="160" y2="105" stroke="#eab308" stroke-width="3" stroke-dasharray="4,3"/>
  <polygon points="160,105 150,100 154,109" fill="#eab308"/>
  <circle cx="100" cy="115" r="14" fill="#eab308"/>
  <text x="100" y="120" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">A</text>
  
  <!-- Entrée CO2 [B] -->
  <path d="M 40,160 Q 90,165 140,170" fill="none" stroke="#64748b" stroke-width="3"/>
  <polygon points="140,170 130,165 132,175" fill="#64748b"/>
  <circle cx="50" cy="180" r="14" fill="#475569"/>
  <text x="50" y="185" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">B</text>
  
  <!-- Eau et sels minéraux absorbés par les racines [C] -->
  <path d="M 130,290 L 130,215" fill="none" stroke="#0284c7" stroke-width="3"/>
  <polygon points="130,215 125,225 135,225" fill="#0284c7"/>
  <circle cx="95" cy="265" r="14" fill="#0284c7"/>
  <text x="95" y="270" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">C</text>
  
  <!-- Sortie O2 et production de matière organique (Glucose) [D] -->
  <path d="M 330,150 Q 380,160 420,180" fill="none" stroke="#16a34a" stroke-width="3"/>
  <polygon points="420,180 410,173 412,183" fill="#16a34a"/>
  <circle cx="435" cy="150" r="14" fill="#16a34a"/>
  <text x="435" y="155" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">D</text>
  
  <text x="240" y="300" font-size="11" font-weight="bold" fill="#047857" text-anchor="middle">Équation-bilan : 6 CO₂ + 6 H₂O + Lumière ➔ C₆H₁₂O₆ + 6 O₂</text>
</svg>
`);

const SVG_MICROSCOPE_OPTIQUE = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="24" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 7 : Microscope optique de laboratoire</text>
  <text x="240" y="42" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Identifiez les 4 éléments fondamentaux repérés [1, 2, 3, 4]</text>
  
  <!-- Base du microscope -->
  <rect x="160" y="270" width="160" height="25" rx="6" fill="#334155" stroke="#1e293b" stroke-width="2"/>
  
  <!-- Potence / Bras -->
  <path d="M 280,270 C 310,250 310,130 260,110" fill="none" stroke="#475569" stroke-width="14" stroke-linecap="round"/>
  
  <!-- Tube optique -->
  <rect x="200" y="80" width="30" height="70" fill="#cbd5e1" stroke="#334155" stroke-width="2" transform="rotate(-15 215 115)"/>
  
  <!-- [1] Oculaire en haut -->
  <rect x="180" y="60" width="34" height="24" rx="4" fill="#1e293b"/>
  <line x1="210" y1="65" x2="120" y2="65" stroke="#dc2626" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="105" cy="65" r="14" fill="#ef4444"/>
  <text x="105" y="70" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">1</text>
  
  <!-- Tourelle & [2] Objectif -->
  <circle cx="230" cy="155" r="16" fill="#334155"/>
  <rect x="220" y="165" width="14" height="26" fill="#ca8a04" stroke="#854d0e" stroke-width="1.5"/>
  <line x1="230" y1="180" x2="120" y2="180" stroke="#2563eb" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="105" cy="180" r="14" fill="#3b82f6"/>
  <text x="105" y="185" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">2</text>
  
  <!-- [3] Platine avec valet -->
  <rect x="180" y="200" width="100" height="10" rx="3" fill="#0f172a"/>
  <line x1="280" y1="205" x2="390" y2="205" stroke="#059669" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="405" cy="205" r="14" fill="#10b981"/>
  <text x="405" y="210" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">3</text>
  
  <!-- [4] Vis macrométrique / micrométrique -->
  <circle cx="300" cy="220" r="16" fill="#64748b" stroke="#334155" stroke-width="3"/>
  <circle cx="300" cy="220" r="9" fill="#94a3b8"/>
  <line x1="316" y1="220" x2="390" y2="250" stroke="#7c3aed" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="405" cy="255" r="14" fill="#8b5cf6"/>
  <text x="405" y="260" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">4</text>
  
  <!-- Miroir / Source lumineuse -->
  <circle cx="230" cy="245" r="12" fill="#fde047" stroke="#ca8a04" stroke-width="2"/>
</svg>
`);

const SVG_MODELE_ATOME = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="240" y="24" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Document 8 : Modèle atomique et constituants de la matière</text>
  <text x="240" y="42" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Identifiez les particules [A], [B], [C] et la région [D]</text>
  
  <!-- Orbites électroniques -->
  <ellipse cx="240" cy="165" rx="160" ry="60" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,3" transform="rotate(-30 240 165)"/>
  <ellipse cx="240" cy="165" rx="160" ry="60" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,3" transform="rotate(30 240 165)"/>
  <ellipse cx="240" cy="165" rx="160" ry="60" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="5,3" transform="rotate(90 240 165)"/>
  
  <!-- Électrons [A] (négatifs) -->
  <circle cx="110" cy="130" r="7" fill="#3b82f6"/>
  <text x="110" y="133" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">-</text>
  <circle cx="370" cy="200" r="7" fill="#3b82f6"/>
  <text x="370" y="203" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle">-</text>
  
  <!-- Repère [A] Électron -->
  <line x1="110" y1="125" x2="60" y2="90" stroke="#3b82f6" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="50" cy="80" r="14" fill="#3b82f6"/>
  <text x="50" y="85" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">A</text>
  
  <!-- Noyau central [B] -->
  <circle cx="240" cy="165" r="32" fill="#f1f5f9" stroke="#94a3b8" stroke-width="2"/>
  
  <!-- Protons [C] (positifs, rouge) -->
  <circle cx="230" cy="155" r="9" fill="#ef4444"/>
  <text x="230" y="159" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">+</text>
  <circle cx="248" cy="172" r="9" fill="#ef4444"/>
  <text x="248" y="176" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">+</text>
  <circle cx="252" cy="155" r="9" fill="#ef4444"/>
  
  <!-- Neutrons (gris neutre) -->
  <circle cx="232" cy="172" r="9" fill="#64748b"/>
  <circle cx="242" cy="162" r="9" fill="#64748b"/>
  
  <!-- Repère [B] Noyau -->
  <line x1="270" y1="165" x2="380" y2="120" stroke="#7c3aed" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="395" cy="115" r="14" fill="#8b5cf6"/>
  <text x="395" y="120" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">B</text>
  
  <!-- Repère [C] Proton -->
  <line x1="248" y1="181" x2="340" y2="260" stroke="#ef4444" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="350" cy="270" r="14" fill="#ef4444"/>
  <text x="350" y="275" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">C</text>
  
  <!-- Repère [D] Nuage / Cortège électronique -->
  <line x1="300" y1="90" x2="380" y2="60" stroke="#059669" stroke-width="2" stroke-dasharray="3,3"/>
  <circle cx="395" cy="55" r="14" fill="#10b981"/>
  <text x="395" y="60" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">D</text>
</svg>
`);

const SVG_THEOREME_THALES = toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="10" stroke="#e2e8f0" stroke-width="2"/>
  <text x="230" y="24" font-size="14" font-weight="bold" fill="#1e293b" text-anchor="middle">Figure 4 : Configuration de Thalès - Droites sécantes et parallèles (MN) // (BC)</text>
  
  <!-- Grand triangle ABC -->
  <polygon points="200,50 60,230 380,230" fill="#f8fafc" stroke="#1e293b" stroke-width="3"/>
  
  <!-- Ligne parallèle (MN) -->
  <line x1="110" y1="165" x2="315" y2="165" stroke="#7c3aed" stroke-width="3"/>
  
  <!-- Sommets et points -->
  <circle cx="200" cy="50" r="5" fill="#4f46e5"/>
  <text x="200" y="42" font-size="15" font-weight="900" fill="#4f46e5" text-anchor="middle">A</text>
  
  <circle cx="60" cy="230" r="5" fill="#1e293b"/>
  <text x="45" y="240" font-size="15" font-weight="900" fill="#1e293b">B</text>
  
  <circle cx="380" cy="230" r="5" fill="#1e293b"/>
  <text x="395" y="240" font-size="15" font-weight="900" fill="#1e293b">C</text>
  
  <circle cx="110" cy="165" r="5" fill="#7c3aed"/>
  <text x="88" y="165" font-size="15" font-weight="900" fill="#7c3aed">M</text>
  
  <circle cx="315" cy="165" r="5" fill="#7c3aed"/>
  <text x="328" y="165" font-size="15" font-weight="900" fill="#7c3aed">N</text>
  
  <!-- Flèches de parallélisme (MN) // (BC) -->
  <polygon points="210,162 218,165 210,168" fill="#7c3aed"/>
  <polygon points="210,227 218,230 210,233" fill="#1e293b"/>
  
  <!-- Mesures indicatives -->
  <text x="140" y="105" font-size="12" font-weight="bold" fill="#dc2626">AM = 4 cm</text>
  <text x="215" y="155" font-size="12" font-weight="bold" fill="#7c3aed" text-anchor="middle">MN = 5 cm</text>
  <text x="220" y="250" font-size="12" font-weight="bold" fill="#0f172a" text-anchor="middle">BC = 10 cm</text>
  <text x="365" y="130" font-size="12" font-weight="bold" fill="#dc2626">AC = 12 cm</text>
</svg>
`);

// ── 4. CATALOGUE DES SCHÉMAS ─────────────────────────────────────────────────

export const EDUCATIONAL_DIAGRAMS: EducationalDiagram[] = [
  {
    id: 'math_triangle_rectangle',
    title: 'Triangle rectangle (Théorème de Pythagore & Trigonométrie)',
    subjectCategory: 'math',
    caption: "Figure 1 : Triangle ABC rectangle en B avec mesures et angles",
    svgDataUri: SVG_TRIANGLE_RECTANGLE,
    description: "Triangle rectangle annoté avec côtés et angle à calculer.",
  },
  {
    id: 'math_repere_fonction',
    title: 'Repère orthonormé & Représentation graphique',
    subjectCategory: 'math',
    caption: "Figure 2 : Repère (O, I, J) et droite d'équation y = f(x)",
    svgDataUri: SVG_REPERE_FONCTION,
    description: "Axes cartésiens gradués et droite affine avec points repères A et B.",
  },
  {
    id: 'math_pave_droit',
    title: 'Pavé droit en perspective cavalière',
    subjectCategory: 'math',
    caption: "Figure 3 : Pavé droit ABCDEFGH avec dimensions L, l et h",
    svgDataUri: SVG_PAVE_DROIT,
    description: "Géométrie dans l'espace avec arêtes visibles et cachées en pointillés.",
  },
  {
    id: 'sciences_circuit_electrique',
    title: 'Circuit électrique à légender [A, B, C, D]',
    subjectCategory: 'sciences',
    caption: "Document 1 : Schéma du circuit électrique avec composants repérés [A, B, C, D]",
    svgDataUri: SVG_CIRCUIT_ELECTRIQUE,
    description: "Schéma normalisé d'un circuit en série avec repères pour identification des composants.",
  },
  {
    id: 'sciences_cellule_animale',
    title: 'Cellule animale à légender [1, 2, 3, 4]',
    subjectCategory: 'sciences',
    caption: "Document 2 : Schéma cellulaire au microscope avec organites repérés [1, 2, 3, 4]",
    svgDataUri: SVG_CELLULE_BIOLOGIQUE,
    description: "Structure cellulaire avec flèches pointant membrane, cytoplasme, noyau et mitochondrie.",
  },
  {
    id: 'sciences_cycle_eau',
    title: "Cycle de l'eau à légender [1, 2, 3, 4]",
    subjectCategory: 'sciences',
    caption: "Document 3 : Schéma du cycle de l'eau avec étapes numérotées [1, 2, 3, 4]",
    svgDataUri: SVG_CYCLE_EAU,
    description: "Représentation dynamique de l'évaporation, condensation, précipitations et ruissellement.",
  },
  {
    id: 'data_comparatif_barres',
    title: 'Graphique comparatif en barres & Histogramme',
    subjectCategory: 'data',
    caption: "Document 4 : Histogramme comparatif des valeurs expérimentales (%)",
    svgDataUri: SVG_GRAPHIQUE_BARRES,
    description: "Graphique statistique avec axes étiquetés et barres de valeurs à analyser.",
  },
  {
    id: 'sciences_systeme_respiratoire',
    title: 'Appareil respiratoire humain à légender [1, 2, 3, 4]',
    subjectCategory: 'sciences',
    caption: "Document 5 : Appareil respiratoire humain avec organes repérés [1, 2, 3, 4]",
    svgDataUri: SVG_SYSTEME_RESPIRATOIRE,
    description: "Trachée, poumon, bronches et diaphragme pour étude d'anatomie et de physiologie.",
  },
  {
    id: 'sciences_photosynthese',
    title: 'Photosynthèse et échanges gazeux foliaires [A, B, C, D]',
    subjectCategory: 'sciences',
    caption: "Document 6 : Schéma des flux de la photosynthèse à légender [A, B, C, D]",
    svgDataUri: SVG_PHOTOSYNTHESE,
    description: "Flux d'énergie lumineuse, CO2, H2O, O2 et matière organique pour la photosynthèse.",
  },
  {
    id: 'sciences_optique_microscope',
    title: 'Microscope optique de laboratoire à légender [1, 2, 3, 4]',
    subjectCategory: 'sciences',
    caption: "Document 7 : Schéma du microscope optique avec composants repérés [1, 2, 3, 4]",
    svgDataUri: SVG_MICROSCOPE_OPTIQUE,
    description: "Oculaire, objectif, platine et vis de mise au point d'un microscope.",
  },
  {
    id: 'sciences_modele_atome',
    title: 'Modèle atomique et particules subatomiques [A, B, C, D]',
    subjectCategory: 'sciences',
    caption: "Document 8 : Modèle atomique avec particules repérées [A, B, C, D]",
    svgDataUri: SVG_MODELE_ATOME,
    description: "Électrons, noyau, protons et cortège électronique pour la physique-chimie.",
  },
  {
    id: 'math_theoreme_thales',
    title: 'Théorème de Thalès et triangles semblables',
    subjectCategory: 'math',
    caption: "Figure 4 : Configuration de Thalès avec droites parallèles (MN) // (BC)",
    svgDataUri: SVG_THEOREME_THALES,
    description: "Droites sécantes et parallèles avec mesures pour calculs de proportionnalité.",
  },
];

/**
 * Détecte intelligemment si une tâche doit être accompagnée d'un schéma visuel
 * et renvoie le schéma éducatif le plus pertinent si aucun n'est présent.
 */
export function detectAndAttachEducationalDiagram(
  subject: string,
  unitTitle: string,
  exerciseTitle: string,
  exerciseContent: string
): { imageUrl: string; imageCaption: string } | null {
  const fullText = `${subject} ${unitTitle} ${exerciseTitle} ${exerciseContent}`.toLowerCase();

  // 1. Physique - Chimie / Électricité
  if (
    fullText.includes('circuit') ||
    fullText.includes('électrique') ||
    fullText.includes('pile') ||
    fullText.includes('lampe') ||
    fullText.includes('tension') ||
    fullText.includes('intensité') ||
    fullText.includes('courant')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_circuit_electrique')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 2. Respiration / Poumons / Échanges gazeux
  if (
    fullText.includes('respirat') ||
    fullText.includes('poumon') ||
    fullText.includes('trachée') ||
    fullText.includes('bronche') ||
    fullText.includes('diaphragme') ||
    fullText.includes('alvéole')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_systeme_respiratoire');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 3. Photosynthèse / Végétaux / Énergie lumineuse
  if (
    fullText.includes('photosynth') ||
    fullText.includes('feuille') ||
    fullText.includes('chlorophyl') ||
    fullText.includes('sève') ||
    fullText.includes('plante') ||
    (fullText.includes('co2') && fullText.includes('lumière'))
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_photosynthese');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 4. Microscope / Observation optique
  if (
    fullText.includes('microscope') ||
    fullText.includes('oculaire') ||
    fullText.includes('objectif') ||
    fullText.includes('grossissement')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_optique_microscope');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 5. Atome / Électrons / Modèle de Bohr / Molécules
  if (
    fullText.includes('atome') ||
    fullText.includes('électron') ||
    fullText.includes('proton') ||
    fullText.includes('neutron') ||
    fullText.includes('noyau atomique') ||
    fullText.includes('cortège')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_modele_atome');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 6. SVT / Biologie / Cellule
  if (
    fullText.includes('cellule') ||
    fullText.includes('membrane') ||
    fullText.includes('noyau') ||
    fullText.includes('cytoplasme') ||
    fullText.includes('organite')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_cellule_animale')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 7. Cycle de l'eau / Écologie / Géographie
  if (
    fullText.includes('cycle de l\'eau') ||
    fullText.includes('évaporation') ||
    fullText.includes('précipitation') ||
    fullText.includes('ruissellement') ||
    fullText.includes('bassin versant')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_cycle_eau')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 8. Théorème de Thalès / Proportions / Triangles semblables
  if (
    fullText.includes('thalès') ||
    fullText.includes('thales') ||
    fullText.includes('parallèle') && fullText.includes('triangle')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_theoreme_thales');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 9. Trigonométrie / Triangle rectangle / Pythagore
  if (
    fullText.includes('triangle') ||
    fullText.includes('pythagore') ||
    fullText.includes('hypoténuse') ||
    fullText.includes('rectangle en') ||
    fullText.includes('cosinus') ||
    fullText.includes('sinus') ||
    fullText.includes('tangente') ||
    fullText.includes('angle droit')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_triangle_rectangle')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 10. Géométrie dans l'espace / Volumes
  if (
    fullText.includes('pavé droit') ||
    fullText.includes('parallélépipède') ||
    fullText.includes('cube') ||
    fullText.includes('volume') ||
    fullText.includes('perspective')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_pave_droit')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 11. Repère / Graphique de fonction / Droite
  if (
    fullText.includes('repère') ||
    fullText.includes('ordonnée') ||
    fullText.includes('abscisse') ||
    fullText.includes('fonction') ||
    fullText.includes('droite') ||
    fullText.includes('affine') ||
    fullText.includes('linéaire') ||
    fullText.includes('coefficient directeur')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_repere_fonction')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // 12. Graphique de données / Statistiques / Expériences
  if (
    fullText.includes('histogramme') ||
    fullText.includes('diagramme') ||
    fullText.includes('pourcentage') ||
    fullText.includes('effectif') ||
    fullText.includes('statistique') ||
    fullText.includes('comparatif') ||
    fullText.includes('résultats expérimentaux') ||
    fullText.includes('données expérimentales')
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'data_comparatif_barres')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  return null;
}

