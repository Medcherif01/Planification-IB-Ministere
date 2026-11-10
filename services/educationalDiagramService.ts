/**
 * educationalDiagramService.ts
 * 
 * Fournit des schémas vectoriels éducatifs de haute qualité (SVG vectoriels ultra-nets),
 * des figures géométriques cotées, des diagrammes scientifiques à légender ([A], [B], [C] ou [1], [2], [3])
 * et des graphiques de données pour enrichir les évaluations en ligne et imprimées.
 */

import { findMatchingArtwork, generateDynamicMuseumArtCard } from './artworkService';

export interface EducationalDiagram {
  id: string;
  title: string;
  subjectCategory: 'math' | 'sciences' | 'geography' | 'data' | 'arts';
  caption: string;
  svgDataUri: string;
  description: string;
}

/**
 * Nettoie scrupuleusement toute balise HTML (<p>, <strong>, etc.) ainsi que les symboles
 * de formatage Markdown (**gras**, *italique*, __souligné__, ### titres, `code`)
 * pour garantir qu'aucun code source ni symbole brut n'apparaît dans les titres, options ou copies.
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
      .replace(/<\/t[dh]>/gi, '  ')
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

  // Nettoyage de sécurité renforcé : supprime tout reste textuel de balises HTML ET les symboles Markdown (**gras**, *italique*, ###)
  result = result
    .replace(/<\/?(?:p|strong|b|em|i|u|span|div|table|tr|td|th|tbody|thead|ul|ol|li|h[1-6]|font|a|section|article)[^>]*>/gi, '')
    .replace(/<[a-zA-Z][^>]*>/g, '')
    .replace(/<\/[a-zA-Z]+>/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
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

// ── 5. GÉNÉRATEURS DYNAMIQUES SUR-MESURE & LOGIQUE DE COMPATIBILITÉ AVANCÉE ────

/**
 * Génère dynamiquement une courbe mathématique (droite affine ou quadratique)
 * dans un repère cartésien avec axes gradués et points remarquables.
 */
