import React, { useRef } from 'react';
import { StudentBooklet } from '../types';
import {
  BOOKLET_SUBJECTS,
  IB_GRADE_DESCRIPTORS,
  ATL_DESCRIPTORS,
  DEFAULT_SCHOOL_INFO,
  getGlobalSchoolLogo,
  getGlobalIbLogo,
} from '../services/studentBookletService';
import { LOGO_ALKAWTAR_BASE64 } from '../services/logoBase64';
import { convertGoogleDriveUrl } from '../services/studentRosterService';
import { X, Printer, Download, Eye, Award } from 'lucide-react';

interface StudentBookletPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  booklets: StudentBooklet[]; // Un ou plusieurs livrets (si impression groupée)
  initialIndex?: number;
}

export const StudentBookletPrintModal: React.FC<StudentBookletPrintModalProps> = ({
  isOpen,
  onClose,
  booklets,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
  const printContainerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!isOpen || booklets.length === 0) return null;

  const currentBooklet = booklets[currentIndex] || booklets[0];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex flex-col justify-between overflow-hidden">
      {/* Top action toolbar (hidden on print) */}
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between border-b border-slate-700 shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Award size={20} />
          </div>
          <div>
            <h2 className="font-bold text-base text-white">
              Aperçu & Impression — Livret Scolaire PEI Officiel
            </h2>
            <p className="text-xs text-slate-400">
              {currentBooklet.studentName} ({currentBooklet.grade} • {currentBooklet.schoolYear} • {currentBooklet.term})
            </p>
          </div>
        </div>

        {/* Navigation entre élèves si plusieurs livrets */}
        {booklets.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-xs text-slate-300">Élève :</span>
            <select
              value={currentIndex}
              onChange={e => setCurrentIndex(Number(e.target.value))}
              className="bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-600 outline-none"
            >
              {booklets.map((b, idx) => (
                <option key={b.id || idx} value={idx}>
                  {idx + 1}. {b.studentName} ({b.studentNumber || b.grade})
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">
              ({currentIndex + 1} / {booklets.length})
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow transition"
          >
            <Printer size={16} />
            Imprimer / Exporter PDF
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Printable Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-800 flex justify-center print:p-0 print:bg-white print:overflow-visible">
        <div ref={printContainerRef} className="booklet-print-document max-w-[210mm] w-full text-slate-900">
          <SingleStudentBookletView booklet={currentBooklet} />
        </div>
      </div>

      {/* Print Stylesheet */}
      <style>{`
        @media print {
          body, html {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          .print\:hidden {
            display: none !important;
          }
          .booklet-print-document {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .booklet-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            height: 297mm !important;
            max-height: 297mm !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 14mm 16mm !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 0mm;
          }
        }

        .booklet-page {
          background: white;
          width: 210mm;
          min-height: 297mm;
          padding: 16mm 18mm;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          border-radius: 4px;
          position: relative;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .header-blue-card {
          background-color: #a3c4dc;
          color: white;
        }
        .tab-blue-label {
          background-color: #0d83be;
          color: white;
        }
        .table-blue-header {
          background-color: #a3c4dc;
          color: #0f3f63;
        }
        .table-border {
          border: 1px solid #7eaac9;
        }
        .table-border th, .table-border td {
          border: 1px solid #7eaac9;
        }
        .page-corner-decor {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 140px;
          height: 140px;
          pointer-events: none;
          background: linear-gradient(135deg, transparent 65%, #c5e0f1 65%, #9bc4e2 100%);
        }
      `}</style>
    </div>
  );
};

// ── Vue individuelle d'un livret complet (8 Pages A4) ────────────────────────
export const SingleStudentBookletView: React.FC<{ booklet: StudentBooklet }> = ({ booklet }) => {
  const gradeClean = booklet.grade?.toUpperCase().replace(/\s+/g, '') || 'PEI4';

  const globalSchoolLogo = getGlobalSchoolLogo();
  const globalIbLogo = getGlobalIbLogo();
  const schoolLogoUrlToUse = globalSchoolLogo || booklet.schoolLogoUrl;
  const ibLogoUrlToUse = globalIbLogo || booklet.ibLogoUrl;

  return (
    <div className="space-y-6 print:space-y-0">
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 1 : PAGE DE GARDE / COUVERTURE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div>
          {/* Header avec Logos et Titre */}
          <div className="flex items-center justify-between gap-4 mt-6">
            {/* Logos Al-Kawthar & IB World School */}
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-full border-2 border-blue-400 p-1 flex items-center justify-center bg-white shadow-sm overflow-hidden">
                <img
                  src={schoolLogoUrlToUse ? convertGoogleDriveUrl(schoolLogoUrlToUse) : "/logo-alkawtar.png"}
                  alt="Al-Kawthar"
                  className="w-full h-full object-contain"
                  onError={e => {
                    e.currentTarget.src = LOGO_ALKAWTAR_BASE64;
                  }}
                />
              </div>
              <div className="w-20 h-20 rounded-full border-2 border-blue-400 p-1 flex items-center justify-center bg-white shadow-sm overflow-hidden">
                {ibLogoUrlToUse ? (
                  <img
                    src={convertGoogleDriveUrl(ibLogoUrlToUse)}
                    alt="IB World School"
                    className="w-full h-full object-contain"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center w-full h-full flex flex-col items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full" style={{ maxHeight: '70px' }}>
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#0f3f63" strokeWidth="2.5" />
                      <circle cx="50" cy="50" r="41" fill="none" stroke="#7eaac9" strokeWidth="1" strokeDasharray="2,2" />
                      <text x="50" y="30" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#0f3f63" letterSpacing="0.8">
                        ÉCOLE DU MONDE DU
                      </text>
                      <text x="50" y="58" textAnchor="middle" fontFamily="serif" fontSize="30" fontWeight="bold" fill="#0d83be">
                        ib
                      </text>
                      <text x="50" y="73" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#0f3f63" letterSpacing="0.6">
                        WORLD SCHOOL
                      </text>
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Bannière Titre Bleu */}
            <div className="flex-1 max-w-sm rounded-none py-4 px-6 text-center header-blue-card shadow-sm">
              <h1 className="text-xl sm:text-2xl font-black tracking-wide uppercase text-white drop-shadow-xs">
                LIVRET SCOLAIRE {gradeClean}
              </h1>
              <p className="text-sm font-bold text-white/95 mt-1">{booklet.term || '1er trimestre'}</p>
            </div>
          </div>

          {/* Numéro de licence / Autorisation ministérielle */}
          <div className="flex justify-end mt-4">
            <div className="inline-flex flex-col items-end">
              <span className="text-[11px] text-blue-900 font-bold mb-1">رقم الترخيص</span>
              <div className="flex border border-blue-400 bg-white">
                {(booklet.licenseNumber || '٤٣٥١٤٤۰١۰٧')
                  .replace(/[\s\(\)0-9a-zA-Z]/g, '')
                  .split('')
                  .slice(0, 10)
                  .map((digit, i) => (
                    <div
                      key={i}
                      className="w-5 h-5 flex items-center justify-center text-xs font-bold text-blue-900 border-r border-blue-300 last:border-r-0"
                    >
                      {digit}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Année scolaire */}
          <div className="text-center my-6">
            <h2 className="text-lg font-bold text-slate-800 tracking-wide">
              Année scolaire : {booklet.schoolYear || '2025/2026'}
            </h2>
          </div>

          {/* ── Box Élève ── */}
          <div className="border-2 border-[#0d83be] flex my-6 rounded-none overflow-hidden bg-white">
            <div className="w-24 bg-[#0d83be] text-white font-bold flex items-center justify-center text-lg tracking-wider select-none shrink-0">
              <span className="text-center font-semibold">Élève</span>
            </div>
            <div className="flex-1 p-5 flex items-center justify-between gap-4">
              <div className="space-y-3 min-w-0">
                <p className="text-sm">
                  <span className="text-slate-500 font-medium">Nom et Prénom : </span>
                  <strong className="text-slate-900 font-bold text-base">{booklet.studentName}</strong>
                </p>
                <p className="text-sm">
                  <span className="text-slate-500 font-medium">Né(e) le : </span>
                  <strong className="text-slate-800 italic">{booklet.birthDate || '15/12/2012'}</strong>
                </p>
                {booklet.studentNumber && (
                  <p className="text-xs text-slate-500">
                    Matricule / Identifiant : <span className="font-mono font-bold text-slate-700">{booklet.studentNumber}</span>
                  </p>
                )}
              </div>
              <div className="w-28 h-36 rounded-lg border-2 border-[#7eaac9] bg-slate-50 overflow-hidden flex items-center justify-center shadow-xs shrink-0">
                {booklet.photoUrl ? (
                  <img
                    src={convertGoogleDriveUrl(booklet.photoUrl)}
                    alt={booklet.studentName}
                    className="w-full h-full object-cover"
                    onError={e => {
                      const match = booklet.photoUrl?.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|thumbnail\?id=)|lh3\.googleusercontent\.com\/d\/)([a-zA-Z0-9_-]{20,})/i);
                      if (match && match[1]) {
                        const fallbackUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
                        if (e.currentTarget.src !== fallbackUrl) {
                          e.currentTarget.src = fallbackUrl;
                          return;
                        }
                      }
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center p-2 text-slate-400">
                    <div className="w-12 h-12 mx-auto rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-lg mb-1">
                      {booklet.studentName?.charAt(0) || 'E'}
                    </div>
                    <span className="text-[10px] text-slate-400 block font-medium">Photo élève</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Box École ── */}
          <div className="border-2 border-[#0d83be] flex my-6 rounded-none overflow-hidden bg-white">
            <div className="w-24 bg-[#0d83be] text-white font-bold flex items-center justify-center text-lg tracking-wider select-none shrink-0">
              <span className="text-center font-semibold">École</span>
            </div>
            <div className="flex-1 p-5 space-y-2 text-sm text-slate-800">
              <p>
                <span className="text-slate-500 font-medium">Nom : </span>
                <strong className="text-slate-900 font-bold">{booklet.schoolName || DEFAULT_SCHOOL_INFO.name}</strong>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Adresse : </span>
                <span>{booklet.schoolAddress || DEFAULT_SCHOOL_INFO.address}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Tél : </span>
                <span className="font-mono">{booklet.schoolPhone || DEFAULT_SCHOOL_INFO.phone}</span>
              </p>
              <p>
                <span className="text-slate-500 font-medium">Site web : </span>
                <span className="text-blue-700 underline">{booklet.schoolWebsite || DEFAULT_SCHOOL_INFO.website}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Pied de page décoratif */}
        <div className="mt-auto pt-6 text-center text-xs text-slate-400 border-t border-slate-200">
          Les Écoles Internationales Al-Kawthar — Programme d'Éducation Intermédiaire (PEI)
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 2 : TABLEAU DES NIVEAUX IB & DESCRIPTEURS ATL
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div>
          {/* Tableau 1 : Niveaux IB & Descripteurs */}
          <div className="mb-6">
            <table className="w-full text-xs table-border border-collapse">
              <thead>
                <tr className="table-blue-header font-bold text-center">
                  <th className="p-2 border border-[#7eaac9] w-20">Niveaux IB</th>
                  <th className="p-2 border border-[#7eaac9] w-20">Niveaux</th>
                  <th className="p-2 border border-[#7eaac9] text-center">Descripteurs de niveaux</th>
                </tr>
              </thead>
              <tbody>
                {IB_GRADE_DESCRIPTORS.map(row => (
                  <tr key={row.grade} className="text-slate-800">
                    <td className="p-2.5 border border-[#7eaac9] text-center font-bold text-sm bg-slate-50/50">
                      {row.grade}
                    </td>
                    <td className="p-2.5 border border-[#7eaac9] text-center font-medium bg-slate-50/50">
                      {row.boundary}
                    </td>
                    <td className="p-2.5 border border-[#7eaac9] text-justify leading-relaxed">
                      {row.descriptor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tableau 2 : Les approches de l'apprentissage (ATL) */}
          <div className="mt-8">
            <table className="w-full text-xs table-border border-collapse">
              <thead>
                <tr className="table-blue-header font-bold">
                  <th colSpan={3} className="p-2 text-center border border-[#7eaac9] font-bold text-sm text-[#0f3f63]">
                    Les approches de l’apprentissage (ATL)
                  </th>
                </tr>
              </thead>
              <tbody>
                {ATL_DESCRIPTORS.map(atl => (
                  <tr key={atl.code} className="text-slate-800">
                    <td className="p-2 border border-[#7eaac9] text-center font-bold text-sm w-12 bg-slate-50">
                      {atl.code}
                    </td>
                    <td className="p-2 border border-[#7eaac9] font-semibold w-40 text-slate-800">
                      {atl.label}
                    </td>
                    <td className="p-2 border border-[#7eaac9] leading-relaxed text-slate-700">
                      {atl.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Numérotation de page & filigrane */}
        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">1</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 3 : MATRICE ATL GÉNÉRALE + MATIÈRE 1 (Français)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div>
          {/* Titre centré */}
          <div className="text-center my-4">
            <h2 className="text-base font-bold text-[#1a5b88] tracking-wide">
              Critères Initiaux (Compétences Approche de l'Apprentissage)
            </h2>
          </div>

          {/* Grand tableau des compétences ATL par matière */}
          <table className="w-full text-xs table-border border-collapse mb-8">
            <thead>
              <tr className="table-blue-header font-bold text-center">
                <th className="p-2 border border-[#7eaac9] text-left">Groupes de matières</th>
                <th className="p-2 border border-[#7eaac9]">Communication</th>
                <th className="p-2 border border-[#7eaac9]">Collaboration</th>
                <th className="p-2 border border-[#7eaac9]">Autogestion</th>
                <th className="p-2 border border-[#7eaac9]">Recherche</th>
                <th className="p-2 border border-[#7eaac9]">Réflexion</th>
              </tr>
            </thead>
            <tbody>
              {BOOKLET_SUBJECTS.map(sub => {
                const ratings = booklet.atlBySubject?.[sub] || {
                  communication: 'A',
                  collaboration: 'E',
                  autogestion: 'E',
                  recherche: 'A',
                  reflexion: 'A',
                };
                return (
                  <tr key={sub} className="text-slate-800 text-center">
                    <td className="p-2 border border-[#7eaac9] text-left font-medium text-slate-900">
                      {sub}
                    </td>
                    <td className="p-2 border border-[#7eaac9] font-bold">{ratings.communication || 'A'}</td>
                    <td className="p-2 border border-[#7eaac9] font-bold">{ratings.collaboration || 'A'}</td>
                    <td className="p-2 border border-[#7eaac9] font-bold">{ratings.autogestion || 'A'}</td>
                    <td className="p-2 border border-[#7eaac9] font-bold">{ratings.recherche || 'A'}</td>
                    <td className="p-2 border border-[#7eaac9] font-bold">{ratings.reflexion || 'A'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Matière 1 : Langue et littérature (Français) */}
          <SubjectEvaluationBlock
            subjectName="Langue et littérature (Français)"
            report={booklet.subjects?.['Langue et littérature (Français)']}
          />
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">2</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 4 : MATIÈRES 2 & 3 (Arabe & Anglais)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div className="space-y-6">
          <SubjectEvaluationBlock
            subjectName="Acquisition de langue (اللغة العربية)"
            report={booklet.subjects?.['Acquisition de langue (اللغة العربية)']}
            isRtl={true}
          />

          <SubjectEvaluationBlock
            subjectName="Acquisition de langues (Anglais)"
            report={booklet.subjects?.['Acquisition de langues (Anglais)']}
          />
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">3</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 5 : MATIÈRES 4 & 5 (Individus et Sociétés & Sciences)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div className="space-y-6">
          <SubjectEvaluationBlock
            subjectName="Individus et sociétés"
            report={booklet.subjects?.['Individus et sociétés']}
          />

          <SubjectEvaluationBlock
            subjectName="Sciences"
            report={booklet.subjects?.['Sciences']}
          />
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">4</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 6 : MATIÈRES 6 & 7 (Mathématiques & Art visuel)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div className="space-y-6">
          <SubjectEvaluationBlock
            subjectName="Mathématiques"
            report={booklet.subjects?.['Mathématiques']}
          />

          <SubjectEvaluationBlock
            subjectName="Art visuel"
            report={booklet.subjects?.['Art visuel']}
          />
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">5</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 7 : MATIÈRES 8 & 9 (EPS & Design)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div className="space-y-6">
          <SubjectEvaluationBlock
            subjectName="Éducation physique et sportive"
            report={booklet.subjects?.['Éducation physique et sportive']}
          />

          <SubjectEvaluationBlock
            subjectName="Design"
            report={booklet.subjects?.['Design']}
          />
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">6</span>
        </div>
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 8 : SIGNATURES ET COMMENTAIRES DE FIN D'ANNÉE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page flex flex-col justify-between">
        <div>
          <div className="mt-8">
            <table className="w-full table-border border-collapse">
              <thead>
                <tr className="bg-[#0d83be] text-white font-bold text-center">
                  <th colSpan={2} className="p-2.5 border border-[#0d83be] uppercase tracking-wider text-sm">
                    SIGNATURE ET COMMENTAIRE
                  </th>
                </tr>
                <tr className="table-blue-header font-bold text-center text-xs">
                  <th className="p-2 border border-[#7eaac9] w-1/2">Le Directeur</th>
                  <th className="p-2 border border-[#7eaac9] w-1/2">Les parents</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-6 border border-[#7eaac9] h-56 align-top text-xs text-slate-700">
                    <p className="italic text-slate-500 mb-2">Commentaires et visa de la direction :</p>
                    {booklet.directorComment && (
                      <p className="text-slate-800 leading-relaxed">{booklet.directorComment}</p>
                    )}
                    <div className="mt-20 pt-4 border-t border-dashed border-slate-300 text-right text-[11px] text-slate-400">
                      Cachet et signature de l'école
                    </div>
                  </td>
                  <td className="p-6 border border-[#7eaac9] h-56 align-top text-xs text-slate-700">
                    <p className="italic text-slate-500 mb-2">Observations des parents :</p>
                    {booklet.parentComment && (
                      <p className="text-slate-800 leading-relaxed">{booklet.parentComment}</p>
                    )}
                    <div className="mt-20 pt-4 border-t border-dashed border-slate-300 text-right text-[11px] text-slate-400">
                      Signature des parents
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-between items-end mt-auto pt-4 border-t border-slate-200">
          <span className="text-[10px] text-slate-400">{booklet.studentName} — Livret Scolaire</span>
          <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">7</span>
        </div>
        <div className="page-corner-decor" />
      </div>
    </div>
  );
};

// ── Sous-composant : Bloc d'évaluation d'une matière (table + observations) ────
const SubjectEvaluationBlock: React.FC<{
  subjectName: string;
  report?: any;
  isRtl?: boolean;
}> = ({ subjectName, report, isRtl = false }) => {
  const teacher = report?.teacherName || '';
  const criteria = report?.criteria || {};
  const cA = criteria.A || { name: 'Analyse', final: 7, t1: 7 };
  const cB = criteria.B || { name: 'Organisation', final: 7, t1: 7 };
  const cC = criteria.C || { name: 'Production', final: 6, t1: 6 };
  const cD = criteria.D || { name: 'Utilisation langue', final: 6, t1: 6 };

  const finalA = cA.final ?? cA.t1 ?? '-';
  const finalB = cB.final ?? cB.t1 ?? '-';
  const finalC = cC.final ?? cC.t1 ?? '-';
  const finalD = cD.final ?? cD.t1 ?? '-';

  const sumSeuil = (typeof finalA === 'number' ? finalA : 0) +
                   (typeof finalB === 'number' ? finalB : 0) +
                   (typeof finalC === 'number' ? finalC : 0) +
                   (typeof finalD === 'number' ? finalD : 0);

  const seuil = report?.seuil32 ?? (sumSeuil > 0 ? sumSeuil : 26);
  const noteFinale = report?.finalGrade ?? (seuil >= 28 ? 7 : seuil >= 24 ? 6 : seuil >= 19 ? 5 : 4);

  return (
    <div className="space-y-1">
      {/* Enseignant */}
      <div className={`text-xs font-semibold text-slate-800 ${isRtl ? 'text-right' : 'text-left'}`}>
        {isRtl ? (
          <span>{teacher ? `أ .${teacher} : (e)Enseignant` : 'Enseignant(e) : —'}</span>
        ) : (
          <span>Enseignant(e) : {teacher || '—'}</span>
        )}
      </div>

      {/* Tableau des notes */}
      <table className="w-full text-xs table-border border-collapse">
        <thead>
          <tr className="bg-[#6fa8dc] text-white font-bold text-center">
            <th colSpan={7} className="p-1.5 border border-[#7eaac9] text-center font-bold text-sm">
              {subjectName}
            </th>
          </tr>
          <tr className="table-blue-header text-center font-semibold">
            <th colSpan={2} className="p-1.5 border border-[#7eaac9] text-left">
              Critères
            </th>
            <th colSpan={2} className="p-1.5 border border-[#7eaac9]">
              Descripteurs de niveaux/8
              <div className="grid grid-cols-2 text-[10px] font-normal border-t border-[#7eaac9] mt-1 pt-0.5">
                <span>Trimestre 1</span>
                <span>Trimestre 2</span>
              </div>
            </th>
            <th className="p-1.5 border border-[#7eaac9] text-[11px] leading-tight w-20">
              Niveau final atteint /8
            </th>
            <th className="p-1.5 border border-[#7eaac9] text-[11px] leading-tight w-20">
              Seuil d’attribution /32
            </th>
            <th className="p-1.5 border border-[#7eaac9] text-[11px] leading-tight w-16">
              Note finale /8
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Ligne Critère A */}
          <tr className="text-slate-800 text-center">
            <td className="p-1 border border-[#7eaac9] font-bold w-6 bg-slate-50">A</td>
            <td className="p-1 border border-[#7eaac9] text-left pl-2 font-medium">{cA.name}</td>
            <td className="p-1 border border-[#7eaac9] w-16">{cA.t1 ?? finalA}</td>
            <td className="p-1 border border-[#7eaac9] w-16">{cA.t2 ?? '-'}</td>
            <td className="p-1 border border-[#7eaac9] font-bold">{finalA}</td>
            <td rowSpan={4} className="p-2 border border-[#7eaac9] font-bold text-base bg-slate-50/50">
              {seuil}
            </td>
            <td rowSpan={4} className="p-2 border border-[#7eaac9] font-bold text-lg bg-blue-50/30 text-blue-900">
              {noteFinale}
            </td>
          </tr>

          {/* Ligne Critère B */}
          <tr className="text-slate-800 text-center">
            <td className="p-1 border border-[#7eaac9] font-bold bg-slate-50">B</td>
            <td className="p-1 border border-[#7eaac9] text-left pl-2 font-medium">{cB.name}</td>
            <td className="p-1 border border-[#7eaac9]">{cB.t1 ?? finalB}</td>
            <td className="p-1 border border-[#7eaac9]">{cB.t2 ?? '-'}</td>
            <td className="p-1 border border-[#7eaac9] font-bold">{finalB}</td>
          </tr>

          {/* Ligne Critère C */}
          <tr className="text-slate-800 text-center">
            <td className="p-1 border border-[#7eaac9] font-bold bg-slate-50">C</td>
            <td className="p-1 border border-[#7eaac9] text-left pl-2 font-medium">{cC.name}</td>
            <td className="p-1 border border-[#7eaac9]">{cC.t1 ?? finalC}</td>
            <td className="p-1 border border-[#7eaac9]">{cC.t2 ?? '-'}</td>
            <td className="p-1 border border-[#7eaac9] font-bold">{finalC}</td>
          </tr>

          {/* Ligne Critère D */}
          <tr className="text-slate-800 text-center">
            <td className="p-1 border border-[#7eaac9] font-bold bg-slate-50">D</td>
            <td className="p-1 border border-[#7eaac9] text-left pl-2 font-medium">{cD.name}</td>
            <td className="p-1 border border-[#7eaac9]">{cD.t1 ?? finalD}</td>
            <td className="p-1 border border-[#7eaac9]">{cD.t2 ?? '-'}</td>
            <td className="p-1 border border-[#7eaac9] font-bold">{finalD}</td>
          </tr>
        </tbody>
      </table>

      {/* Boîte Observations */}
      <div className="border border-[#7eaac9] rounded-none overflow-hidden bg-white mt-1">
        <div className="bg-[#a3c4dc] py-0.5 px-3 text-center text-xs font-bold text-[#0f3f63]">
          Observations
        </div>
        <div className={`p-3 text-xs text-slate-800 leading-relaxed min-h-[64px] ${isRtl ? 'text-right font-arabic' : 'text-justify'}`}>
          {report?.observations || (
            <span className="italic text-slate-400">Aucune observation enregistrée pour cette matière.</span>
          )}
        </div>
      </div>
    </div>
  );
};
