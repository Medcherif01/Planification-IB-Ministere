import React, { useState } from 'react';
import { UnitPlan } from '../types';
import { KEY_CONCEPTS, RELATED_CONCEPTS_GENERIC, GLOBAL_CONTEXTS, SUBJECTS } from '../constants';
import { generateStatementOfInquiry, generateInquiryQuestions, generateLearningExperiences, generateFullUnitPlan } from '../services/geminiService';
import { Sparkles, Save, ArrowLeft, Loader2, Plus, Trash2, BookOpen, Wand2, FileText, Copy, User } from 'lucide-react';

interface UnitPlanFormProps {
  initialPlan?: UnitPlan;
  onSave: (plan: UnitPlan) => void;
  onCancel: () => void;
}

const UnitPlanForm: React.FC<UnitPlanFormProps> = ({ initialPlan, onSave, onCancel }) => {
  const [plan, setPlan] = useState<UnitPlan>(initialPlan || {
    id: Date.now().toString(),
    teacherName: '',
    title: '',
    subject: '',
    gradeLevel: '',
    duration: '',
    keyConcept: '',
    relatedConcepts: [],
    globalContext: '',
    statementOfInquiry: '',
    inquiryQuestions: { factual: [], conceptual: [], debatable: [] },
    objectives: [],
    atlSkills: [],
    content: '',
    lessons: [], // NOUVEAU: Leçons/Chapitres
    learningExperiences: '',
    summativeAssessment: '',
    formativeAssessment: '',
    differentiation: '',
    resources: '',
    reflection: { prior: '', during: '', after: '' },
    generatedAssessmentDocument: '',
    assessmentData: undefined,
    assessments: []
  });

  const [topicsInput, setTopicsInput] = useState('');
  const [isFullGenerating, setIsFullGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'assessment'>('plan');

  const [isGeneratingSOI, setIsGeneratingSOI] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingActivities, setIsGeneratingActivities] = useState(false);
  const [soiSuggestions, setSoiSuggestions] = useState<string[]>([]);

  const handleInputChange = (field: keyof UnitPlan, value: any) => {
    setPlan(prev => ({ ...prev, [field]: value }));
  };

  const handleReflectionChange = (field: keyof typeof plan.reflection, value: string) => {
    setPlan(prev => ({ ...prev, reflection: { ...prev.reflection, [field]: value } }));
  };

  const toggleRelatedConcept = (concept: string) => {
    setPlan(prev => {
      const current = prev.relatedConcepts;
      if (current.includes(concept)) {
        return { ...prev, relatedConcepts: current.filter(c => c !== concept) };
      }
      if (current.length >= 3) return prev; // Limit to 3
      return { ...prev, relatedConcepts: [...current, concept] };
    });
  };

  const handleGenerateFullPlan = async () => {
    if (!topicsInput || !plan.subject || !plan.gradeLevel) {
      alert("Veuillez entrer la matière, le niveau scolaire et les chapitres/sujets.");
      return;
    }

    setIsFullGenerating(true);
    try {
      console.log('🚀 Génération du plan pour:', { subject: plan.subject, grade: plan.gradeLevel, topics: topicsInput });
      const generatedData = await generateFullUnitPlan(topicsInput, plan.subject, plan.gradeLevel);
      
      // Vérifier que les données sont valides
      if (!generatedData || typeof generatedData !== 'object') {
        throw new Error("L'IA n'a pas retourné de plan valide. Les données sont vides.");
      }
      
      console.log('✅ Plan généré avec succès:', generatedData);
      
      setPlan(prev => ({
        ...prev,
        ...generatedData,
        // Keep teacher name if user typed it manually
        teacherName: prev.teacherName || generatedData.teacherName || "",
        // Ensure inquiryQuestions has a valid structure even if partial data returned
        inquiryQuestions: {
           factual: generatedData.inquiryQuestions?.factual || prev.inquiryQuestions.factual || [],
           conceptual: generatedData.inquiryQuestions?.conceptual || prev.inquiryQuestions.conceptual || [],
           debatable: generatedData.inquiryQuestions?.debatable || prev.inquiryQuestions.debatable || []
        },
        reflection: prev.reflection // Keep existing reflection if any
      }));
      
      if (generatedData.assessments && generatedData.assessments.length > 0) {
        console.log(`✅ ${generatedData.assessments.length} évaluation(s) générée(s)`);
      }
    } catch (error: any) {
      console.error('❌ Erreur génération:', error);
      const errorMessage = error?.message || String(error);
      alert(`❌ Échec de la génération du plan:\n\n${errorMessage}\n\nVeuillez réessayer avec des chapitres plus précis.`);
    } finally {
      setIsFullGenerating(false);
    }
  };

  const handleGenerateSOI = async () => {
    if (!plan.keyConcept || plan.relatedConcepts.length === 0 || !plan.globalContext) {
      alert("Veuillez sélectionner le concept clé, les concepts connexes et le contexte mondial.");
      return;
    }
    setIsGeneratingSOI(true);
    const suggestions = await generateStatementOfInquiry(plan.keyConcept, plan.relatedConcepts, plan.globalContext);
    setSoiSuggestions(suggestions);
    setIsGeneratingSOI(false);
  };

  const handleGenerateQuestions = async () => {
    if (!plan.statementOfInquiry) {
      alert("Veuillez d'abord définir un énoncé de recherche.");
      return;
    }
    setIsGeneratingQuestions(true);
    const questions = await generateInquiryQuestions(plan.statementOfInquiry);
    setPlan(prev => ({ ...prev, inquiryQuestions: questions }));
    setIsGeneratingQuestions(false);
  };

  const handleGenerateActivities = async () => {
    if (!plan.title || !plan.statementOfInquiry) {
      alert("Veuillez d'abord entrer un titre et un énoncé de recherche.");
      return;
    }
    setIsGeneratingActivities(true);
    const ideas = await generateLearningExperiences(plan);
    setPlan(prev => ({ ...prev, learningExperiences: prev.learningExperiences + (prev.learningExperiences ? "\n\n" : "") + ideas }));
    setIsGeneratingActivities(false);
  };

  const copyAssessmentToClipboard = () => {
    // Simple string representation of all assessments
    const text = plan.assessments.map(a => 
        `Critère ${a.criterion}: ${a.criterionName}\n` +
        `Max: ${a.maxPoints}\n` +
        a.exercises.map((e, i) => `${i+1}. ${e.title}\n${e.content}`).join('\n\n')
    ).join('\n-------------------\n');
    
    navigator.clipboard.writeText(text || plan.generatedAssessmentDocument);
    alert("Résumé des évaluations copié dans le presse-papiers !");
  };

  return (
    <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="bg-slate-800 text-white p-6 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <button onClick={onCancel} className="p-2 hover:bg-slate-700 rounded-full transition">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen size={24} />
            {initialPlan ? "Modifier le plan d'unité" : "Nouveau plan d'unité"}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-700 rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('plan')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition ${activeTab === 'plan' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
            >
              Plan d'unité
            </button>
            <button 
               onClick={() => setActiveTab('assessment')}
               className={`px-3 py-1 rounded-md text-sm font-medium transition ${activeTab === 'assessment' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}
            >
              Évaluations ({plan.assessments.length || (plan.assessmentData ? 1 : 0)})
            </button>
          </div>
          <button 
            onClick={() => {
              if (plan.objectives.length < 2) {
                alert('⚠️ Veuillez sélectionner au moins 2 critères d\'évaluation avant de sauvegarder.');
                return;
              }
              onSave(plan);
            }}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition shadow-md"
          >
            <Save size={18} />
            Sauvegarder
          </button>
        </div>
      </div>

      {activeTab === 'assessment' ? (
        <div className="p-8 bg-slate-50 min-h-[80vh]">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">Aperçu des Évaluations</h3>
              <div className="flex gap-2">
                <button 
                  onClick={copyAssessmentToClipboard}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 bg-white border border-blue-200 px-3 py-2 rounded-lg shadow-sm transition"
                >
                  <Copy size={18} />
                  Copier le texte
                </button>
              </div>
            </div>
            
            {plan.assessments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {plan.assessments.map((assessment, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-xl shadow border border-slate-200">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
                              <h4 className="font-bold text-lg text-slate-800">Critère {assessment.criterion}</h4>
                              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded">{assessment.maxPoints} pts</span>
                          </div>
                          <p className="text-sm text-slate-600 mb-2 font-medium">{assessment.criterionName}</p>
                          <div className="space-y-2 mt-4">
                              <p className="text-xs text-slate-400 uppercase font-bold">Exercices:</p>
                              {assessment.exercises.map((ex, i) => (
                                  <div key={i} className="text-sm bg-slate-50 p-2 rounded border border-slate-100">
                                      <span className="font-bold block text-slate-700">{ex.title}</span>
                                      <span className="text-slate-500 text-xs whitespace-pre-wrap block">{ex.content}</span>
                                  </div>
                              ))}
                          </div>
                      </div>
                  ))}
              </div>
            ) : plan.generatedAssessmentDocument ? (
              <textarea
                value={plan.generatedAssessmentDocument}
                readOnly
                className="w-full h-[600px] p-8 bg-white border border-slate-300 rounded-lg font-mono text-sm shadow-inner outline-none"
               />
            ) : (
              <div className="bg-white p-12 rounded-lg border border-dashed border-slate-300 text-center">
                <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">Aucune évaluation générée pour le moment.</p>
                <p className="text-sm text-slate-400">Utilisez le bouton "Générer Auto" dans l'onglet Plan d'unité.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 space-y-10">
          
          {/* Magic Generator Section */}
          {!initialPlan && (
             <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-6 rounded-xl border border-indigo-100 shadow-sm">
               <div className="flex items-center gap-2 mb-4 text-indigo-900">
                 <Wand2 className="text-indigo-600" size={24} />
                 <h3 className="text-lg font-bold">Génération Automatique (Plan + Évaluations A-D)</h3>
               </div>
               <p className="text-sm text-indigo-700 mb-4">
                 Entrez vos chapitres, choisissez une matière et un niveau. L'IA générera le plan complet ET les 4 évaluations critériées.
               </p>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-indigo-800 mb-1">Matière</label>
                    <input 
                      type="text" 
                      value={plan.subject}
                      className="w-full p-2 border border-indigo-200 rounded-lg bg-indigo-50 font-medium text-indigo-900 text-sm"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-indigo-800 mb-1">Niveau (Année du PEI)</label>
                    <input 
                      type="text" 
                      value={plan.gradeLevel}
                      className="w-full p-2 border border-indigo-200 rounded-lg bg-indigo-50 font-medium text-indigo-900 text-sm"
                      readOnly
                    />
                  </div>
               </div>

               <div className="mb-4">
                 <label className="block text-xs font-bold text-indigo-800 mb-1">Chapitres / Contenu</label>
                 <textarea 
                    value={topicsInput}
                    onChange={(e) => setTopicsInput(e.target.value)}
                    placeholder="ex: Chapitre 1: Les équations linéaires, Chapitre 2: Les inéquations..."
                    className="w-full p-3 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none h-24 text-sm"
                 />
               </div>

               <button 
                  onClick={handleGenerateFullPlan}
                  disabled={isFullGenerating}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow transition flex items-center justify-center gap-2"
               >
                  {isFullGenerating ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      Analyse et Génération en cours...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Générer le Plan et les Évaluations
                    </>
                  )}
               </button>
             </div>
          )}

          {/* Section 1: Overview */}
          <section className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 mb-4">Aperçu de l'unité</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                 <label className="block text-sm font-medium text-slate-600 mb-1">Enseignant(e)</label>
                 <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="text-slate-400" size={16} />
                    </div>
                    <input 
                      type="text"
                      value={plan.teacherName}
                      onChange={(e) => handleInputChange('teacherName', e.target.value)}
                      className="w-full pl-9 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Votre nom"
                    />
                 </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Titre de l'unité</label>
                <input 
                  type="text" 
                  value={plan.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Groupe de matières</label>
                {initialPlan?.subject || plan.subject ? (
                  <input 
                    type="text" 
                    value={plan.subject}
                    className="w-full p-3 border border-slate-300 rounded-lg bg-slate-100 font-medium text-slate-700"
                    readOnly
                  />
                ) : (
                  <select 
                    value={plan.subject}
                    onChange={(e) => handleInputChange('subject', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="">Sélectionner...</option>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Année du PEI</label>
                <input 
                  type="text" 
                  value={plan.gradeLevel}
                  className="w-full p-3 border border-slate-300 rounded-lg bg-slate-100 font-medium text-slate-700"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Durée de l'unité (heures)</label>
                <input 
                  type="text" 
                  value={plan.duration}
                  onChange={(e) => handleInputChange('duration', e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            {/* Chapitres/Leçons */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1">Chapitres / Leçons inclus dans cette unité</label>
              <textarea 
                value={plan.chapters || ''}
                onChange={(e) => handleInputChange('chapters', e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                placeholder="- Chapitre 1: Introduction...&#10;- Chapitre 2: Développement...&#10;- Chapitre 3: Applications..."
              />
              <p className="text-xs text-slate-500 mt-1 ml-1">💡 Listez les chapitres/leçons sous forme de tirets (un par ligne)</p>
            </div>
          </section>

          {/* Section 2: Inquiry */}
          <section className="space-y-6 bg-blue-50 p-6 rounded-xl border border-blue-100">
            <div className="flex items-center justify-between border-b border-blue-200 pb-2 mb-4">
              <h3 className="text-lg font-semibold text-blue-900">Recherche : définition de l'objectif</h3>
              <span className="text-xs text-blue-600 uppercase font-bold tracking-wider">Concepts</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Key Concept */}
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">Concept clé</label>
                <select 
                  value={plan.keyConcept}
                  onChange={(e) => handleInputChange('keyConcept', e.target.value)}
                  className="w-full p-2 border border-blue-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner...</option>
                  {KEY_CONCEPTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Related Concepts */}
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">Concepts connexes (Max 3)</label>
                <div className="h-32 overflow-y-auto border border-blue-300 rounded-md bg-white p-2 grid grid-cols-1 gap-1">
                  {RELATED_CONCEPTS_GENERIC.map(c => (
                    <label key={c} className="flex items-center space-x-2 text-sm cursor-pointer hover:bg-blue-50 p-1 rounded">
                      <input 
                        type="checkbox" 
                        checked={plan.relatedConcepts.includes(c)}
                        onChange={() => toggleRelatedConcept(c)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className={plan.relatedConcepts.includes(c) ? 'font-medium text-blue-700' : 'text-slate-600'}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Global Context */}
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">Contexte mondial</label>
                <select 
                  value={plan.globalContext}
                  onChange={(e) => handleInputChange('globalContext', e.target.value)}
                  className="w-full p-2 border border-blue-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner...</option>
                  {GLOBAL_CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Statement of Inquiry */}
            <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-slate-700">Énoncé de recherche</label>
                <button 
                  onClick={handleGenerateSOI}
                  disabled={isGeneratingSOI}
                  className="flex items-center gap-1 text-xs bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-3 py-1.5 rounded-full hover:opacity-90 transition disabled:opacity-50"
                >
                  {isGeneratingSOI ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                  Suggérer
                </button>
              </div>
              
              {soiSuggestions.length > 0 && (
                <div className="mb-3 p-3 bg-violet-50 border border-violet-100 rounded-md">
                  <p className="text-xs text-violet-700 font-bold mb-2">Suggestions IA :</p>
                  <ul className="space-y-2">
                    {soiSuggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700 group">
                        <button 
                          onClick={() => setPlan(prev => ({...prev, statementOfInquiry: s}))}
                          className="mt-0.5 text-violet-500 hover:text-violet-700"
                          title="Utiliser"
                        >
                          <Plus size={14} />
                        </button>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea 
                value={plan.statementOfInquiry}
                onChange={(e) => handleInputChange('statementOfInquiry', e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-lg font-medium text-slate-800"
                rows={3}
              />
            </div>

            {/* Inquiry Questions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                  { key: 'factual', label: 'Factuelle(s)' },
                  { key: 'conceptual', label: 'Conceptuelle(s)' },
                  { key: 'debatable', label: 'Invitant au débat' }
                ].map((type) => {
                  const questionList = plan.inquiryQuestions?.[type.key as keyof typeof plan.inquiryQuestions] || [];
                  return (
                    <div key={type.key} className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-xs font-bold uppercase text-slate-500">{type.label}</h4>
                        {type.key === 'factual' && (
                          <button 
                            onClick={handleGenerateQuestions}
                            disabled={isGeneratingQuestions}
                            className="text-violet-500 hover:text-violet-700"
                            title="Générer questions"
                          >
                            {isGeneratingQuestions ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                          </button>
                        )}
                      </div>
                      <ul className="space-y-2 min-h-[100px]">
                        {questionList.map((q, i) => (
                          <li key={i} className="text-sm text-slate-700 bg-slate-50 p-2 rounded flex justify-between group">
                            <span>{q}</span>
                            <button 
                              onClick={() => {
                                const newQs = {...plan.inquiryQuestions};
                                // Ensure arrays exist before modifying
                                if (!newQs.factual) newQs.factual = [];
                                if (!newQs.conceptual) newQs.conceptual = [];
                                if (!newQs.debatable) newQs.debatable = [];

                                const key = type.key as keyof typeof plan.inquiryQuestions;
                                newQs[key] = newQs[key].filter((_, idx) => idx !== i);
                                setPlan(p => ({...p, inquiryQuestions: newQs}));
                              }}
                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">
                      Critères d'évaluation (minimum 2 requis)
                    </label>
                    <div className="space-y-2 p-3 border border-slate-300 rounded-lg bg-slate-50">
                      {['A', 'B', 'C', 'D'].map(criterion => {
                        const criterionNames: { [key: string]: string } = {
                          'A': 'Connaissances et compréhension',
                          'B': 'Recherche',
                          'C': 'Communication',
                          'D': 'Pensée critique'
                        };
                        const isSelected = plan.objectives.includes(criterion);
                        return (
                          <label key={criterion} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newObjectives = e.target.checked
                                  ? [...plan.objectives, criterion]
                                  : plan.objectives.filter(obj => obj !== criterion);
                                handleInputChange('objectives', newObjectives);
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm">
                              <strong>Critère {criterion}:</strong> {criterionNames[criterion]}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {plan.objectives.length < 2 && (
                      <p className="text-xs text-red-600 mt-1">⚠️ Sélectionnez au moins 2 critères</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Évaluation sommative (Aperçu)</label>
                    <textarea 
                        value={plan.summativeAssessment}
                        onChange={(e) => handleInputChange('summativeAssessment', e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32"
                    />
                </div>
            </div>
             <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Approches de l’apprentissage (ATL)</label>
                <textarea 
                    value={Array.isArray(plan.atlSkills) ? plan.atlSkills.join('\n') : plan.atlSkills}
                    onChange={(e) => handleInputChange('atlSkills', e.target.value.split('\n'))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                />
            </div>
          </section>

          {/* Section 3: Action */}
          <section className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 mb-4">Action : enseignement et apprentissage par le biais de la recherche</h3>
            
            <div className="grid grid-cols-1 gap-6">
               <div>
                 <label className="text-sm font-medium text-slate-700 mb-2 block">Contenu</label>
                 <textarea 
                    value={plan.content}
                    onChange={(e) => handleInputChange('content', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 text-sm mb-4"
                  />
               </div>
               <div>
                 <label className="text-sm font-medium text-slate-700 mb-2 block">
                   Leçons / Chapitres de l'unité
                   <span className="text-xs text-slate-500 ml-2">(une leçon par ligne)</span>
                 </label>
                 <textarea 
                    value={plan.lessons?.join('\n') || ''}
                    onChange={(e) => handleInputChange('lessons', e.target.value.split('\n').filter(l => l.trim()))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 text-sm"
                    placeholder="- Leçon 1: Introduction aux fractions&#10;- Leçon 2: Addition de fractions&#10;- Leçon 3: Soustraction de fractions"
                  />
                  <p className="text-xs text-slate-500 mt-1">Ces leçons seront affichées sous forme de tirets dans le descriptif</p>
               </div>
               <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-slate-700">Activités d’apprentissage et stratégies d’enseignement</label>
                    <button 
                      onClick={handleGenerateActivities}
                      disabled={isGeneratingActivities}
                      className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-200 transition"
                    >
                      {isGeneratingActivities ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                      Suggérer
                    </button>
                  </div>
                  <textarea 
                    value={plan.learningExperiences}
                    onChange={(e) => handleInputChange('learningExperiences', e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-40 font-mono text-sm"
                  />
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Évaluation formative</label>
                    <textarea 
                        value={plan.formativeAssessment}
                        onChange={(e) => handleInputChange('formativeAssessment', e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32"
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Différenciation</label>
                    <textarea 
                        value={plan.differentiation}
                        onChange={(e) => handleInputChange('differentiation', e.target.value)}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32"
                    />
                 </div>
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Ressources</label>
                  <textarea 
                      value={plan.resources}
                      onChange={(e) => handleInputChange('resources', e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  />
               </div>
            </div>
          </section>

          {/* Section 4: Reflection */}
          <section className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 border-b pb-2 mb-4">Réflexion</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Avant l’enseignement</label>
                    <textarea 
                        value={plan.reflection?.prior || ''}
                        onChange={(e) => handleReflectionChange('prior', e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Pendant l’enseignement</label>
                    <textarea 
                        value={plan.reflection?.during || ''}
                        onChange={(e) => handleReflectionChange('during', e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Suite à l’enseignement</label>
                    <textarea 
                        value={plan.reflection?.after || ''}
                        onChange={(e) => handleReflectionChange('after', e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-32 text-sm"
                    />
                </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default UnitPlanForm;