export function generateDynamicFunctionCurve(options: {
  a?: number;
  b?: number;
  equationStr?: string;
  points?: Array<{ name: string; x: number; y: number }>;
  caption?: string;
}): { imageUrl: string; imageCaption: string } {
  const a = options.a !== undefined ? options.a : 1;
  const b = options.b !== undefined ? options.b : 0;
  const eqStr = options.equationStr || (b >= 0 ? `y = ${a}x + ${b}` : `y = ${a}x - ${Math.abs(b)}`);
  const caption = options.caption || `Repère orthonormé (O, I, J) et courbe représentative (${eqStr})`;

  // Coordonnées du repère : centre O à (230, 150)
  // Échelle : 1 unité = 30px
  const ox = 230;
  const oy = 150;
  const scale = 30;

  // Calculer 2 points pour tracer la droite dans la zone x in [-5, 5]
  const x1 = -4.5;
  const y1 = a * x1 + b;
  const x2 = 4.5;
  const y2 = a * x2 + b;

  const svgX1 = ox + x1 * scale;
  const svgY1 = oy - y1 * scale;
  const svgX2 = ox + x2 * scale;
  const svgY2 = oy - y2 * scale;

  // Points remarquables
  const pts = options.points || [
    { name: 'A', x: 0, y: b },
    { name: 'B', x: 2, y: a * 2 + b }
  ];

  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="24" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  
  <!-- Grille orthonormée -->
  <defs>
    <pattern id="dyn_grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="35" y="38" width="390" height="230" fill="url(#dyn_grid)"/>
  
  <!-- Axe des abscisses (Ox) -->
  <line x1="35" y1="${oy}" x2="425" y2="${oy}" stroke="#334155" stroke-width="2"/>
  <polygon points="425,${oy} 415,${oy - 4} 415,${oy + 4}" fill="#334155"/>
  <text x="420" y="${oy + 18}" font-size="12" font-weight="bold" fill="#334155">x</text>
  
  <!-- Axe des ordonnées (Oy) -->
  <line x1="${ox}" y1="268" x2="${ox}" y2="38" stroke="#334155" stroke-width="2"/>
  <polygon points="${ox},38 ${ox - 4},48 ${ox + 4},48" fill="#334155"/>
  <text x="${ox - 14}" y="50" font-size="12" font-weight="bold" fill="#334155">y</text>
  
  <!-- Origine O -->
  <text x="${ox - 12}" y="${oy + 15}" font-size="12" font-weight="bold" fill="#334155">O</text>
  
  <!-- Graduations -3, -2, -1, 1, 2, 3 -->
  ${[-4, -3, -2, -1, 1, 2, 3, 4].map(v => {
    const gx = ox + v * scale;
    return `<line x1="${gx}" y1="${oy - 3}" x2="${gx}" y2="${oy + 3}" stroke="#64748b" stroke-width="1.5"/>
    <text x="${gx}" y="${oy + 14}" font-size="10" fill="#64748b" text-anchor="middle">${v}</text>`;
  }).join('')}
  
  ${[-3, -2, -1, 1, 2, 3].map(v => {
    const gy = oy - v * scale;
    return `<line x1="${ox - 3}" y1="${gy}" x2="${ox + 3}" y2="${gy}" stroke="#64748b" stroke-width="1.5"/>
    <text x="${ox - 10}" y="${gy + 4}" font-size="10" fill="#64748b" text-anchor="end">${v}</text>`;
  }).join('')}
  
  <!-- Droite représentative -->
  <line x1="${svgX1}" y1="${svgY1}" x2="${svgX2}" y2="${svgY2}" stroke="#7c3aed" stroke-width="3"/>
  <rect x="260" y="44" width="160" height="22" rx="6" fill="#f5f3ff" stroke="#c4b5fd"/>
  <text x="340" y="59" font-size="11" font-weight="bold" fill="#6d28d9" text-anchor="middle">Courbe (${eqStr})</text>
  
  <!-- Points marqués -->
  ${pts.map(pt => {
    const px = ox + pt.x * scale;
    const py = oy - pt.y * scale;
    if (px < 40 || px > 420 || py < 40 || py > 260) return '';
    return `
    <line x1="${px}" y1="${oy}" x2="${px}" y2="${py}" stroke="#ef4444" stroke-width="1" stroke-dasharray="3,3"/>
    <line x1="${ox}" y1="${py}" x2="${px}" y2="${py}" stroke="#ef4444" stroke-width="1" stroke-dasharray="3,3"/>
    <circle cx="${px}" cy="${py}" r="4.5" fill="#ef4444"/>
    <text x="${px + 8}" y="${py - 6}" font-size="11" font-weight="bold" fill="#dc2626">${pt.name}(${pt.x}, ${pt.y})</text>
    `;
  }).join('')}
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Génère dynamiquement un triangle rectangle conforme aux sommets et aux cotes de l'exercice.
 */
export function generateDynamicRightTriangle(options: {
  points: [string, string, string]; // ex: ['A', 'B', 'C']
  rightAngleAt: string;             // ex: 'B'
  hypotenuseName?: string;          // ex: 'AC'
  side1Label?: string;              // ex: 'AB = 6 cm'
  side2Label?: string;              // ex: 'BC = 8 cm'
  hypotenuseLabel?: string;         // ex: 'AC = ?'
  caption?: string;
}): { imageUrl: string; imageCaption: string } {
  const [p1, p2, p3] = options.points;
  const right = options.rightAngleAt;
  
  // Placer le sommet à l'angle droit en bas à gauche (70, 220)
  const rightCorner = right;
  const otherPoints = [p1, p2, p3].filter(p => p !== rightCorner);
  const topPoint = otherPoints[0] || 'A';
  const rightPoint = otherPoints[1] || 'C';

  const s1 = options.side1Label || `${topPoint}${rightCorner}`;
  const s2 = options.side2Label || `${rightCorner}${rightPoint}`;
  const sHyp = options.hypotenuseLabel || `${topPoint}${rightPoint}`;
  const caption = options.caption || `Figure : Triangle ${p1}${p2}${p3} rectangle en ${rightCorner}`;

  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="26" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  
  <!-- Triangle -->
  <polygon points="80,220 370,220 80,75" fill="#f8fafc" stroke="#334155" stroke-width="3"/>
  
  <!-- Angle droit en (80, 220) -->
  <path d="M 80,195 L 105,195 L 105,220" fill="none" stroke="#dc2626" stroke-width="2.5"/>
  <circle cx="92" cy="207" r="2.5" fill="#dc2626"/>
  
  <!-- Sommet Haut -->
  <circle cx="80" cy="75" r="5" fill="#4f46e5"/>
  <text x="60" y="70" font-size="16" font-weight="900" fill="#4f46e5">${topPoint}</text>
  
  <!-- Sommet Angle Droit -->
  <circle cx="80" cy="220" r="5" fill="#dc2626"/>
  <text x="58" y="240" font-size="16" font-weight="900" fill="#dc2626">${rightCorner}</text>
  
  <!-- Sommet Droit -->
  <circle cx="370" cy="220" r="5" fill="#4f46e5"/>
  <text x="385" y="235" font-size="16" font-weight="900" fill="#4f46e5">${rightPoint}</text>
  
  <!-- Cotes -->
  <text x="55" y="150" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="end">${s1}</text>
  <text x="225" y="245" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${s2}</text>
  <text x="245" y="135" font-size="13" font-weight="bold" fill="#6d28d9" text-anchor="start">Hypoténuse ${sHyp}</text>
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Génère dynamiquement un solide géométrique de révolution ou polyédrique adapté (Cylindre, Cône, Cube, Pavé).
 */
export function generateDynamicSolid(type: 'cylindre' | 'cone' | 'cube' | 'pave', options?: {
  labels?: Record<string, string>;
  caption?: string;
}): { imageUrl: string; imageCaption: string } {
  if (type === 'cylindre') {
    const caption = options?.caption || 'Figure : Cylindre de révolution (Rayon R, Hauteur h)';
    const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="26" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  
  <!-- Axe de révolution -->
  <line x1="230" y1="50" x2="230" y2="240" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4"/>
  
  <!-- Corps du cylindre -->
  <line x1="150" y1="80" x2="150" y2="210" stroke="#1e293b" stroke-width="2.5"/>
  <line x1="310" y1="80" x2="310" y2="210" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Base inférieure : demi-ellipse avant pleine, demi-ellipse arrière en pointillés -->
  <path d="M 150 210 A 80 25 0 0 0 310 210" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5"/>
  <path d="M 150 210 A 80 25 0 0 1 310 210" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>
  
  <!-- Base supérieure -->
  <ellipse cx="230" cy="80" rx="80" ry="25" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Rayon R -->
  <line x1="230" y1="80" x2="310" y2="80" stroke="#ef4444" stroke-width="2"/>
  <circle cx="230" cy="80" r="3" fill="#ef4444"/>
  <text x="270" y="74" font-size="12" font-weight="bold" fill="#ef4444">Rayon R</text>
  
  <!-- Hauteur h -->
  <line x1="120" y1="80" x2="120" y2="210" stroke="#7c3aed" stroke-width="2"/>
  <polyline points="115,85 120,80 125,85" stroke="#7c3aed" fill="none" stroke-width="2"/>
  <polyline points="115,205 120,210 125,205" stroke="#7c3aed" fill="none" stroke-width="2"/>
  <text x="105" y="150" font-size="12" font-weight="bold" fill="#7c3aed" text-anchor="end">Hauteur h</text>
</svg>
`.trim();
    return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
  }

  if (type === 'cone') {
    const caption = options?.caption || 'Figure : Cône de révolution (Sommet S, Rayon R, Hauteur h)';
    const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="26" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  
  <!-- Génératrices -->
  <line x1="230" y1="60" x2="140" y2="215" stroke="#1e293b" stroke-width="2.5"/>
  <line x1="230" y1="60" x2="320" y2="215" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Hauteur SO -->
  <line x1="230" y1="60" x2="230" y2="215" stroke="#7c3aed" stroke-width="2" stroke-dasharray="4,4"/>
  <circle cx="230" cy="60" r="4" fill="#4f46e5"/>
  <text x="230" y="50" font-size="14" font-weight="900" fill="#4f46e5" text-anchor="middle">S</text>
  
  <!-- Base circulaire -->
  <path d="M 140 215 A 90 26 0 0 0 320 215" fill="#f8fafc" stroke="#1e293b" stroke-width="2.5"/>
  <path d="M 140 215 A 90 26 0 0 1 320 215" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>
  
  <!-- Centre O et Rayon R -->
  <circle cx="230" cy="215" r="3.5" fill="#ef4444"/>
  <text x="220" y="235" font-size="13" font-weight="bold" fill="#ef4444">O</text>
  <line x1="230" y1="215" x2="320" y2="215" stroke="#ef4444" stroke-width="2"/>
  <text x="275" y="210" font-size="12" font-weight="bold" fill="#ef4444">R</text>
  <text x="215" y="145" font-size="12" font-weight="bold" fill="#7c3aed" text-anchor="end">h</text>
</svg>
`.trim();
    return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
  }

  if (type === 'cube') {
    const caption = options?.caption || 'Figure : Cube en perspective cavalière (Arête a)';
    const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 280" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="26" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  
  <!-- Arêtes cachées -->
  <line x1="130" y1="200" x2="200" y2="135" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>
  <line x1="200" y1="135" x2="330" y2="135" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>
  <line x1="200" y1="135" x2="200" y2="65" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>
  
  <!-- Face avant carrée -->
  <polygon points="130,200 260,200 260,130 130,130" fill="#f8fafc" stroke="#1e293b" stroke-width="2.5"/>
  <!-- Face du dessus -->
  <polygon points="130,130 260,130 330,65 200,65" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5"/>
  <!-- Face latérale droite -->
  <polygon points="260,200 330,135 330,65 260,130" fill="#e2e8f0" stroke="#1e293b" stroke-width="2.5"/>
  
  <!-- Cotes -->
  <text x="195" y="222" font-size="13" font-weight="bold" fill="#dc2626" text-anchor="middle">Arête c</text>
  <text x="310" y="175" font-size="12" font-weight="bold" fill="#dc2626">c</text>
  <text x="110" y="170" font-size="12" font-weight="bold" fill="#dc2626">c</text>
</svg>
`.trim();
    return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
  }

  // Pavé droit standard
  const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_pave_droit')!;
  return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
}

/**
 * Génère dynamiquement une cellule végétale spécifique avec sa paroi pectocellulosique rectangulaire
 * et ses chloroplastes, pour éviter la confusion avec la cellule animale.
 */
export function generateDynamicPlantCell(): { imageUrl: string; imageCaption: string } {
  const caption = "Document : Schéma d'une cellule végétale observée au microscope (Paroi, Vacuole, Chloroplastes)";
  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="240" y="24" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  <text x="240" y="42" font-size="11" fill="#64748b" text-anchor="middle">Consigne : Associez chaque repère [1, 2, 3, 4] au bon constituant végétal</text>
  
  <!-- Paroi squelettique / pectocellulosique rigide (rectangulaire aux coins arrondis) -->
  <rect x="70" y="65" width="340" height="195" rx="20" fill="#ecfdf5" stroke="#059669" stroke-width="5"/>
  <!-- Membrane plasmique interne -->
  <rect x="78" y="73" width="324" height="179" rx="16" fill="#f0fdf4" stroke="#10b981" stroke-width="2"/>
  
  <!-- Grande vacuole centrale -->
  <rect x="130" y="100" width="180" height="130" rx="30" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <text x="220" y="165" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">Vacuole</text>
  
  <!-- Noyau avec nucléole rejeté en périphérie -->
  <circle cx="340" cy="130" r="28" fill="#f3e8ff" stroke="#7e22ce" stroke-width="2.5"/>
  <circle cx="340" cy="130" r="10" fill="#6b21a8"/>
  
  <!-- Chloroplastes (organites verts) -->
  <ellipse cx="105" cy="115" rx="14" ry="9" fill="#15803d" stroke="#166534" stroke-width="1.5"/>
  <ellipse cx="110" cy="190" rx="14" ry="9" fill="#15803d" stroke="#166534" stroke-width="1.5"/>
  <ellipse cx="345" cy="210" rx="14" ry="9" fill="#15803d" stroke="#166534" stroke-width="1.5"/>
  
  <!-- Repères [1, 2, 3, 4] -->
  <!-- [1] Paroi -->
  <line x1="50" y1="90" x2="70" y2="90" stroke="#047857" stroke-width="2"/>
  <circle cx="40" cy="90" r="12" fill="#059669"/>
  <text x="40" y="94" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">1</text>
  
  <!-- [2] Vacuole -->
  <line x1="220" y1="230" x2="220" y2="250" stroke="#0284c7" stroke-width="2"/>
  <circle cx="220" cy="262" r="12" fill="#0284c7"/>
  <text x="220" y="266" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">2</text>
  
  <!-- [3] Chloroplaste -->
  <line x1="105" y1="106" x2="105" y2="80" stroke="#15803d" stroke-width="2"/>
  <circle cx="105" cy="68" r="12" fill="#15803d"/>
  <text x="105" y="72" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">3</text>
  
  <!-- [4] Noyau -->
  <line x1="368" y1="130" x2="430" y2="130" stroke="#7e22ce" stroke-width="2"/>
  <circle cx="442" cy="130" r="12" fill="#7e22ce"/>
  <text x="442" y="134" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">4</text>
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Génère dynamiquement une courbe parabolique / quadratique f(x) = ax² + bx + c
 * dans un repère orthonormé (O, I, J) avec sommet et points remarquables.
 */
export function generateDynamicQuadraticCurve(options: {
  a?: number;
  b?: number;
  c?: number;
  equationStr?: string;
  caption?: string;
}): { imageUrl: string; imageCaption: string } {
  const a = options.a !== undefined && options.a !== 0 ? options.a : 1;
  const b = options.b !== undefined ? options.b : 0;
  const c = options.c !== undefined ? options.c : -2;
  const eqStr = options.equationStr || `f(x) = ${a === 1 ? '' : a === -1 ? '-' : a}x² ${b > 0 ? `+ ${b}x` : b < 0 ? `- ${Math.abs(b)}x` : ''} ${c > 0 ? `+ ${c}` : c < 0 ? `- ${Math.abs(c)}` : ''}`.replace(/\s+/g, ' ').trim();
  const caption = options.caption || `Repère orthonormé (O, I, J) — Courbe représentative (${eqStr})`;

  const ox = 230;
  const oy = 165;
  const scale = 28;

  // Générer le chemin de la parabole pour x dans [-4, 4]
  const pathPoints: string[] = [];
  for (let x = -4; x <= 4; x += 0.2) {
    const y = a * x * x + b * x + c;
    const sx = ox + x * scale;
    const sy = oy - y * scale;
    if (sy >= 38 && sy <= 270 && sx >= 35 && sx <= 425) {
      pathPoints.push(`${pathPoints.length === 0 ? 'M' : 'L'} ${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
  }

  // Sommet S(-b/(2a), f(-b/(2a)))
  const vx = -b / (2 * a);
  const vy = a * vx * vx + b * vx + c;
  const svx = ox + vx * scale;
  const svy = oy - vy * scale;

  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="230" y="24" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  <defs>
    <pattern id="quad_grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="35" y="38" width="390" height="232" fill="url(#quad_grid)"/>
  <line x1="35" y1="${oy}" x2="425" y2="${oy}" stroke="#334155" stroke-width="2"/>
  <polygon points="425,${oy} 415,${oy - 4} 415,${oy + 4}" fill="#334155"/>
  <text x="418" y="${oy + 16}" font-size="12" font-weight="bold" fill="#334155">x</text>
  <line x1="${ox}" y1="270" x2="${ox}" y2="38" stroke="#334155" stroke-width="2"/>
  <polygon points="${ox},38 ${ox - 4},48 ${ox + 4},48" fill="#334155"/>
  <text x="${ox - 14}" y="50" font-size="12" font-weight="bold" fill="#334155">y</text>
  <text x="${ox - 12}" y="${oy + 14}" font-size="11" font-weight="bold" fill="#334155">O</text>
  ${[-4, -3, -2, -1, 1, 2, 3, 4].map(v => {
    const gx = ox + v * scale;
    return `<line x1="${gx}" y1="${oy - 3}" x2="${gx}" y2="${oy + 3}" stroke="#64748b" stroke-width="1.5"/>
    <text x="${gx}" y="${oy + 14}" font-size="10" fill="#64748b" text-anchor="middle">${v}</text>`;
  }).join('')}
  ${[-3, -2, -1, 1, 2, 3, 4].map(v => {
    const gy = oy - v * scale;
    if (gy < 42 || gy > 265) return '';
    return `<line x1="${ox - 3}" y1="${gy}" x2="${ox + 3}" y2="${gy}" stroke="#64748b" stroke-width="1.5"/>
    <text x="${ox - 8}" y="${gy + 4}" font-size="10" fill="#64748b" text-anchor="end">${v}</text>`;
  }).join('')}
  <path d="${pathPoints.join(' ')}" fill="none" stroke="#4f46e5" stroke-width="3" stroke-linecap="round"/>
  <rect x="250" y="44" width="168" height="22" rx="6" fill="#eef2ff" stroke="#a5b4fc"/>
  <text x="334" y="59" font-size="11" font-weight="bold" fill="#3730a3" text-anchor="middle">Courbe (C) : ${eqStr}</text>
  ${svy >= 42 && svy <= 265 ? `
    <circle cx="${svx.toFixed(1)}" cy="${svy.toFixed(1)}" r="4.5" fill="#dc2626"/>
    <text x="${(svx + 8).toFixed(1)}" y="${(svy + 14).toFixed(1)}" font-size="11" font-weight="bold" fill="#dc2626">S(${Number(vx.toFixed(1))}; ${Number(vy.toFixed(1))})</text>
  ` : ''}
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Génère dynamiquement des courbes pour Individus et Sociétés (IS), Économie, Géographie, Sciences ou Maths :
 * - Courbe d'Offre et de Demande (Équilibre du marché Prix / Quantité)
 * - Courbe d'évolution temporelle ou expérimentale (extraite des chiffres de l'exercice : PIB, Population, Température, CO2, Chômage, Vitesse, etc.)
 */
export function generateDynamicEconomicOrSocialCurve(
  exerciseTitle: string,
  exerciseContent: string,
  subject: string
): { imageUrl: string; imageCaption: string } {
  const cleanTitle = stripHtmlTags(exerciseTitle || '');
  const cleanContent = stripHtmlTags(exerciseContent || '');
  const fullText = `${cleanTitle} ${cleanContent}`.trim();
  const lower = fullText.toLowerCase();

  // CAS A : ÉCONOMIE / IS — COURBES D'OFFRE ET DE DEMANDE (ÉQUILIBRE DU MARCHÉ)
  if (
    (lower.includes('offre') && lower.includes('demande')) ||
    (lower.includes('supply') && lower.includes('demand')) ||
    lower.includes('équilibre du marché') ||
    lower.includes('equilibre du marche') ||
    lower.includes('prix d\'équilibre')
  ) {
    const isEn = /english|anglais|acquisition|supply/i.test(`${subject} ${fullText}`);
    const caption = isEn
      ? `Figure: Market Equilibrium — Supply (S) and Demand (D) Curves`
      : `Graphique : Courbes d'Offre (O) et de Demande (D) — Équilibre du marché`;

    const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="240" y="24" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  <defs>
    <pattern id="econ_grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect x="65" y="40" width="375" height="210" fill="url(#econ_grid)"/>
  <!-- Axe Prix (P) -->
  <line x1="65" y1="250" x2="65" y2="38" stroke="#1e293b" stroke-width="2.5"/>
  <polygon points="65,35 60,45 70,45" fill="#1e293b"/>
  <text x="58" y="34" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="end">${isEn ? 'Price (P)' : 'Prix (P)'}</text>
  <!-- Axe Quantité (Q) -->
  <line x1="65" y1="250" x2="445" y2="250" stroke="#1e293b" stroke-width="2.5"/>
  <polygon points="448,250 438,245 438,255" fill="#1e293b"/>
  <text x="442" y="270" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="end">${isEn ? 'Quantity (Q)' : 'Quantité (Q)'}</text>
  <!-- Courbe de Demande (D) décroissante -->
  <path d="M 95,65 Q 230,150 395,228" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round"/>
  <text x="400" y="225" font-size="12" font-weight="bold" fill="#1d4ed8">${isEn ? 'Demand (D)' : 'Demande (D)'}</text>
  <!-- Courbe d'Offre (O) croissante -->
  <path d="M 95,228 Q 230,155 395,65" fill="none" stroke="#059669" stroke-width="3.5" stroke-linecap="round"/>
  <text x="400" y="68" font-size="12" font-weight="bold" fill="#047857">${isEn ? 'Supply (S)' : 'Offre (O)'}</text>
  <!-- Point d'équilibre E(Q*, P*) à (242, 149) -->
  <line x1="65" y1="149" x2="242" y2="149" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>
  <line x1="242" y1="149" x2="242" y2="250" stroke="#dc2626" stroke-width="1.8" stroke-dasharray="5,4"/>
  <circle cx="242" cy="149" r="5.5" fill="#dc2626" stroke="#ffffff" stroke-width="1.5"/>
  <text x="252" y="143" font-size="12" font-weight="900" fill="#dc2626">${isEn ? 'E (Equilibrium)' : 'E (Équilibre)'}</text>
  <text x="56" y="153" font-size="11" font-weight="bold" fill="#dc2626" text-anchor="end">P*</text>
  <text x="242" y="266" font-size="11" font-weight="bold" fill="#dc2626" text-anchor="middle">Q*</text>
  <text x="55" y="255" font-size="11" font-weight="bold" fill="#475569">0</text>
</svg>
`.trim();
    return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
  }

  // CAS B : COURBE D'ÉVOLUTION DYNAMIQUE (IS, Économie, Géographie, Sciences, Maths)
  // Extraire les années éventuelles (ex: 1980, 1990, 2000, 2010, 2020)
  const yearsFound = Array.from(new Set((fullText.match(/\b(?:18|19|20)\d{2}\b/g) || []).map(Number)))
    .sort((a, b) => a - b)
    .slice(0, 6);

  // Extraire les valeurs numériques associées (hors années)
  const rawNums = (fullText.replace(/\b(?:18|19|20)\d{2}\b/g, ' ').match(/\b\d+(?:[.,]\d+)?\b/g) || [])
    .map(n => parseFloat(n.replace(',', '.')))
    .filter(n => !isNaN(n) && n >= 0 && n <= 10000);

  // Déterminer l'unité et l'intitulé de l'axe Y selon le thème de l'énoncé
  let yAxisLabel = 'Valeur';
  let xAxisLabel = yearsFound.length >= 2 ? 'Année' : 'Temps / Variable (x)';
  let unitSuffix = '';

  if (lower.includes('pib') || lower.includes('gdp') || lower.includes('croissance')) {
    yAxisLabel = 'PIB / Croissance';
    unitSuffix = lower.includes('%') ? '%' : ' Mds';
  } else if (lower.includes('population') || lower.includes('démograph') || lower.includes('habitant')) {
    yAxisLabel = 'Population';
    unitSuffix = lower.includes('million') ? ' M' : '';
  } else if (lower.includes('température') || lower.includes('temperature') || lower.includes('°c')) {
    yAxisLabel = 'Température (°C)';
    unitSuffix = '°C';
  } else if (lower.includes('co2') || lower.includes('émission') || lower.includes('carbone')) {
    yAxisLabel = 'Émissions CO₂';
    unitSuffix = ' Mt';
  } else if (lower.includes('chômage') || lower.includes('inflation') || lower.includes('taux') || lower.includes('%')) {
    yAxisLabel = 'Taux (%)';
    unitSuffix = '%';
  } else if (lower.includes('vitesse') || lower.includes('distance') || lower.includes('mouvement')) {
    yAxisLabel = lower.includes('vitesse') ? 'Vitesse (m/s)' : 'Distance (m)';
    xAxisLabel = 'Temps t (s)';
  } else if (lower.includes('coût') || lower.includes('cout') || lower.includes('recette') || lower.includes('bénéfice') || lower.includes('prix')) {
    yAxisLabel = 'Montant (€ / $)';
    xAxisLabel = 'Quantité produite (q)';
  }

  const xLabels = yearsFound.length >= 3
    ? yearsFound.map(String)
    : ['t₁', 't₂', 't₃', 't₄', 't₅'];

  let yValues: number[] = [];
  if (rawNums.length >= xLabels.length) {
    yValues = rawNums.slice(0, xLabels.length);
  } else if (lower.includes('diminu') || lower.includes('baiss') || lower.includes('décroiss')) {
    yValues = [82, 68, 54, 41, 28].slice(0, xLabels.length);
  } else if (lower.includes('fluctu') || lower.includes('crise') || lower.includes('pic')) {
    yValues = [35, 62, 85, 52, 74].slice(0, xLabels.length);
  } else {
    yValues = [24, 38, 55, 72, 88].slice(0, xLabels.length);
  }

  const minV = Math.min(...yValues);
  const maxV = Math.max(...yValues, minV + 10);
  const span = Math.max(maxV - minV, 10);

  const chartLeft = 75;
  const chartRight = 430;
  const chartTop = 58;
  const chartBottom = 235;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  const coords = xLabels.map((lbl, idx) => {
    const val = yValues[idx] ?? yValues[yValues.length - 1] ?? 50;
    const x = chartLeft + (idx / Math.max(1, xLabels.length - 1)) * chartWidth;
    const normY = (val - Math.max(0, minV - span * 0.15)) / (span * 1.3);
    const y = chartBottom - Math.max(0.08, Math.min(0.92, normY)) * chartHeight;
    return { lbl, val, x, y };
  });

  const polylinePts = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPts = `${chartLeft},${chartBottom} ${polylinePts} ${coords[coords.length - 1].x.toFixed(1)},${chartBottom}`;

  const cleanCaptionTitle = cleanTitle.replace(/^(?:Tâche|Task|Exercice|Question)\s*\d*\s*[:\-]?\s*/i, '').trim() || `Courbe d'évolution (${yAxisLabel})`;
  const caption = `Graphique : ${cleanCaptionTitle.slice(0, 75)}`;

  const svgXml = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 295" width="100%" height="100%" style="background:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
  <rect width="100%" height="100%" fill="#fafafa" rx="12" stroke="#cbd5e1" stroke-width="1.5"/>
  <text x="245" y="25" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">${caption}</text>
  <!-- Lignes de grille horizontales -->
  ${[0, 0.25, 0.5, 0.75, 1].map(r => {
    const gy = chartBottom - r * chartHeight;
    const gv = Math.round(Math.max(0, minV - span * 0.1) + r * (span * 1.2));
    return `
      <line x1="${chartLeft}" y1="${gy.toFixed(1)}" x2="${chartRight}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${chartLeft - 8}" y="${(gy + 4).toFixed(1)}" font-size="10" font-weight="600" fill="#64748b" text-anchor="end">${gv}${unitSuffix}</text>
    `;
  }).join('')}
  <!-- Aire sous la courbe -->
  <polygon points="${areaPts}" fill="#4f46e5" fill-opacity="0.08"/>
  <!-- Axes -->
  <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartLeft}" y2="40" stroke="#1e293b" stroke-width="2"/>
  <polygon points="${chartLeft},36 ${chartLeft - 4},44 ${chartLeft + 4},44" fill="#1e293b"/>
  <text x="${chartLeft + 6}" y="44" font-size="11" font-weight="bold" fill="#1e293b">${yAxisLabel}</text>
  <line x1="${chartLeft}" y1="${chartBottom}" x2="${chartRight + 15}" y2="${chartBottom}" stroke="#1e293b" stroke-width="2"/>
  <polygon points="${chartRight + 18},${chartBottom} ${chartRight + 10},${chartBottom - 4} ${chartRight + 10},${chartBottom + 4}" fill="#1e293b"/>
  <text x="${chartRight + 10}" y="${chartBottom + 32}" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="end">${xAxisLabel}</text>
  <!-- Courbe principale -->
  <polyline points="${polylinePts}" fill="none" stroke="#4f46e5" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Points et valeurs -->
  ${coords.map(c => `
    <line x1="${c.x.toFixed(1)}" y1="${c.y.toFixed(1)}" x2="${c.x.toFixed(1)}" y2="${chartBottom}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3,3"/>
    <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="5" fill="#4f46e5" stroke="#ffffff" stroke-width="1.5"/>
    <text x="${c.x.toFixed(1)}" y="${(c.y - 9).toFixed(1)}" font-size="10.5" font-weight="bold" fill="#312e81" text-anchor="middle">${c.val}${unitSuffix}</text>
    <text x="${c.x.toFixed(1)}" y="${chartBottom + 16}" font-size="11" font-weight="bold" fill="#334155" text-anchor="middle">${c.lbl}</text>
  `).join('')}
</svg>
`.trim();

  return { imageUrl: toSvgDataUri(svgXml), imageCaption: caption };
}

/**
 * Détecte intelligemment et rigoureusement si une tâche doit être accompagnée
 * d'une courbe, d'une figure géométrique, d'un diagramme, d'un schéma à légender ou d'une œuvre d'art,
 * et génère la représentation vectorielle exacte en rapport direct avec l'énoncé.
 */
export function detectAndAttachEducationalDiagram(
  subject: string,
  unitTitle: string,
  exerciseTitle: string,
  exerciseContent: string
): { imageUrl: string; imageCaption: string } | null {
  const content = stripHtmlTags(exerciseContent || '');
  const title = stripHtmlTags(exerciseTitle || '');
  const text = `${title} ${content}`.trim();
  const lower = text.toLowerCase();
  const subjLower = (subject || '').toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS 0 : OEUVRES D'ART EXPLICITES & ANALYSE PLASTIQUE EN ARTS
  // ═══════════════════════════════════════════════════════════════════════════
  const matchedArt = findMatchingArtwork(text);
  if (matchedArt) {
    return {
      imageUrl: matchedArt.svgDataUri || matchedArt.url,
      imageCaption: matchedArt.caption,
    };
  }

  const isArtSubject =
    subjLower.includes('art') ||
    subjLower.includes('plastique') ||
    subjLower.includes('visuel') ||
    subjLower.includes('musique');

  if (
    isArtSubject &&
    /\b(oeuvre|œuvre|tableau|peinture|sculpture|fresque|estampe|gravure|autoportrait|installation\s+artistique|artwork|painting)\b/i.test(text)
  ) {
    const artCard = generateDynamicMuseumArtCard({
      title: title.replace(/^(?:Tâche|Task|Question)\s*\d*\s*[:\-]\s*/i, '').trim() || "Analyse Visuelle et Plastique",
      artist: "Œuvre / Support artistique d'étude",
      periodOrYear: "Histoire des Arts — PEI",
      medium: "Analyse plastique et compositionnelle",
      caption: `Support d'analyse artistique : ${title}`,
    });
    return artCard;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS 1 : MATHÉMATIQUES — GÉOMÉTRIE (TRIANGLES, THALÈS, SOLIDES)
  // ═══════════════════════════════════════════════════════════════════════════

  // A. Triangle rectangle (Pythagore / Trigonométrie)
  if (lower.includes('triangle') && (lower.includes('rectangle') || lower.includes('hypoténuse') || lower.includes('pythagore') || lower.includes('cosinus') || lower.includes('sinus') || lower.includes('tangente'))) {
    const match = text.match(/\btriangle\s+([A-Za-z]{3})\s+rectangle\s+en\s+([A-Za-z])\b/i) ||
                  text.match(/\b([A-Za-z]{3})\s+est\s+un\s+triangle\s+rectangle\s+en\s+([A-Za-z])\b/i) ||
                  text.match(/(?<!trian)\b([A-Za-z]{3})\s+rectangle\s+en\s+([A-Za-z])\b/i);

    if (match && match[1].toLowerCase() !== 'gle') {
      const triName = match[1].toUpperCase();
      const rightAt = match[2].toUpperCase();
      const letters = triName.split('') as [string, string, string];

      let s1Label: string | undefined;
      let s2Label: string | undefined;
      let sHypLabel: string | undefined;

      const lenMatches = Array.from(text.matchAll(/([A-Z]{2})\s*=\s*(\d+(?:[\.,]\d+)?)\s*(?:cm|m|mm)?/g));
      for (const lm of lenMatches) {
        const seg = lm[1].toUpperCase();
        const val = `${lm[2]} cm`;
        if (seg.includes(rightAt)) {
          if (!s1Label) s1Label = `${seg} = ${val}`;
          else if (!s2Label) s2Label = `${seg} = ${val}`;
        } else {
          sHypLabel = `${seg} = ${val}`;
        }
      }

      return generateDynamicRightTriangle({
        points: letters.length === 3 ? letters : ['A', 'B', 'C'],
        rightAngleAt: rightAt,
        side1Label: s1Label,
        side2Label: s2Label,
        hypotenuseLabel: sHypLabel,
        caption: `Figure : Triangle ${triName} rectangle en ${rightAt}`,
      });
    }

    return generateDynamicRightTriangle({
      points: ['A', 'B', 'C'],
      rightAngleAt: 'B',
      caption: 'Figure : Triangle ABC rectangle en B',
    });
  }

  // B. Théorème de Thalès
  if (lower.includes('thalès') || lower.includes('thales') || (lower.includes('parallèle') && lower.includes('triangle') && (lower.includes('figure') || lower.includes('calculer')))) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_theoreme_thales')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // C. Solides géométriques dans l'espace
  if (lower.includes('cylindre de révolution') || (lower.includes('cylindre') && (lower.includes('figure') || lower.includes('rayon') || lower.includes('volume')))) {
    return generateDynamicSolid('cylindre');
  }
  if (lower.includes('cône de révolution') || ((lower.includes('cône') || lower.includes('cone')) && (lower.includes('figure') || lower.includes('sommet') || lower.includes('volume')))) {
    return generateDynamicSolid('cone');
  }
  if (lower.includes('cube') && (lower.includes('figure') || lower.includes('arête') || lower.includes('perspective'))) {
    return generateDynamicSolid('cube');
  }
  if (lower.includes('pavé droit') || lower.includes('parallélépipède') || lower.includes('perspective cavalière')) {
    return generateDynamicSolid('pave');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS 2 : COURBES MATHÉMATIQUES (FONCTIONS, PARABOLES, DROITES, REPÈRE)
  // ═══════════════════════════════════════════════════════════════════════════
  const isMathCurve =
    lower.includes('repère') ||
    lower.includes('repere') ||
    lower.includes('abscisse') ||
    lower.includes('ordonnée') ||
    lower.includes('coefficient directeur') ||
    lower.includes('parabole') ||
    lower.includes('lecture graphique') ||
    lower.includes('lire graphiquement') ||
    lower.includes('déterminer graphiquement') ||
    lower.includes('résoudre graphiquement') ||
    ((lower.includes('fonction') || lower.includes('f(x)') || lower.includes('g(x)')) &&
      (lower.includes('courbe') || lower.includes('graphique') || lower.includes('droite') || lower.includes('représentation')));

  if (isMathCurve) {
    // 1. Tester une fonction quadratique / parabole : ex: f(x) = x² - 3 ou y = 2x^2 + x - 1
    const quadMatch = text.match(/(?:f\(x\)|g\(x\)|y)\s*=\s*([+-]?\s*\d*(?:\.\d+)?)\s*x(?:\^2|²)\s*([+-]\s*\d*(?:\.\d+)?\s*x)?\s*([+-]\s*\d+(?:\.\d+)?)?/i);
    if (quadMatch || lower.includes('parabole') || lower.includes('second degré') || lower.includes('x²') || lower.includes('x^2')) {
      let a = 1;
      let b = 0;
      let c = -2;
      if (quadMatch) {
        const aRaw = (quadMatch[1] || '').replace(/\s+/g, '');
        a = aRaw === '' || aRaw === '+' ? 1 : aRaw === '-' ? -1 : parseFloat(aRaw) || 1;
        if (quadMatch[2]) {
          const bRaw = quadMatch[2].replace(/x|\s+/gi, '');
          b = bRaw === '' || bRaw === '+' ? 1 : bRaw === '-' ? -1 : parseFloat(bRaw) || 0;
        }
        if (quadMatch[3]) {
          c = parseFloat(quadMatch[3].replace(/\s+/g, '')) || 0;
        } else {
          c = 0;
        }
      }
      return generateDynamicQuadraticCurve({ a, b, c });
    }

    // 2. Tester une équation affine : ex: f(x) = 2x + 1 ou y = -x + 3
    const eqMatch = text.match(/(?:f\(x\)|g\(x\)|y)\s*=\s*([+-]?\s*\d*(?:\.\d+)?)\s*x\s*([+-]\s*\d+(?:\.\d+)?)?/i);
    if (eqMatch) {
      let aStr = (eqMatch[1] || '1').replace(/\s+/g, '');
      if (aStr === '' || aStr === '+') aStr = '1';
      if (aStr === '-') aStr = '-1';
      const a = parseFloat(aStr) || 1;

      let bStr = (eqMatch[2] || '+0').replace(/\s+/g, '');
      const b = parseFloat(bStr) || 0;

      return generateDynamicFunctionCurve({
        a,
        b,
        equationStr: `y = ${a !== 1 ? (a === -1 ? '-' : a) : ''}x ${b > 0 ? '+ ' + b : b < 0 ? '- ' + Math.abs(b) : ''}`.trim(),
      });
    }

    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'math_repere_fonction')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS 3 : SCIENCES — SCHÉMAS À LÉGENDER & PHYSIQUE-CHIMIE / SVT
  // ═══════════════════════════════════════════════════════════════════════════
  if (
    lower.includes('circuit électrique') ||
    (lower.includes('circuit') && (lower.includes('pile') || lower.includes('lampe') || lower.includes('générateur') || lower.includes('schéma') || lower.includes('dipôle')))
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_circuit_electrique')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  if (lower.includes('cellule') || lower.includes('organite') || lower.includes('microscope')) {
    if (lower.includes('végétal') || lower.includes('vegetal') || lower.includes('chloroplaste') || lower.includes('paroi')) {
      return generateDynamicPlantCell();
    }
    if (lower.includes('animal') || lower.includes('membrane') || lower.includes('cytoplasme') || lower.includes('noyau')) {
      const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_cellule_animale')!;
      return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
    }
    if (lower.includes('microscope') && (lower.includes('oculaire') || lower.includes('objectif') || lower.includes('schéma') || lower.includes('légend'))) {
      const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_optique_microscope');
      if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
    }
  }

  if (
    lower.includes('appareil respiratoire') ||
    ((lower.includes('poumon') || lower.includes('trachée') || lower.includes('bronche')) && (lower.includes('schéma') || lower.includes('légend') || lower.includes('organe')))
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_systeme_respiratoire');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  if (
    lower.includes('photosynthèse') ||
    lower.includes('photosynthese') ||
    (lower.includes('feuille') && lower.includes('chlorophylle') && lower.includes('schéma'))
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_photosynthese');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  if (
    lower.includes('modèle atomique') ||
    (lower.includes('atome') && (lower.includes('proton') || lower.includes('électron') || lower.includes('neutron')) && (lower.includes('schéma') || lower.includes('modèle') || lower.includes('légend')))
  ) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_modele_atome');
    if (diag) return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  if (lower.includes('cycle de l\'eau') || lower.includes('cycle de l eau')) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'sciences_cycle_eau')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAS 4 : COURBES EN INDIVIDUS & SOCIÉTÉS (IS), ÉCONOMIE, GÉOGRAPHIE, SCIENCES & MATHS
  // ═══════════════════════════════════════════════════════════════════════════
  const isHistogramOrBarChart =
    lower.includes('histogramme') ||
    lower.includes('diagramme en barres') ||
    lower.includes('diagramme circulaire');

  if (isHistogramOrBarChart) {
    const diag = EDUCATIONAL_DIAGRAMS.find(d => d.id === 'data_comparatif_barres')!;
    return { imageUrl: diag.svgDataUri, imageCaption: diag.caption };
  }

  const isEconomicOrContextualCurve =
    lower.includes('courbe') ||
    lower.includes('graphique') ||
    (lower.includes('offre') && lower.includes('demande')) ||
    lower.includes('équilibre du marché') ||
    lower.includes('diagramme ombrothermique') ||
    lower.includes('climatogramme');

  if (isEconomicOrContextualCurve) {
    return generateDynamicEconomicOrSocialCurve(title, content, subject);
  }

  // Aucun schéma, courbe ou figure requis : renvoyer null (zéro photo inutile)
  return null;
}

/**
 * Variable globale définissant le modèle IA pour générer automatiquement les supports visuels.
 */
export const AI_IMAGE_GENERATION_MODEL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_AI_IMAGE_MODEL) ||
  'gemini-nano-banana-2.1';

export type NanoBananaVisualStyle =
  | 'auto'
  | 'photo_realiste'
  | 'illustration_scientifique'
  | 'schema_annote'
  | 'document_historique_carte';

export type PedagogicalVisualCategory =
  | 'artwork'
  | 'labeled_diagram'
  | 'document_source'
  | 'chart_diagram'
  | 'geometry_curve'
  | null;

export const NANO_BANANA_VISUAL_STYLES: Array<{
  id: NanoBananaVisualStyle;
  labelFr: string;
  labelEn: string;
  badge: string;
  descFr: string;
}> = [
  {
    id: 'auto',
    labelFr: 'Auto (Uniquement Courbe, Figure, Schéma ou Œuvre d’Art)',
    labelEn: 'Auto (Only Curve, Figure, Diagram or Artwork)',
    badge: '📈 Courbe & Figure',
    descFr: 'Génère uniquement les courbes (Maths, IS, Économie, Sciences), figures géométriques, schémas à légender ou œuvres d’art requis par la question.',
  },
  {
    id: 'schema_annote',
    labelFr: 'Courbe / Figure géométrique / Schéma à légender',
    labelEn: 'Curve / Geometric Figure / Labeled Diagram',
    badge: '📐 Courbe & Schéma',
    descFr: 'Courbe mathématique ou économique, figure géométrique cotée ou schéma scientifique à légender.',
  },
  {
    id: 'document_historique_carte',
    labelFr: 'Œuvre d’art (Tableau, Peinture, Sculpture)',
    labelEn: 'Artwork (Painting, Sculpture, Visual Art)',
    badge: '🎨 Œuvre d’Art',
    descFr: 'Œuvre d’art faisant l’objet d’une analyse plastique ou iconographique dans l’exercice.',
  },
  {
    id: 'illustration_scientifique',
    labelFr: 'Graphique statistique / Histogramme / Diagramme',
    labelEn: 'Statistical Graph / Histogram / Chart',
    badge: '📊 Graphique',
    descFr: 'Graphique d’évolution, courbes d’offre et demande ou histogramme de données.',
  },
  {
    id: 'photo_realiste',
    labelFr: 'Document photographique spécifique',
    labelEn: 'Specific Documentary Photograph',
    badge: '📸 Photo Spécifique',
    descFr: 'Uniquement sur demande manuelle explicite de l’enseignant pour une question précise.',
  },
];

/**
 * Classifie avec une Rigueur Absolue si un exercice nécessite obligatoirement une COURBE
 * (en Maths, IS, Économie, Sciences...), une FIGURE GÉOMÉTRIQUE, un DIAGRAMME/GRAPHIQUE,
 * un SCHÉMA À LÉGENDER ou une ŒUVRE D'ART.
 *
 * IMPORTANT : Ne JAMAIS inclure `imageCaption` dans l'analyse automatique afin qu'une ancienne
 * légende générée ne maintienne pas artificiellement une photo décorative inutile.
 * Renvoie `null` pour tout exercice qui ne nécessite pas de courbe, figure, schéma ou œuvre d'art.
 */
export function classifyPedagogicalVisualRequirement(
  subject: string,
  exerciseTitle: string,
  exerciseContent: string,
  _imageCaption?: string
): PedagogicalVisualCategory {
  const cleanTitle = stripHtmlTags(exerciseTitle || '');
  const cleanContent = stripHtmlTags(exerciseContent || '');
  const fullText = `${cleanTitle} ${cleanContent}`.trim();
  const subjLower = (subject || '').toLowerCase();

  if (!fullText) return null;

  // 1. ŒUVRE D'ART EXPLICITE (Arts visuels, tableau, peinture, sculpture)
  if (findMatchingArtwork(fullText)) {
    return 'artwork';
  }
  const isArtSubject =
    subjLower.includes('art') ||
    subjLower.includes('plastique') ||
    subjLower.includes('visuel') ||
    subjLower.includes('musique');
  const artworkPatterns = [
    /\b(?:oeuvre|œuvre)\s+d['’]art\b/i,
    /\banalyse\s+(?:de\s+l['’])?(?:oeuvre|œuvre|tableau|peinture|sculpture)\b/i,
    /\b(?:observez|observer|étudiez|etudiez|décrivez|decrivez|analysez)\s+(?:ce|le|la|l['’]|cette)\s*(?:tableau|peinture|sculpture|oeuvre|œuvre|fresque|estampe|gravure|autoportrait)\b/i,
    /\b(?:tableau|peinture|sculpture|fresque|estampe|gravure)\s+(?:ci-dessous|ci-contre|suivant|représenté)\b/i,
  ];
  if (
    artworkPatterns.some(rx => rx.test(fullText)) ||
    (isArtSubject && /\b(oeuvre|œuvre|tableau|peinture|sculpture|fresque|estampe|composition\s+plastique|artwork|painting)\b/i.test(fullText))
  ) {
    return 'artwork';
  }

  // 2. COURBES (Maths, IS, Économie, Géographie, Sciences) & FIGURES GÉOMÉTRIQUES
  const curveAndGeometryPatterns = [
    /\bcourbes?\b/i,
    /\b(?:représentation\s+graphique|lecture\s+graphique|lire\s+graphiquement|déterminer\s+graphiquement|résoudre\s+graphiquement|tracer\s+la\s+courbe|allure\s+de\s+la\s+courbe)\b/i,
    /\brepère\s+(?:orthonormé|orthogonal|cartésien|\(o\s*,)\b/i,
    /\b(?:axe\s+des\s+abscisses|axe\s+des\s+ordonnées|parabole|coefficient\s+directeur)\b/i,
    /\b(?:offre\s+et\s+(?:de\s+)?demande|courbe\s+d['’]offre|courbe\s+de\s+demande|équilibre\s+du\s+marché|supply\s+and\s+demand)\b/i,
    /\bfigure\s+(?:ci-dessous|ci-contre|suivante|\d+)\b/i,
    /\b(?:sur\s+la\s+figure|d['’]après\s+la\s+figure|observer\s+la\s+figure)\b/i,
    /\btriangle\s+[A-Z]{3}\s+rectangle\s+en\s+[A-Z]\b/,
    /\b[A-Z]{3}\s+est\s+un\s+triangle\s+rectangle\s+en\s+[A-Z]\b/,
    /\b(?:théorème\s+de\s+thalès|theoreme\s+de\s+thales|configuration\s+de\s+thalès|perspective\s+cavalière|cylindre\s+de\s+révolution|cône\s+de\s+révolution|pavé\s+droit)\b/i,
    /\b(?:graph\s+of\s+the\s+function|coordinate\s+plane|right\s+triangle\s+[A-Z]{3}|curve\s+below)\b/i,
  ];
  if (curveAndGeometryPatterns.some(rx => rx.test(fullText))) {
    return 'geometry_curve';
  }

  // 3. GRAPHIQUES & DIAGRAMMES DE DONNÉES (Maths, IS, Économie, Sciences)
  const chartDiagramPatterns = [
    /\b(?:diagramme\s+en\s+barres|diagramme\s+circulaire|diagramme\s+semi-circulaire|diagramme\s+ombrothermique|histogramme|climatogramme|pyramide\s+des\s+âges|nuage\s+de\s+points)\b/i,
    /\b(?:graphique|diagramme)\s+(?:ci-dessous|ci-contre|suivant|\d+)\b/i,
    /\b(?:d['’]après\s+le\s+graphique|à\s+partir\s+du\s+graphique|observez\s+le\s+graphique|analyser\s+le\s+graphique|sur\s+le\s+graphique|observez\s+le\s+diagramme)\b/i,
    /\b(?:bar\s+chart|pie\s+chart|histogram|graph\s+below|chart\s+below)\b/i,
  ];
  if (chartDiagramPatterns.some(rx => rx.test(fullText))) {
    return 'chart_diagram';
  }

  // 4. SCHÉMAS À LÉGENDER / MONTAGES SCIENTIFIQUES
  const labeledDiagramPatterns = [
    /\b(?:légender|legender|légendez|legendez|annoter|annotez)\s+(?:le\s+schéma|la\s+figure|le\s+croquis|le\s+diagramme)\b/i,
    /\b(?:schéma|schema|croquis)\s+(?:à\s+légender|ci-dessous|ci-contre|suivant)\b/i,
    /\b(?:complétez|completez|identifiez|nommez)\s+(?:le\s+schéma|les\s+éléments\s+numérotés|les\s+organes\s+numérotés|les\s+parties\s+numérotées|les\s+légendes|les\s+repères)\b/i,
    /\b(?:numérotés?\s+de\s+1\s+à|repérés?\s+par\s+les\s+(?:lettres|numéros|chiffres))\b/i,
    /\b(?:appareil\s+respiratoire|cellule\s+animale|cellule\s+végétale|microscope\s+optique|circuit\s+électrique|modèle\s+atomique|cycle\s+de\s+l['’]eau|photosynthèse)\b/i,
    /\[[1-6A-D]\]\s*(?:et|,|ou)\s*\[[1-6A-D]\]/,
  ];
  if (labeledDiagramPatterns.some(rx => rx.test(fullText))) {
    return 'labeled_diagram';
  }

  // Règle stricte : aucune photo décorative ou hors-sujet sur les autres exercices !
  return null;
}

/**
 * Détecte strictement si un exercice DOIT comporter un visuel pédagogique (Courbe, Figure,
 * Diagramme, Schéma à légender ou Œuvre d'art). Renvoie `false` pour tout autre exercice.
 */
export function shouldExerciseHaveVisual(
  subject: string,
  exerciseTitle: string,
  exerciseContent: string,
  _imageCaption?: string
): boolean {
  return classifyPedagogicalVisualRequirement(subject, exerciseTitle, exerciseContent) !== null;
}

/**
 * Nettoie et valide le visuel d'un exercice pour l'affichage ou la sauvegarde :
 * - Supprime automatiquement toute photo décorative / inutile si l'exercice ne nécessite ni courbe, ni figure, ni diagramme, ni schéma à légender, ni œuvre d'art.
 * - Si l'exercice nécessite une COURBE (en Maths, IS, Économie, Sciences), une FIGURE ou un SCHÉMA, garantit que l'image affichée est la vraie courbe / figure vectorielle correspondante et non une photo aléatoire sans rapport.
 */
export function sanitizeExerciseVisualsForDisplay(params: {
  subject: string;
  unitTitle?: string;
  exerciseTitle?: string;
  exerciseContent?: string;
  subQuestionsText?: string;
  imageUrl?: string;
  imageCaption?: string;
}): { imageUrl?: string; imageCaption?: string } {
  const {
    subject,
    unitTitle = '',
    exerciseTitle = '',
    exerciseContent = '',
    subQuestionsText = '',
    imageUrl = '',
    imageCaption = '',
  } = params;

  const trimmedUrl = (imageUrl || '').trim();

  // Si l'enseignant a collé un lien Google Drive explicite, toujours le respecter
  if (
    trimmedUrl.includes('drive.google.com') ||
    trimmedUrl.includes('googleusercontent.com') ||
    trimmedUrl.startsWith('/api/image-proxy')
  ) {
    return { imageUrl: trimmedUrl, imageCaption: stripHtmlTags(imageCaption) || undefined };
  }

  const combinedText = `${exerciseContent} ${subQuestionsText}`.trim();
  const category = classifyPedagogicalVisualRequirement(subject, exerciseTitle, combinedText);

  // RÈGLE 1 : Si l'exercice ne requiert ni courbe, ni figure, ni diagramme, ni légende, ni œuvre d'art -> ZÉRO PHOTO !
  if (!category) {
    return { imageUrl: undefined, imageCaption: undefined };
  }

  // RÈGLE 2 : Si l'exercice requiert une courbe, figure, graphique ou schéma, fournir la figure/courbe exacte !
  const exactDiagram = detectAndAttachEducationalDiagram(subject, unitTitle, exerciseTitle, combinedText);
  if (
    exactDiagram &&
    (category === 'geometry_curve' ||
      category === 'chart_diagram' ||
      category === 'labeled_diagram' ||
      category === 'artwork')
  ) {
    // Si aucune image n'est présente OU si l'image existante est une photo bitmap aléatoire (webp/png/jpg) au lieu d'une courbe/figure SVG
    const isBitmapPhoto =
      trimmedUrl.startsWith('data:image/webp') ||
      trimmedUrl.startsWith('data:image/jpeg') ||
      trimmedUrl.startsWith('data:image/jpg') ||
      trimmedUrl.startsWith('data:image/png');

    if (!trimmedUrl || isBitmapPhoto) {
      return {
        imageUrl: exactDiagram.imageUrl,
        imageCaption: stripHtmlTags(exactDiagram.imageCaption),
      };
    }
  }

  if (trimmedUrl) {
    return {
      imageUrl: trimmedUrl,
      imageCaption: stripHtmlTags(imageCaption) || exactDiagram?.imageCaption || undefined,
    };
  }

  if (exactDiagram) {
    return {
      imageUrl: exactDiagram.imageUrl,
      imageCaption: stripHtmlTags(exactDiagram.imageCaption),
    };
  }

  return { imageUrl: undefined, imageCaption: undefined };
}

/**
 * Extrait les éléments concrets d'un énoncé (nombres avec unités, objets, contexte)
 * pour enrichir le prompt et garantir que le support généré fait partie intégrante de l'exercice.
 */
function extractExerciseContextSummary(title: string, cleanContent: string, subject: string): {
  measurements: string[];
  keyTerms: string[];
  scenarioSnippet: string;
} {
  const full = `${title} ${cleanContent}`;
  const measureMatches = full.match(/\b\d+(?:[.,]\d+)?\s*(?:cm|mm|m|km|°C|°|%|kg|g|L|mL|s|min|h|V|A|W|Hz|N|J|Pa|mol|€|\$)\b|[A-Z]{1,3}\s*=\s*\d+(?:[.,]\d+)?\s*(?:cm|m|mm)?|(?:f\(x\)|y)\s*=\s*[^\s,;.<]+/gi) || [];
  const measurements = Array.from(new Set(measureMatches.map(m => m.trim()))).slice(0, 6);

  const cleanLines = cleanContent.replace(/\s+/g, ' ').trim();
  const scenarioSnippet = cleanLines.slice(0, 480);

  const rawWords = `${title} ${subject}`
    .replace(/^(?:Tâche|Task|Exercice|Question)\s*\d*\s*[:\-]?\s*/i, '')
    .split(/[\s,;:().?!]+/)
    .filter(w => w.length > 3 && !/^(dans|avec|pour|cette|sont|plus|moins|entre|quel|quelle|comment|expliquer|calculer|identifier|justifier)$/i.test(w));
  const keyTerms = Array.from(new Set(rawWords)).slice(0, 8);

  return { measurements, keyTerms, scenarioSnippet };
}

/**
 * Construit un prompt ultra-spécifique pour générer un support d'exercice fonctionnel
 * (Œuvre d'art, Schéma à légender, Diagramme, Figure/Courbe) — jamais décoratif.
 */
export function buildContextualNanoBananaPrompt(params: {
  subject: string;
  gradeLevel: string;
  unitTitle?: string;
  exerciseTitle?: string;
  cleanStatement: string;
  customPrompt?: string;
  visualStyle?: NanoBananaVisualStyle;
  isEn?: boolean;
}): string {
  const { subject, gradeLevel, unitTitle, exerciseTitle, cleanStatement, customPrompt, visualStyle = 'auto', isEn = false } = params;
  const { measurements, scenarioSnippet } = extractExerciseContextSummary(exerciseTitle || '', cleanStatement, subject);
  const detectedCategory = classifyPedagogicalVisualRequirement(subject, exerciseTitle || '', cleanStatement);

  let styleDirective = '';

  if (visualStyle === 'schema_annote' || (visualStyle === 'auto' && (detectedCategory === 'labeled_diagram' || detectedCategory === 'geometry_curve'))) {
    styleDirective = 'High-precision academic textbook graph, mathematical/economic curve, or scientific/geometric diagram on a clean white background, showing the exact curve, axes, coordinates, or geometric setup from the exercise.';
  } else if (visualStyle === 'document_historique_carte' || (visualStyle === 'auto' && detectedCategory === 'artwork')) {
    styleDirective = 'Museum-grade fine art work (painting, sculpture, print, or artistic composition) directly serving as the primary artwork analyzed by the student in the exercise.';
  } else {
    styleDirective = 'Clear academic chart, curve graph, or scientific diagram showing the exact variables, measurements, and comparative elements required to answer the exercise.';
  }

  const measureNote = measurements.length > 0
    ? `Key quantities/labels from the exercise to include accurately: ${measurements.join(', ')}.`
    : '';

  return [
    `Generate a functional, non-decorative 4:3 examination visual support for an IB MYP (${gradeLevel}) ${subject} exercise.`,
    `CRITICAL: This visual is an INTEGRAL PART OF THE EXERCISE (Curve, Geometric Figure, Chart, Labeled Diagram, or Artwork), NOT a decorative illustration.`,
    `- Pedagogical Visual Type: ${detectedCategory || visualStyle}`,
    `- Unit Theme: "${unitTitle || subject}"`,
    `- Exercise Title: "${exerciseTitle || ''}"`,
    `- Exercise Instructions & Content: "${scenarioSnippet}"`,
    customPrompt ? `- Teacher's Specific Document Request: "${customPrompt}"` : '',
    measureNote,
    `- Visual Specification: ${styleDirective}`,
    `- Ensure high academic clarity for students examining the document during an exam (${isEn ? 'English' : 'French'}).`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Génère le support visuel d'un exercice (Courbe en Maths/IS/Économie/Sciences, Figure géométrique cotée,
 * Schéma à légender [1,2,3,4], Graphique de données ou Œuvre d'art).
 */
export async function generateDiagramOrMapWithGeminiAI(params: {
  subject: string;
  gradeLevel?: string;
  grade?: string;
  unitTitle?: string;
  exerciseTitle?: string;
  exerciseContent?: string;
  customPrompt?: string;
  imageModel?: string;
  visualStyle?: NanoBananaVisualStyle;
}): Promise<{ imageUrl: string; imageCaption: string; modelUsed?: string }> {
  const effectiveGrade = params.gradeLevel || params.grade || 'PEI';
  const modelToUse = params.imageModel || AI_IMAGE_GENERATION_MODEL;
  const isEn = /english|anglais|acquisition/i.test(params.subject || '');
  const cleanStatement = stripHtmlTags(params.exerciseContent || '');
  const userDescription = stripHtmlTags(params.customPrompt || '');
  const visualStyle = params.visualStyle || 'auto';

  // 1. PRIORITÉ ABSOLUE AUX COURBES (MATHS, IS, ÉCONOMIE, SCIENCES), FIGURES GÉOMÉTRIQUES, GRAPHIQUES, SCHÉMAS & ŒUVRES :
  // Garantit qu'un exercice de courbe ou de figure reçoit toujours une VRAIE courbe/figure précise et jamais une photo aléatoire !
  if (visualStyle !== 'photo_realiste') {
    const exactMatch = detectAndAttachEducationalDiagram(
      params.subject || '',
      params.unitTitle || '',
      params.exerciseTitle || '',
      `${userDescription} ${cleanStatement}`
    );
    if (exactMatch) {
      return {
        imageUrl: exactMatch.imageUrl,
        imageCaption: exactMatch.imageCaption,
        modelUsed: 'pedagogical-precision-diagram',
      };
    }

    // Si le style choisi est courbe/schéma/graphique, générer une courbe contextuelle dédiée
    if (visualStyle === 'schema_annote' || visualStyle === 'illustration_scientifique') {
      const curve = generateDynamicEconomicOrSocialCurve(
        params.exerciseTitle || '',
        `${userDescription} ${cleanStatement}`,
        params.subject || ''
      );
      return {
        imageUrl: curve.imageUrl,
        imageCaption: curve.imageCaption,
        modelUsed: 'pedagogical-precision-curve',
      };
    }
  }

  // 2. GÉNÉRATION IA UNIQUEMENT SI NÉCESSAIRE (Œuvre d'art spécifique ou demande explicite de l'enseignant)
  const imagePrompt = buildContextualNanoBananaPrompt({
    subject: params.subject || 'IB MYP',
    gradeLevel: effectiveGrade,
    unitTitle: params.unitTitle,
    exerciseTitle: params.exerciseTitle,
    cleanStatement,
    customPrompt: userDescription,
    visualStyle,
    isEn,
  });

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: imagePrompt,
        generateImage: true,
        imagePrompt,
        imageModel: modelToUse,
        exerciseMeta: {
          subject: params.subject || 'IB MYP',
          grade: effectiveGrade,
          unitTitle: params.unitTitle || '',
          exerciseTitle: params.exerciseTitle || '',
          exerciseContent: cleanStatement,
          customPrompt: userDescription,
          visualStyle,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const defaultCaption =
        userDescription ||
        (params.exerciseTitle
          ? `${isEn ? 'Figure — ' : 'Figure — '}${stripHtmlTags(params.exerciseTitle).replace(/^(?:Tâche|Task|Exercice)\s*\d*\s*[:\-]\s*/i, '')}`
          : isEn
          ? 'Examination Visual Support'
          : 'Support visuel de l’exercice');

      if (data?.imageDataUri && String(data.imageDataUri).startsWith('data:image/')) {
        const cleanCaption = stripHtmlTags(String(data.caption || '')).trim();
        return {
          imageUrl: data.imageDataUri,
          imageCaption: cleanCaption.length > 5 && cleanCaption.length < 240 ? cleanCaption : defaultCaption,
          modelUsed: data.modelUsed || modelToUse,
        };
      }
    }
  } catch (err) {
    console.warn('Fallback pedagogical diagram after AI generation warning:', err);
  }

  return {
    imageUrl: '',
    imageCaption: '',
  };
}

/**
 * Génère par lot (batch) les visuels pédagogiques UNIQUEMENT pour les exercices qui en ont besoin
 * (Courbe en Maths/IS/Économie/Sciences, Figure géométrique, Diagramme, Schéma à légender ou Œuvre d'art)
 * et supprime systématiquement toutes les photos décoratives ou sans rapport des autres exercices.
 */
export async function generateNanoBananaPhotosForAssessments<T extends {
  criterion: string;
  exercises: Array<{
    title: string;
    content: string;
    imageUrl?: string;
    imageCaption?: string;
    subQuestions?: Array<{ content?: string }>;
    [key: string]: any;
  }>;
}>(params: {
  assessments: T[];
  subject: string;
  gradeLevel: string;
  unitTitle?: string;
  visualStyle?: NanoBananaVisualStyle;
  overwriteExisting?: boolean;
  onlyContextualExercises?: boolean;
  removeDecorativeVisuals?: boolean;
  onProgress?: (current: number, total: number, exerciseTitle: string) => void;
}): Promise<{ updatedAssessments: T[]; generatedCount: number; removedDecorativeCount?: number }> {
  const {
    assessments,
    subject,
    gradeLevel,
    unitTitle,
    visualStyle = 'auto',
    overwriteExisting = true,
    onlyContextualExercises = true,
    removeDecorativeVisuals = true,
    onProgress,
  } = params;

  const cloned: T[] = JSON.parse(JSON.stringify(assessments));
  const tasksToProcess: Array<{ critIdx: number; exIdx: number; title: string; content: string }> = [];
  let removedDecorativeCount = 0;

  cloned.forEach((crit, critIdx) => {
    (crit.exercises || []).forEach((ex, exIdx) => {
      const subText = Array.isArray(ex.subQuestions)
        ? ex.subQuestions.map(sq => sq.content || '').join(' ')
        : '';
      const fullContent = `${ex.content || ''} ${subText}`.trim();

      const requiresPedagogicalVisual = shouldExerciseHaveVisual(
        subject,
        ex.title,
        fullContent
      );

      // Si l'exercice ne nécessite ni courbe, ni figure, ni diagramme, ni schéma à légender, ni œuvre d'art :
      if (!requiresPedagogicalVisual && onlyContextualExercises) {
        if (removeDecorativeVisuals && (ex.imageUrl || ex.imageCaption)) {
          delete ex.imageUrl;
          delete ex.imageCaption;
          removedDecorativeCount++;
        }
        return;
      }

      const hasValidVisual = Boolean(ex.imageUrl && ex.imageUrl.startsWith('data:image/svg+xml'));
      if (!overwriteExisting && hasValidVisual) {
        return;
      }

      tasksToProcess.push({
        critIdx,
        exIdx,
        title: ex.title,
        content: fullContent,
      });
    });
  });

  let generatedCount = 0;
  for (let i = 0; i < tasksToProcess.length; i++) {
    const t = tasksToProcess[i];
    if (onProgress) {
      onProgress(i + 1, tasksToProcess.length, t.title || `Exercice ${i + 1}`);
    }
    try {
      const res = await generateDiagramOrMapWithGeminiAI({
        subject,
        gradeLevel,
        unitTitle,
        exerciseTitle: t.title,
        exerciseContent: t.content,
        visualStyle,
      });
      if (res && res.imageUrl) {
        cloned[t.critIdx].exercises[t.exIdx].imageUrl = res.imageUrl;
        cloned[t.critIdx].exercises[t.exIdx].imageCaption = res.imageCaption;
        generatedCount++;
      } else {
        delete cloned[t.critIdx].exercises[t.exIdx].imageUrl;
        delete cloned[t.critIdx].exercises[t.exIdx].imageCaption;
      }
    } catch (e) {
      console.warn(`Erreur génération support visuel pour "${t.title}":`, e);
    }
  }

  return { updatedAssessments: cloned, generatedCount, removedDecorativeCount };
}



