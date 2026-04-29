import React, { useState, useEffect } from 'react';
import { UnitPlan } from '../types';
import { Plus, Edit2, Trash2, FileText, Calendar, Layers, Loader2, Download, X, FileCheck, Filter, FileArchive, User, LogOut, ArrowLeft, BookOpen, Printer, Globe } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { generateCourseFromChapters } from '../services/geminiService';
import { exportUnitPlanToWord, exportAssessmentsToZip, exportConsolidatedPlanByGrade, exportOverviewToWord } from '../services/wordExportService';
import { checkSubjectCompletionAllGrades } from '../services/databaseService';
import { SUBJECTS } from '../constants';

interface DashboardProps {
  currentSubject: string;
  currentGrade: string;
  plans: UnitPlan[];
  onCreateNew: () => void;
  onEdit: (plan: UnitPlan) => void;
  onDelete: (id: string) => void;
  onAddPlans: (newPlans: UnitPlan[]) => void;
  onLogout: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ currentSubject, currentGrade, plans, onCreateNew, onEdit, onDelete, onAddPlans, onLogout }) => {
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  // Pre-fill subject and grade from session
  const [bulkSubject, setBulkSubject] = useState(currentSubject);
  const [bulkGrade, setBulkGrade] = useState(currentGrade);
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [bulkChapters, setBulkChapters] = useState('');
  const [bulkResources, setBulkResources] = useState('');
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isOverviewExporting, setIsOverviewExporting] = useState(false);
  const [overviewCompletionStatus, setOverviewCompletionStatus] = useState<{
    complete: boolean;
    gradesWithPlans: string[];
    gradesMissing: string[];
  } | null>(null);
  const [isCheckingCompletion, setIsCheckingCompletion] = useState(false);

  // Filter States (only subject needed since grade is filtered by App)
  const [filterSubject, setFilterSubject] = useState('');

  // Vérifier la complétude de la matière sur tous les PEI au montage
  useEffect(() => {
    if (!currentSubject) return;
    const checkCompletion = async () => {
      setIsCheckingCompletion(true);
      try {
        const status = await checkSubjectCompletionAllGrades(currentSubject);
        setOverviewCompletionStatus(status);
      } catch (e) {
        console.warn('Could not check subject completion:', e);
      } finally {
        setIsCheckingCompletion(false);
      }
    };
    checkCompletion();
  }, [currentSubject]);

  // Prepare data for charts
  const subjectData = plans.reduce((acc: Record<string, number>, plan) => {
    const subj = plan.subject || 'Non assigné';
    acc[subj] = (acc[subj] || 0) + 1;
    return acc;
  }, {});
  
  const chartData = Object.entries(subjectData).map(([name, value]) => ({ name, value }));

  // Filter Logic
  const uniqueSubjects = Array.from(new Set(plans.map(p => p.subject).filter(Boolean))).sort();

  const filteredPlans = plans.filter(plan => {
    return filterSubject ? plan.subject === filterSubject : true;
  });

  const handleBulkGenerate = async () => {
    if (!bulkSubject || !bulkGrade || !bulkChapters) {
      alert("Veuillez remplir les champs obligatoires (chapitres).");
      return;
    }
    
    setIsBulkGenerating(true);
    try {
      console.log('🚀 Génération planification annuelle pour:', { subject: bulkSubject, grade: bulkGrade });
      const newPlans = await generateCourseFromChapters(bulkChapters, bulkSubject, bulkGrade);
      
      if (!newPlans || newPlans.length === 0) {
        throw new Error("L'IA n'a pas retourné de plan valide. Vérifiez que vous avez bien entré les chapitres du programme.");
      }
      
      console.log(`✅ ${newPlans.length} unité(s) générée(s) avec succès`);
      
      // Ajouter enseignant et ressources à chaque plan généré
      const enrichedPlans = newPlans.map(plan => ({
        ...plan,
        teacherName: bulkTeacher || plan.teacherName,
        resources: bulkResources || plan.resources
      }));
      
      if (onAddPlans) {
          onAddPlans(enrichedPlans);
      }
      setIsBulkModalOpen(false);
      setBulkChapters('');
      setBulkTeacher('');
      setBulkResources('');
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error("❌ Erreur génération planification:", e);
      alert(`❌ Erreur lors de la génération:\n\n${errorMsg}\n\nConseils:\n- Vérifiez que vous avez bien copié tout le programme\n- Assurez-vous que le texte est clair et structuré\n- Réessayez dans quelques instants`);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleExportPlan = async (plan: UnitPlan) => {
    setExportingId(`plan-${plan.id}`);
    await exportUnitPlanToWord(plan);
    setExportingId(null);
  };

  const handleExportAssessment = async (plan: UnitPlan) => {
    setExportingId(`eval-${plan.id}`);
    await exportAssessmentsToZip(plan);
    setExportingId(null);
  };

  // NOUVEAU: Fonction d'impression d'une carte d'unité
  const handlePrintUnit = (plan: UnitPlan) => {
    // Créer une fenêtre d'impression avec le contenu formaté
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Veuillez autoriser les pop-ups pour imprimer');
      return;
    }
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unité: ${plan.title || 'Sans titre'}</title>
        <style>
          @media print {
            @page { margin: 2cm; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            line-height: 1.6;
            color: #334155;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .subject-badge {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
          }
          h1 {
            color: #1e293b;
            font-size: 24px;
            margin: 10px 0;
          }
          .meta {
            color: #64748b;
            font-size: 14px;
            margin: 5px 0;
          }
          .section {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          .section-title {
            font-weight: bold;
            color: #475569;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .section-content {
            font-size: 14px;
            color: #1e293b;
          }
          .chapters-text {
            white-space: pre-line;
            font-size: 14px;
            color: #1e293b;
          }
          }
          .criteria {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
          }
          .criterion-badge {
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <span class="subject-badge">${plan.subject || 'Sans matière'}</span>
          <h1>${plan.title || 'Unité sans titre'}</h1>
          <div class="meta">
            ${plan.gradeLevel || ''} ${plan.duration ? '• ' + plan.duration : ''}
            ${plan.teacherName ? '• Enseignant(e): ' + plan.teacherName : ''}
          </div>
        </div>
        
        ${plan.statementOfInquiry ? `
          <div class="section">
            <div class="section-title">📍 Énoncé de recherche</div>
            <div class="section-content"><em>"${plan.statementOfInquiry}"</em></div>
          </div>
        ` : ''}
        
        ${plan.content ? `
          <div class="section">
            <div class="section-title">📚 Chapitres inclus</div>
            <div class="section-content">${plan.content}</div>
          </div>
        ` : ''}
        
        ${plan.chapters ? `
          <div class="section">
            <div class="section-title">📖 Chapitres et leçons</div>
            <div class="chapters-text">${plan.chapters}</div>
          </div>
        ` : ''}
        
        ${plan.assessments && plan.assessments.length > 0 ? `
          <div class="section">
            <div class="section-title">🎯 Critères d'évaluation</div>
            <div class="criteria">
              ${plan.assessments.map(a => `<span class="criterion-badge">Critère ${a.criterion}: ${a.criterionName} (${a.maxPoints}pts)</span>`).join(' ')}
            </div>
          </div>
        ` : ''}
        
        ${plan.summativeAssessment ? `
          <div class="section">
            <div class="section-title">✅ Évaluation sommative</div>
            <div class="section-content">${plan.summativeAssessment}</div>
          </div>
        ` : ''}
        
        <script>
          window.onload = () => {
            window.print();
            // Optionnel: fermer la fenêtre après impression
            // window.onafterprint = () => window.close();
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handleExportConsolidated = async () => {
    setExportingId('consolidated');
    await exportConsolidatedPlanByGrade(currentGrade);
    setExportingId(null);
  };

  const handleExportOverview = async () => {
    setIsOverviewExporting(true);
    try {
      await exportOverviewToWord(currentSubject);
    } catch (e: any) {
      alert('Erreur lors de la génération de l\'Overview: ' + (e?.message || e));
    } finally {
      setIsOverviewExporting(false);
    }
  };

  // Re-check completion when plans change (after new generation)
  const refreshCompletionStatus = async () => {
    if (!currentSubject) return;
    try {
      const status = await checkSubjectCompletionAllGrades(currentSubject);
      setOverviewCompletionStatus(status);
    } catch (e) {
      console.warn('Could not refresh subject completion:', e);
    }
  };

  const handlePrintSubjectUnits = () => {
    // Préparer le contenu HTML pour l'impression
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Descriptifs des Unités - ${currentSubject} - ${currentGrade}</title>
        <style>
          @page { margin: 20mm; }
          body {
            font-family: 'Calibri', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #3b82f6;
          }
          .header h1 {
            color: #1e40af;
            margin: 0 0 5px 0;
            font-size: 22pt;
          }
          .header h2 {
            color: #64748b;
            margin: 0;
            font-size: 14pt;
            font-weight: normal;
          }
          .unit {
            page-break-inside: avoid;
            margin-bottom: 25px;
            padding: 15px;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            background: #f8fafc;
          }
          .unit-title {
            background: #3b82f6;
            color: white;
            padding: 8px 12px;
            margin: -15px -15px 15px -15px;
            border-radius: 6px 6px 0 0;
            font-size: 14pt;
            font-weight: bold;
          }
          .section {
            margin-bottom: 12px;
          }
          .section-label {
            font-weight: bold;
            color: #475569;
            font-size: 10pt;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .section-content {
            color: #334155;
            padding-left: 10px;
          }
          .criteria-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 4px;
          }
          .criteria-badge {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 9pt;
            font-weight: bold;
          }
          .chapters {
            white-space: pre-line;
            font-size: 10pt;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 Descriptifs des Unités</h1>
          <h2>${currentSubject} - ${currentGrade}</h2>
        </div>
        ${filteredPlans.map((plan, index) => `
          <div class="unit">
            <div class="unit-title">Unité ${index + 1} : ${plan.title || 'Sans titre'}</div>
            
            ${plan.statementOfInquiry ? `
              <div class="section">
                <div class="section-label">📌 Énoncé de recherche</div>
                <div class="section-content">"${plan.statementOfInquiry}"</div>
              </div>
            ` : ''}
            
            ${plan.chapters ? `
              <div class="section">
                <div class="section-label">📖 Chapitres inclus</div>
                <div class="section-content chapters">${plan.chapters}</div>
              </div>
            ` : ''}
            
            <div class="section">
              <div class="section-label">🔑 Concept clé</div>
              <div class="section-content">${plan.keyConcept || 'Non défini'}</div>
            </div>
            
            ${plan.relatedConcepts && plan.relatedConcepts.length > 0 ? `
              <div class="section">
                <div class="section-label">🔗 Concepts connexes</div>
                <div class="section-content">${plan.relatedConcepts.join(', ')}</div>
              </div>
            ` : ''}
            
            ${plan.globalContext ? `
              <div class="section">
                <div class="section-label">🌍 Contexte mondial</div>
                <div class="section-content">${plan.globalContext}</div>
              </div>
            ` : ''}
            
            ${plan.duration ? `
              <div class="section">
                <div class="section-label">⏱️ Durée</div>
                <div class="section-content">${plan.duration}</div>
              </div>
            ` : ''}
            
            ${plan.assessments && plan.assessments.length > 0 ? `
              <div class="section">
                <div class="section-label">🎯 Critères d'évaluation</div>
                <div class="criteria-badges">
                  ${plan.assessments.map(a => `
                    <span class="criteria-badge">Critère ${a.criterion}: ${a.criterionName} (${a.maxPoints}pts)</span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;

    // Créer une fenêtre d'impression
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    } else {
      alert('Impossible d\'ouvrir la fenêtre d\'impression. Veuillez autoriser les pop-ups.');
    }
  };

  return (
    <>
      {/* Styles d'impression */}
      <style>{`
        @media print {
          /* Masquer les boutons et éléments non nécessaires */
          button, .no-print {
            display: none !important;
          }
          
          /* Ajuster les marges pour l'impression */
          body {
            margin: 0;
            padding: 20px;
          }
          
          /* Optimiser l'affichage des cartes */
          .print-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          
          /* Garder les couleurs pour l'impression */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          /* Réduire les ombres pour économiser l'encre */
          .shadow-sm, .shadow-md, .shadow-lg {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white shadow-md overflow-hidden border border-slate-100">
             <img 
                src="/logo-alkawtar.png" 
                alt="Logo Al Kawthar" 
                className="w-full h-full object-contain p-1"
                onError={(e) => e.currentTarget.style.display = 'none'}
             />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Planificateur PEI - {currentGrade}</h1>
            <div className="flex items-center gap-2 text-slate-500 mt-1">
              <FileText size={16} />
              <span className="font-medium">{currentSubject}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
             <button 
              onClick={onLogout}
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-3 rounded-lg font-semibold shadow transition"
              title="Changer de matière/classe"
            >
              <ArrowLeft size={20} />
              Retour
            </button>
             {/* ── Bouton Overview (toutes les années) ─────────────────────── */}
             {overviewCompletionStatus && (
               <div className="relative group">
                 <button
                   onClick={overviewCompletionStatus.complete ? handleExportOverview : undefined}
                   disabled={isOverviewExporting || isCheckingCompletion || !overviewCompletionStatus.complete}
                   className={`flex items-center gap-2 px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5 ${
                     overviewCompletionStatus.complete
                       ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                       : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                   } disabled:cursor-not-allowed`}
                   title={
                     overviewCompletionStatus.complete
                       ? 'Générer le document Overview complet (toutes les années PEI)'
                       : `Overview indisponible — années manquantes : ${overviewCompletionStatus.gradesMissing.join(', ')}`
                   }
                 >
                   {isOverviewExporting ? (
                     <><Loader2 className="animate-spin" size={20} />Overview...</>
                   ) : (
                     <><Globe size={20} />Overview</>  
                   )}
                 </button>
                 {/* Tooltip avec le statut de complétude */}
                 {!overviewCompletionStatus.complete && (
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-64">
                     <div className="bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl">
                       <p className="font-bold mb-1">📊 Progression de la matière</p>
                       <p className="text-green-300">✅ Complétés : {overviewCompletionStatus.gradesWithPlans.join(', ') || 'Aucun'}</p>
                       <p className="text-red-300">❌ Manquants : {overviewCompletionStatus.gradesMissing.join(', ')}</p>
                       <p className="mt-2 text-slate-300 italic">Complétez toutes les années pour activer l'Overview.</p>
                     </div>
                   </div>
                 )}
               </div>
             )}
             {filteredPlans.length > 0 && (
               <button 
                 onClick={handlePrintSubjectUnits}
                 className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
                 title="Imprimer les descriptifs des unités"
               >
                 <Printer size={20} />
                 Imprimer Descriptifs
               </button>
             )}
             <button 
               onClick={handleExportConsolidated}
               disabled={exportingId === 'consolidated'}
               className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
               title="Exporter toutes les matières de cette classe en un seul document"
             >
               {exportingId === 'consolidated' ? (
                 <>
                   <Loader2 className="animate-spin" size={20} />
                   Export...
                 </>
               ) : (
                 <>
                   <BookOpen size={20} />
                   Export Classe Complète
                 </>
               )}
             </button>
             <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
            >
              <Layers size={20} />
              Planification Annuelle
            </button>
            <button 
              onClick={onCreateNew}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              Nouvelle unité
            </button>
        </div>
      </header>

      {/* Stats Section */}
      {plans.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Unités pour {currentGrade}</h3>
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-blue-50 rounded-full text-blue-600">
                        <FileText size={32} />
                    </div>
                    <span className="text-4xl font-bold text-slate-800">{plans.length}</span>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:col-span-2">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Répartition par matière</h3>
                <div className="h-40 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{left: 40}}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12}} />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
      )}

      {/* Plans List */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-slate-500" />
                Unités récentes
            </h2>

            {/* Filters */}
            {plans.length > 0 && (
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mr-1">
                        <Filter size={16} />
                        <span>Filtrer:</span>
                    </div>
                    <select 
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                        className="bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Toutes les matières</option>
                        {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {filterSubject && (
                        <button 
                            onClick={() => setFilterSubject('')}
                            className="text-slate-500 hover:text-red-500 transition p-1 rounded-full hover:bg-red-50"
                            title="Effacer"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            )}
        </div>
        
        {plans.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
                <div className="text-slate-400 mb-4 mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <Layers size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Aucune unité pour {currentGrade}</h3>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                   C'est le moment idéal pour générer automatiquement tout votre programme annuel en une seule fois.
                </p>
                <button 
                  onClick={() => setIsBulkModalOpen(true)}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition inline-flex items-center gap-2"
                >
                  <Layers size={20} />
                  Lancer la Planification Annuelle
                </button>
                <div className="mt-4">
                     <span className="text-slate-400 text-sm">ou</span>
                     <button onClick={onCreateNew} className="ml-2 text-blue-600 hover:underline text-sm">créer une unité manuellement</button>
                </div>
            </div>
        ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 mb-2">Aucune unité ne correspond à vos filtres.</p>
                <button 
                  onClick={() => setFilterSubject('')}
                  className="text-blue-600 font-medium hover:underline text-sm"
                >
                  Effacer les filtres
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredPlans.map(plan => (
                    <div key={plan.id} className="print-card bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition group flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="inline-block px-2 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded mb-2">
                                    {plan.subject || 'Sans matière'}
                                </span>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition">{plan.title || 'Unité sans titre'}</h3>
                                <p className="text-sm text-slate-500">{plan.gradeLevel} • {plan.duration}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                <button 
                                    onClick={() => onEdit(plan)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition ml-auto"
                                    title="Modifier"
                                >
                                    <Edit2 size={18} />
                                </button>
                                <button 
                                    onClick={() => onDelete(plan.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition ml-auto"
                                    title="Supprimer"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-grow space-y-3">
                            {plan.statementOfInquiry ? (
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Énoncé de recherche</p>
                                    <p className="text-sm text-slate-700 italic line-clamp-2">"{plan.statementOfInquiry}"</p>
                                </div>
                            ) : (
                                <div className="h-16 bg-slate-50 rounded-lg flex items-center justify-center text-xs text-slate-400 italic">
                                    Pas d'énoncé défini
                                </div>
                            )}
                            
                            {/* Affichage des chapitres inclus */}
                            {plan.chapters && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                    <p className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1">
                                        <BookOpen size={14} />
                                        Chapitres inclus
                                    </p>
                                    <ul className="text-xs text-slate-800 space-y-1 ml-4">
                                        {plan.chapters.split('\n').filter(line => line.trim()).map((chapter, idx) => (
                                            <li key={idx} className="list-disc">
                                                {chapter.trim().replace(/^-\s*/, '')}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            {/* Affichage des critères d'évaluation */}
                            {plan.assessments && plan.assessments.length > 0 && (
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                    <p className="text-xs font-bold text-purple-900 uppercase mb-2">Critères d'évaluation</p>
                                    <div className="flex flex-wrap gap-2">
                                        {plan.assessments.map((assessment, idx) => (
                                            <span 
                                                key={idx}
                                                className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold"
                                                title={assessment.criterionName}
                                            >
                                                Critère {assessment.criterion}
                                                <span className="text-purple-600">({assessment.maxPoints}pts)</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button 
                                    onClick={() => handleExportPlan(plan)}
                                    className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-100 transition"
                                    disabled={exportingId === `plan-${plan.id}`}
                                >
                                    {exportingId === `plan-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <Download size={14}/>}
                                    Plan
                                </button>
                                <button 
                                    onClick={() => handleExportAssessment(plan)}
                                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100 transition"
                                    disabled={exportingId === `eval-${plan.id}`}
                                    title={"Exporter les évaluations (Zip)"}
                                >
                                    {exportingId === `eval-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <FileArchive size={14}/>}
                                    Exams (Zip)
                                </button>
                                <button 
                                    onClick={() => handlePrintUnit(plan)}
                                    className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-1 rounded hover:bg-violet-100 transition"
                                    title="Imprimer cette unité"
                                >
                                    <Printer size={14}/>
                                    Imprimer
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </section>

      {/* Bulk Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="bg-violet-600 p-4 flex justify-between items-center text-white">
                 <h3 className="text-lg font-bold flex items-center gap-2">
                    <Layers size={20} />
                    Planification Annuelle : {currentGrade}
                 </h3>
                 <button onClick={() => setIsBulkModalOpen(false)} className="hover:bg-violet-700 p-1 rounded">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-6 space-y-4">
                 <p className="text-slate-600 text-sm">
                    Collez le programme complet ci-dessous. L'IA va structurer 4 à 6 unités et générer tous les évaluations.
                 </p>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Matière</label>
                        <input 
                            type="text" 
                            value={bulkSubject}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-100 font-medium"
                            readOnly
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Niveau</label>
                        <input 
                            type="text" 
                            value={bulkGrade}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-100 font-medium"
                            readOnly
                        />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de l'enseignant(e)</label>
                    <input 
                        type="text" 
                        value={bulkTeacher}
                        onChange={(e) => setBulkTeacher(e.target.value)}
                        placeholder="ex: M. Dupont"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Liste des chapitres / Sujets</label>
                    <textarea 
                        value={bulkChapters}
                        onChange={(e) => setBulkChapters(e.target.value)}
                        placeholder="Collez ici le programme complet..."
                        className="w-full h-40 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ressources</label>
                    <textarea 
                        value={bulkResources}
                        onChange={(e) => setBulkResources(e.target.value)}
                        placeholder="ex: Manuel page 45-60, Vidéo YouTube, etc."
                        className="w-full h-24 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <button 
                    onClick={handleBulkGenerate}
                    disabled={isBulkGenerating}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-70"
                 >
                    {isBulkGenerating ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            Analyse et structuration en cours (Ceci peut prendre 30s)...
                        </>
                    ) : (
                        <>
                            <Layers size={20} />
                            Générer les 4-6 Unités
                        </>
                    )}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
    </>
  );
};

export default Dashboard;
