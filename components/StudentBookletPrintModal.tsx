import React, { useRef, useState, useEffect } from 'react';
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
import { X, Printer, Download, Eye, Award, ChevronLeft, ChevronRight, CheckCircle2, Layers } from 'lucide-react';

interface StudentBookletPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  booklets: StudentBooklet[]; // Un ou plusieurs livrets (si impression groupée)
  initialIndex?: number;
}

function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Génère le code HTML complet autonome et prêt pour l'impression A4 / PDF
 * avec exactement le même design que la vue HTML de l'application.
 */
export function generateBookletPrintHtml(
  bookletsToPrint: StudentBooklet[],
  options?: { autoPrint?: boolean; title?: string }
): string {
  const globalSchoolLogo = getGlobalSchoolLogo();
  const globalIbLogo = getGlobalIbLogo();
  const docTitle = options?.title || (
    bookletsToPrint.length === 1
      ? `Livret_PEI_${bookletsToPrint[0].grade || 'PEI4'}_${bookletsToPrint[0].studentName.replace(/\s+/g, '_')}`
      : `Livrets_PEI_Classe_Complete_${bookletsToPrint.length}_Eleves`
  );

  const pagesHtml = bookletsToPrint.map((booklet) => {
    const gradeClean = booklet.grade?.toUpperCase().replace(/\s+/g, '') || 'PEI4';
    const schoolLogoUrl = globalSchoolLogo || booklet.schoolLogoUrl;
    const ibLogoUrl = globalIbLogo || booklet.ibLogoUrl;

    const schoolLogoSrc = schoolLogoUrl
      ? convertGoogleDriveUrl(schoolLogoUrl)
      : LOGO_ALKAWTAR_BASE64;

    const ibLogoElement = ibLogoUrl ? `
      <img
        src="${escapeHtml(convertGoogleDriveUrl(ibLogoUrl))}"
        alt="IB World School"
        style="width: 100%; height: 100%; object-fit: contain;"
      />
    ` : `
      <svg viewBox="0 0 100 100" style="width: 100%; height: 100%; max-height: 70px;">
        <circle cx="50" cy="50" r="46" fill="none" stroke="#0f3f63" stroke-width="2.5" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="#7eaac9" stroke-width="1" stroke-dasharray="2,2" />
        <text x="50" y="30" text-anchor="middle" font-size="7" font-weight="bold" fill="#0f3f63" letter-spacing="0.8">
          ÉCOLE DU MONDE DU
        </text>
        <text x="50" y="58" text-anchor="middle" font-family="serif" font-size="30" font-weight="bold" fill="#0d83be">
          ib
        </text>
        <text x="50" y="73" text-anchor="middle" font-size="6.5" font-weight="bold" fill="#0f3f63" letter-spacing="0.6">
          WORLD SCHOOL
        </text>
      </svg>
    `;

    const renderFooterHtml = (pageNum: string) => `
      <div style="position: absolute; bottom: 12mm; left: 15mm; right: 15mm; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; background: #ffffff;">
        <span style="font-size: 10px; color: #64748b; font-weight: 500;">${escapeHtml(booklet.studentName)} — Livret Scolaire PEI</span>
        <span style="font-size: 11px; font-weight: bold; color: #0f3f63; background-color: #f1f5f9; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">${pageNum}</span>
      </div>
    `;

    const cornerDecorHtml = `<div class="page-corner-decor"></div>`;

    // Helper pour générer un bloc matière (Tableau critères + Observations)
    const renderSubjectBlockHtml = (subjectName: string, report: any, isRtl = false) => {
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

      return `
        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-weight: 600; color: #1e293b; margin-bottom: 4px; ${isRtl ? 'text-align: right; font-family: Cairo, Tahoma, sans-serif;' : 'text-align: left;'}">
            ${isRtl ? (teacher ? `أ .${escapeHtml(teacher)} : (e)Enseignant` : 'Enseignant(e) : —') : `Enseignant(e) : ${escapeHtml(teacher || '—')}`}
          </div>
          <table class="table-border" style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: center;">
            <thead>
              <tr style="background-color: #6fa8dc; color: #ffffff; font-weight: bold;">
                <th colspan="7" style="padding: 6px; border: 1px solid #7eaac9; font-size: 12px; letter-spacing: 0.3px;">
                  ${escapeHtml(subjectName)}
                </th>
              </tr>
              <tr class="table-blue-header" style="font-weight: 600; font-size: 10.5px;">
                <th colspan="2" style="padding: 5px; border: 1px solid #7eaac9; text-align: left; padding-left: 8px;">Critères</th>
                <th colspan="2" style="padding: 5px; border: 1px solid #7eaac9;">
                  Descripteurs de niveaux /8
                  <div style="display: flex; justify-content: space-around; font-size: 9px; font-weight: normal; border-top: 1px solid #7eaac9; margin-top: 3px; padding-top: 2px;">
                    <span>Semestre 1</span>
                    <span>Semestre 2</span>
                  </div>
                </th>
                <th style="padding: 5px; border: 1px solid #7eaac9; width: 68px; font-size: 9.5px; line-height: 1.1;">Niveau final atteint /8</th>
                <th style="padding: 5px; border: 1px solid #7eaac9; width: 68px; font-size: 9.5px; line-height: 1.1;">Seuil d’attribution /32</th>
                <th style="padding: 5px; border: 1px solid #7eaac9; width: 56px; font-size: 9.5px; line-height: 1.1;">Note finale /8</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold; width: 24px; background-color: #f8fafc;">A</td>
                <td style="padding: 4px 8px; border: 1px solid #7eaac9; text-align: left; font-weight: 500;">${escapeHtml(cA.name)}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; width: 48px;">${cA.t1 ?? finalA}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; width: 48px;">${cA.t2 ?? '-'}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold;">${finalA}</td>
                <td rowspan="4" style="padding: 8px; border: 1px solid #7eaac9; font-weight: bold; font-size: 15px; background-color: #f8fafc;">${seuil}</td>
                <td rowspan="4" style="padding: 8px; border: 1px solid #7eaac9; font-weight: bold; font-size: 18px; background-color: #eff6ff; color: #1e3a8a;">${noteFinale}</td>
              </tr>
              <tr>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold; background-color: #f8fafc;">B</td>
                <td style="padding: 4px 8px; border: 1px solid #7eaac9; text-align: left; font-weight: 500;">${escapeHtml(cB.name)}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cB.t1 ?? finalB}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cB.t2 ?? '-'}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold;">${finalB}</td>
              </tr>
              <tr>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold; background-color: #f8fafc;">C</td>
                <td style="padding: 4px 8px; border: 1px solid #7eaac9; text-align: left; font-weight: 500;">${escapeHtml(cC.name)}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cC.t1 ?? finalC}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cC.t2 ?? '-'}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold;">${finalC}</td>
              </tr>
              <tr>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold; background-color: #f8fafc;">D</td>
                <td style="padding: 4px 8px; border: 1px solid #7eaac9; text-align: left; font-weight: 500;">${escapeHtml(cD.name)}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cD.t1 ?? finalD}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9;">${cD.t2 ?? '-'}</td>
                <td style="padding: 4px; border: 1px solid #7eaac9; font-weight: bold;">${finalD}</td>
              </tr>
            </tbody>
          </table>
          <div style="border: 1px solid #7eaac9; margin-top: 4px; background: #ffffff;">
            <div style="background-color: #a3c4dc; padding: 2px 8px; text-align: center; font-size: 11px; font-weight: bold; color: #0f3f63;">
              Observations
            </div>
            <div style="padding: 8px 10px; font-size: 11px; color: #1e293b; line-height: 1.45; min-height: 52px; ${isRtl ? 'text-align: right; font-family: Cairo, Tahoma, sans-serif;' : 'text-align: justify;'}">
              ${report?.observations ? escapeHtml(report.observations) : '<span style="font-style: italic; color: #94a3b8;">Aucune observation enregistrée pour cette matière.</span>'}
            </div>
          </div>
        </div>
      `;
    };

    // 10 chiffres du numéro d'autorisation ministérielle
    const licenseDigits = (booklet.licenseNumber || '٤٣٥١٤٤۰١۰٧')
      .replace(/[\s\(\)0-9a-zA-Z]/g, '')
      .split('')
      .slice(0, 10);
    const licenseBoxesHtml = (licenseDigits.length > 0 ? licenseDigits : ['٤','٣','٥','١','٤','٤','۰','١','۰','٧'])
      .map(digit => `<div style="width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; color: #1e3a8a; border-right: 1px solid #93c5fd;">${digit}</div>`)
      .join('');

    return `
      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 1 : PAGE DE GARDE / COUVERTURE
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div style="padding-top: 8px;">
          <!-- Header Logos & Titre -->
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 14px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 76px; height: 76px; border-radius: 50%; border: 2px solid #60a5fa; padding: 4px; display: flex; align-items: center; justify-content: center; background: #ffffff; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                <img src="${escapeHtml(schoolLogoSrc)}" alt="École Al-Kawthar" style="width: 100%; height: 100%; object-fit: contain;" />
              </div>
              <div style="width: 76px; height: 76px; border-radius: 50%; border: 2px solid #60a5fa; padding: 4px; display: flex; align-items: center; justify-content: center; background: #ffffff; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
                ${ibLogoElement}
              </div>
            </div>

            <!-- Titre Bleu Officiel -->
            <div class="header-blue-card" style="flex: 1; max-width: 320px; padding: 14px 20px; text-align: center; border-radius: 2px;">
              <h1 style="font-size: 20px; font-weight: 900; letter-spacing: 0.8px; text-transform: uppercase; margin: 0; color: #ffffff;">
                LIVRET SCOLAIRE ${escapeHtml(gradeClean)}
              </h1>
              <p style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95); margin-top: 4px; margin-bottom: 0;">
                ${escapeHtml((booklet.term === '1er trimestre' || !booklet.term) ? 'Semestre 1' : (booklet.term === '2e trimestre' || booklet.term === '3e trimestre') ? 'Semestre 2' : booklet.term)}
              </p>
            </div>
          </div>

          <!-- Numéro de licence -->
          <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            <div style="display: inline-flex; flex-direction: column; align-items: flex-end;">
              <span style="font-size: 11px; color: #1e3a8a; font-weight: bold; margin-bottom: 2px; font-family: Cairo, Tahoma, sans-serif;">رقم الترخيص</span>
              <div style="display: flex; border: 1px solid #60a5fa; background: #ffffff;">
                ${licenseBoxesHtml}
              </div>
            </div>
          </div>

          <!-- Année scolaire -->
          <div style="text-align: center; margin: 20px 0;">
            <h2 style="font-size: 17px; font-weight: bold; color: #1e293b; letter-spacing: 0.5px; margin: 0;">
              Année scolaire : ${escapeHtml((booklet.schoolYear && booklet.schoolYear !== '2025/2026') ? booklet.schoolYear : '2026/2027')}
            </h2>
          </div>

          <!-- Box Élève -->
          <div style="border: 2px solid #0d83be; display: flex; margin: 18px 0; background: #ffffff;">
            <div class="tab-blue-label" style="width: 90px; color: #ffffff; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 16px; letter-spacing: 1px; flex-shrink: 0;">
              Élève
            </div>
            <div style="flex: 1; padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
              <div style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                <div>
                  <span style="color: #64748b; font-weight: 500;">Nom et Prénom : </span>
                  <strong style="color: #0f172a; font-weight: bold; font-size: 15px;">${escapeHtml(booklet.studentName)}</strong>
                </div>
                <div>
                  <span style="color: #64748b; font-weight: 500;">Né(e) le : </span>
                  <strong style="color: #334155; font-style: italic;">${escapeHtml(booklet.birthDate || '15/12/2012')}</strong>
                </div>
                ${booklet.studentNumber ? `
                  <div style="font-size: 12px; color: #64748b;">
                    Matricule : <span style="font-family: monospace; font-weight: bold; color: #334155;">${escapeHtml(booklet.studentNumber)}</span>
                  </div>
                ` : ''}
              </div>
              <div style="width: 100px; height: 125px; border: 2px solid #7eaac9; background: #f8fafc; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${booklet.photoUrl ? `
                  <img src="${escapeHtml(convertGoogleDriveUrl(booklet.photoUrl))}" alt="${escapeHtml(booklet.studentName)}" style="width: 100%; height: 100%; object-fit: cover;" />
                ` : `
                  <div style="text-align: center; padding: 8px; color: #94a3b8;">
                    <div style="width: 44px; height: 44px; margin: 0 auto 4px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; color: #64748b;">
                      ${escapeHtml(booklet.studentName?.charAt(0) || 'E')}
                    </div>
                    <span style="font-size: 10px; display: block;">Photo élève</span>
                  </div>
                `}
              </div>
            </div>
          </div>

          <!-- Box École -->
          <div style="border: 2px solid #0d83be; display: flex; margin: 18px 0; background: #ffffff;">
            <div class="tab-blue-label" style="width: 90px; color: #ffffff; font-weight: bold; display: flex; align-items: center; justify-content: center; font-size: 16px; letter-spacing: 1px; flex-shrink: 0;">
              École
            </div>
            <div style="flex: 1; padding: 16px; font-size: 13px; color: #1e293b; line-height: 1.7;">
              <div>
                <span style="color: #64748b; font-weight: 500;">Nom : </span>
                <strong style="color: #0f172a; font-weight: bold;">${escapeHtml(booklet.schoolName || DEFAULT_SCHOOL_INFO.name)}</strong>
              </div>
              <div>
                <span style="color: #64748b; font-weight: 500;">Adresse : </span>
                <span>${escapeHtml(booklet.schoolAddress || DEFAULT_SCHOOL_INFO.address)}</span>
              </div>
              <div>
                <span style="color: #64748b; font-weight: 500;">Tél : </span>
                <span style="font-family: monospace;">${escapeHtml(booklet.schoolPhone || DEFAULT_SCHOOL_INFO.phone)}</span>
              </div>
              <div>
                <span style="color: #64748b; font-weight: 500;">Site web : </span>
                <span style="color: #1d4ed8; text-decoration: underline;">${escapeHtml(booklet.schoolWebsite || DEFAULT_SCHOOL_INFO.website)}</span>
              </div>
            </div>
          </div>
        </div>

        ${renderFooterHtml('Couverture')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 2 : NIVEAUX IB & DESCRIPTEURS ATL
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div style="padding-top: 6px;">
          <!-- Tableau 1 : Niveaux IB -->
          <div style="margin-bottom: 20px;">
            <table class="table-border" style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr class="table-blue-header" style="font-weight: bold; text-align: center;">
                  <th style="padding: 7px; border: 1px solid #7eaac9; width: 80px;">Niveaux IB</th>
                  <th style="padding: 7px; border: 1px solid #7eaac9; width: 80px;">Limites</th>
                  <th style="padding: 7px; border: 1px solid #7eaac9; text-align: center;">Descripteurs de niveaux</th>
                </tr>
              </thead>
              <tbody>
                ${IB_GRADE_DESCRIPTORS.map(row => `
                  <tr>
                    <td style="padding: 6px; border: 1px solid #7eaac9; text-align: center; font-weight: bold; font-size: 13px; background-color: #f8fafc;">${row.grade}</td>
                    <td style="padding: 6px; border: 1px solid #7eaac9; text-align: center; font-weight: 600; background-color: #f8fafc;">${row.boundary}</td>
                    <td style="padding: 6px 10px; border: 1px solid #7eaac9; text-align: justify; line-height: 1.4; color: #1e293b;">${escapeHtml(row.descriptor)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Tableau 2 : Les approches de l'apprentissage (ATL) -->
          <div>
            <table class="table-border" style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr class="table-blue-header" style="font-weight: bold;">
                  <th colspan="3" style="padding: 8px; text-align: center; border: 1px solid #7eaac9; font-size: 13px; color: #0f3f63;">
                    Les approches de l’apprentissage (ATL)
                  </th>
                </tr>
              </thead>
              <tbody>
                ${ATL_DESCRIPTORS.map(atl => `
                  <tr>
                    <td style="padding: 6px; border: 1px solid #7eaac9; text-align: center; font-weight: bold; font-size: 13px; width: 44px; background-color: #f8fafc;">${atl.code}</td>
                    <td style="padding: 6px 8px; border: 1px solid #7eaac9; font-weight: 600; width: 140px; color: #0f172a;">${escapeHtml(atl.label)}</td>
                    <td style="padding: 6px 10px; border: 1px solid #7eaac9; line-height: 1.4; color: #334155;">${escapeHtml(atl.description)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        ${renderFooterHtml('1')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 3 : MATRICE ATL GÉNÉRALE + MATIÈRE 1 (Français)
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div>
          <div style="text-align: center; margin: 8px 0 12px 0;">
            <h2 style="font-size: 15px; font-weight: bold; color: #1a5b88; letter-spacing: 0.4px; margin: 0;">
              Critères Initiaux (Compétences Approche de l'Apprentissage)
            </h2>
          </div>

          <!-- Grand tableau des compétences ATL -->
          <table class="table-border" style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
            <thead>
              <tr class="table-blue-header" style="font-weight: bold; text-align: center;">
                <th style="padding: 6px 8px; border: 1px solid #7eaac9; text-align: left;">Groupes de matières</th>
                <th style="padding: 6px; border: 1px solid #7eaac9; width: 85px;">Communication</th>
                <th style="padding: 6px; border: 1px solid #7eaac9; width: 85px;">Collaboration</th>
                <th style="padding: 6px; border: 1px solid #7eaac9; width: 85px;">Autogestion</th>
                <th style="padding: 6px; border: 1px solid #7eaac9; width: 85px;">Recherche</th>
                <th style="padding: 6px; border: 1px solid #7eaac9; width: 85px;">Réflexion</th>
              </tr>
            </thead>
            <tbody>
              ${BOOKLET_SUBJECTS.map(sub => {
                const ratings = booklet.atlBySubject?.[sub] || {
                  communication: 'A', collaboration: 'E', autogestion: 'E', recherche: 'A', reflexion: 'A',
                };
                return `
                  <tr style="text-align: center;">
                    <td style="padding: 5px 8px; border: 1px solid #7eaac9; text-align: left; font-weight: 500; color: #0f172a;">${escapeHtml(sub)}</td>
                    <td style="padding: 5px; border: 1px solid #7eaac9; font-weight: bold;">${ratings.communication || 'A'}</td>
                    <td style="padding: 5px; border: 1px solid #7eaac9; font-weight: bold;">${ratings.collaboration || 'A'}</td>
                    <td style="padding: 5px; border: 1px solid #7eaac9; font-weight: bold;">${ratings.autogestion || 'A'}</td>
                    <td style="padding: 5px; border: 1px solid #7eaac9; font-weight: bold;">${ratings.recherche || 'A'}</td>
                    <td style="padding: 5px; border: 1px solid #7eaac9; font-weight: bold;">${ratings.reflexion || 'A'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <!-- Matière 1 : Langue et littérature (Français) -->
          ${renderSubjectBlockHtml('Langue et littérature (Français)', booklet.subjects?.['Langue et littérature (Français)'])}
        </div>

        ${renderFooterHtml('2')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 4 : MATIÈRES 2 & 3 (Arabe & Anglais)
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div>
          ${renderSubjectBlockHtml('Acquisition de langue (اللغة العربية)', booklet.subjects?.['Acquisition de langue (اللغة العربية)'], true)}
          <div style="height: 14px;"></div>
          ${renderSubjectBlockHtml('Acquisition de langues (Anglais)', booklet.subjects?.['Acquisition de langues (Anglais)'])}
        </div>

        ${renderFooterHtml('3')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 5 : MATIÈRES 4 & 5 (Individus et Sociétés & Sciences)
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div>
          ${renderSubjectBlockHtml('Individus et sociétés', booklet.subjects?.['Individus et sociétés'])}
          <div style="height: 14px;"></div>
          ${renderSubjectBlockHtml('Sciences', booklet.subjects?.['Sciences'])}
        </div>

        ${renderFooterHtml('4')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 6 : MATIÈRES 6 & 7 (Mathématiques & Art visuel)
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div>
          ${renderSubjectBlockHtml('Mathématiques', booklet.subjects?.['Mathématiques'])}
          <div style="height: 14px;"></div>
          ${renderSubjectBlockHtml('Art visuel', booklet.subjects?.['Art visuel'])}
        </div>

        ${renderFooterHtml('5')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 7 : MATIÈRES 8 & 9 (EPS & Design)
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div>
          ${renderSubjectBlockHtml('Éducation physique et sportive', booklet.subjects?.['Éducation physique et sportive'])}
          <div style="height: 14px;"></div>
          ${renderSubjectBlockHtml('Design', booklet.subjects?.['Design'])}
        </div>

        ${renderFooterHtml('6')}
        ${cornerDecorHtml}
      </div>

      <!-- ═══════════════════════════════════════════════════════════════════════
           PAGE 8 : SIGNATURES ET COMMENTAIRES DE FIN D'ANNÉE
           ═══════════════════════════════════════════════════════════════════════ -->
      <div class="booklet-page">
        <div style="padding-top: 10px;">
          <table class="table-border" style="width: 100%; border-collapse: collapse; margin-top: 24px;">
            <thead>
              <tr style="background-color: #0d83be; color: #ffffff; font-weight: bold; text-align: center;">
                <th colspan="2" style="padding: 10px; border: 1px solid #0d83be; text-transform: uppercase; letter-spacing: 1px; font-size: 13.5px;">
                  SIGNATURE ET COMMENTAIRE
                </th>
              </tr>
              <tr class="table-blue-header" style="font-weight: bold; text-align: center; font-size: 12px;">
                <th style="padding: 8px; border: 1px solid #7eaac9; width: 50%;">Le Directeur</th>
                <th style="padding: 8px; border: 1px solid #7eaac9; width: 50%;">Les parents</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 18px; border: 1px solid #7eaac9; height: 260px; vertical-align: top; font-size: 12px; color: #334155;">
                  <p style="font-style: italic; color: #64748b; margin-bottom: 8px;">Commentaires et visa de la direction :</p>
                  ${booklet.directorComment ? `<p style="color: #0f172a; line-height: 1.6;">${escapeHtml(booklet.directorComment)}</p>` : ''}
                  <div style="margin-top: 100px; padding-top: 10px; border-top: 1px dashed #cbd5e1; text-align: right; font-size: 11px; color: #94a3b8;">
                    Cachet et signature de l'école
                  </div>
                </td>
                <td style="padding: 18px; border: 1px solid #7eaac9; height: 260px; vertical-align: top; font-size: 12px; color: #334155;">
                  <p style="font-style: italic; color: #64748b; margin-bottom: 8px;">Observations des parents :</p>
                  ${booklet.parentComment ? `<p style="color: #0f172a; line-height: 1.6;">${escapeHtml(booklet.parentComment)}</p>` : ''}
                  <div style="margin-top: 100px; padding-top: 10px; border-top: 1px dashed #cbd5e1; text-align: right; font-size: 11px; color: #94a3b8;">
                    Signature des parents
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        ${renderFooterHtml('7')}
        ${cornerDecorHtml}
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    @page {
      size: A4 portrait;
      margin: 0mm;
    }
    html, body {
      width: 210mm;
      margin: 0 auto;
      padding: 0;
      background: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .booklet-page {
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
      height: 297mm;
      max-height: 297mm;
      padding: 13mm 16mm 16mm 16mm;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .booklet-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .header-blue-card {
      background-color: #a3c4dc !important;
      color: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .tab-blue-label {
      background-color: #0d83be !important;
      color: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .table-blue-header {
      background-color: #a3c4dc !important;
      color: #0f3f63 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .table-border {
      border: 1px solid #7eaac9 !important;
      border-collapse: collapse !important;
    }
    .table-border th, .table-border td {
      border: 1px solid #7eaac9 !important;
    }
    .page-corner-decor {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 140px;
      height: 140px;
      pointer-events: none;
      background: linear-gradient(135deg, transparent 65%, #c5e0f1 65%, #9bc4e2 100%) !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media print {
      html, body {
        width: 100% !important;
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .booklet-page {
        width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        padding: 13mm 16mm 16mm 16mm !important;
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }
      .booklet-page:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
    }
  </style>
</head>
<body>
  ${pagesHtml}
  ${options?.autoPrint ? `<script>window.onload = function() { setTimeout(function() { window.focus(); window.print(); }, 350); };</script>` : ''}
</body>
</html>`;
}

export const StudentBookletPrintModal: React.FC<StudentBookletPrintModalProps> = ({
  isOpen,
  onClose,
  booklets,
  initialIndex = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [printScope, setPrintScope] = useState<'current' | 'all'>(() => {
    return booklets.length > 1 ? 'all' : 'current';
  });
  const [isPrinting, setIsPrinting] = useState(false);

  const printIframeRef = useRef<HTMLIFrameElement>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentIndex(initialIndex);
    if (booklets.length > 1) {
      setPrintScope('all');
    } else {
      setPrintScope('current');
    }
  }, [initialIndex, booklets.length]);

  if (!isOpen || booklets.length === 0) return null;

  const currentBooklet = booklets[currentIndex] || booklets[0];

  const handlePrint = (scope: 'current' | 'all' = printScope) => {
    setIsPrinting(true);
    const targetBooklets = scope === 'all' && booklets.length > 1 ? booklets : [currentBooklet];
    const gradeClean = currentBooklet.grade?.toUpperCase().replace(/\s+/g, '') || 'PEI4';
    const suggestedTitle = scope === 'all' && booklets.length > 1
      ? `Livrets_PEI_${gradeClean}_Classe_Complete_${booklets.length}_Eleves`
      : `Livret_PEI_${gradeClean}_${currentBooklet.studentName.replace(/\s+/g, '_')}_${(currentBooklet.term || 'Semestre_1').replace(/\s+/g, '_')}`;

    // Mettre à jour temporairement le titre de la page pour le dialogue d'enregistrement PDF
    const originalTitle = document.title;
    document.title = suggestedTitle;

    const fullHtml = generateBookletPrintHtml(targetBooklets, { title: suggestedTitle });
    const iframe = printIframeRef.current;

    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(fullHtml);
        doc.close();

        // Laisser les images et polices s'initialiser avant de déclencher l'impression
        setTimeout(() => {
          try {
            if (iframe.contentWindow) {
              iframe.contentWindow.focus();
              iframe.contentWindow.print();
            }
          } catch (e) {
            console.warn('Impression iframe repliée vers fenêtre principale:', e);
            window.print();
          } finally {
            setIsPrinting(false);
            setTimeout(() => {
              document.title = originalTitle;
            }, 3000);
          }
        }, 400);
        return;
      }
    }

    // Fallback natif si l'iframe n'est pas accessible
    window.print();
    setIsPrinting(false);
    setTimeout(() => {
      document.title = originalTitle;
    }, 3000);
  };

  const handleDownloadHtml = () => {
    const targetBooklets = printScope === 'all' && booklets.length > 1 ? booklets : [currentBooklet];
    const gradeClean = currentBooklet.grade?.toUpperCase().replace(/\s+/g, '') || 'PEI4';
    const filename = printScope === 'all' && booklets.length > 1
      ? `Livrets_PEI_${gradeClean}_Classe_Entiere_${booklets.length}_eleves.html`
      : `Livret_PEI_${gradeClean}_${currentBooklet.studentName.replace(/\s+/g, '_')}.html`;

    const htmlContent = generateBookletPrintHtml(targetBooklets, { autoPrint: false, title: filename.replace('.html', '') });
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="booklet-modal-container fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex flex-col justify-between overflow-hidden">
      {/* Top action toolbar (cachée à l'impression) */}
      <div className="bg-slate-900 text-white px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white shrink-0">
            <Award size={20} />
          </div>
          <div>
            <h2 className="font-bold text-sm md:text-base text-white flex items-center gap-2">
              <span>Livret Scolaire PEI Officiel — 8 Pages A4</span>
              <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700">
                Design HTML Conforme
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {currentBooklet.studentName} ({currentBooklet.grade} • {currentBooklet.schoolYear} • {currentBooklet.term})
            </p>
          </div>
        </div>

        {/* Options de sélection : Élève & Portée d'impression */}
        <div className="flex flex-wrap items-center gap-2">
          {booklets.length > 1 && (
            <>
              {/* Sélecteur de portée */}
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setPrintScope('current')}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    printScope === 'current'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Imprimer uniquement les 8 pages de l'élève affiché"
                >
                  Cet élève (8 pages)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('all')}
                  className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                    printScope === 'all'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Imprimer en continu tous les livrets de la classe"
                >
                  <Layers size={13} />
                  <span>Toute la classe ({booklets.length} élèves • {booklets.length * 8} p.)</span>
                </button>
              </div>

              {/* Navigation entre élèves */}
              <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Élève précédent"
                >
                  <ChevronLeft size={16} />
                </button>
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
                <button
                  type="button"
                  onClick={() => setCurrentIndex(prev => Math.min(booklets.length - 1, prev + 1))}
                  disabled={currentIndex === booklets.length - 1}
                  className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                  title="Élève suivant"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {/* Bouton Télécharger HTML autonome */}
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-semibold rounded-xl transition"
            title="Télécharger le fichier HTML complet autonome pour l'ouvrir ou l'imprimer hors-ligne"
          >
            <Download size={15} />
            <span>Télécharger HTML (Prêt pour PDF)</span>
          </button>

          {/* Bouton principal : Impression / Export PDF */}
          <button
            type="button"
            onClick={() => handlePrint()}
            disabled={isPrinting}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl shadow-md transition disabled:opacity-50"
            title="Ouvre la boîte d'impression du navigateur (Choisir 'Enregistrer au format PDF' ou une imprimante A4)"
          >
            <Printer size={16} />
            <span>
              {printScope === 'all' && booklets.length > 1
                ? `Imprimer Toute la Classe (${booklets.length} élèves • ${booklets.length * 8} pages)`
                : 'Imprimer / Exporter PDF (8 pages)'}
            </span>
          </button>

          {/* Fermer */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition ml-1"
            title="Fermer l'aperçu"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Zone de prévisualisation à l'écran */}
      <div className="booklet-scroll-area flex-1 overflow-y-auto p-4 md:p-8 bg-slate-800 flex justify-center print:p-0 print:bg-white print:overflow-visible">
        <div ref={printContainerRef} className="booklet-print-document max-w-[210mm] w-full text-slate-900">
          <SingleStudentBookletView booklet={currentBooklet} />
        </div>
      </div>

      {/* Iframe caché dédié à l'impression parfaite multi-pages sans coupure */}
      <iframe
        ref={printIframeRef}
        className="print-hidden-frame"
        style={{
          position: 'fixed',
          right: '100%',
          bottom: '100%',
          width: '210mm',
          height: '297mm',
          border: 'none',
          opacity: 0,
          pointerEvents: 'none',
        }}
        title="Iframe Impression Livret"
      />

      {/* Styles d'impression et de rendu */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0mm;
        }

        .booklet-page {
          background: #ffffff;
          width: 210mm;
          min-height: 297mm;
          height: 297mm;
          padding: 14mm 16mm 16mm 16mm;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          border-radius: 4px;
          position: relative;
          box-sizing: border-box;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
        }

        .header-blue-card {
          background-color: #a3c4dc !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .tab-blue-label {
          background-color: #0d83be !important;
          color: white !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .table-blue-header {
          background-color: #a3c4dc !important;
          color: #0f3f63 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .table-border {
          border: 1px solid #7eaac9 !important;
          border-collapse: collapse !important;
        }
        .table-border th, .table-border td {
          border: 1px solid #7eaac9 !important;
        }
        .page-corner-decor {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 140px;
          height: 140px;
          pointer-events: none;
          background: linear-gradient(135deg, transparent 65%, #c5e0f1 65%, #9bc4e2 100%) !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        @media print {
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .booklet-modal-container {
            position: static !important;
            inset: auto !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .booklet-scroll-area {
            overflow: visible !important;
            padding: 0 !important;
            background: transparent !important;
          }
          .booklet-page {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 13mm 16mm 16mm 16mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            position: relative !important;
            overflow: hidden !important;
          }
          .booklet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>
    </div>
  );
};

// ── Vue individuelle d'un livret complet (8 Pages A4) pour l'affichage écran ──
export const SingleStudentBookletView: React.FC<{ booklet: StudentBooklet }> = ({ booklet }) => {
  const gradeClean = booklet.grade?.toUpperCase().replace(/\s+/g, '') || 'PEI4';

  const globalSchoolLogo = getGlobalSchoolLogo();
  const globalIbLogo = getGlobalIbLogo();
  const schoolLogoUrlToUse = globalSchoolLogo || booklet.schoolLogoUrl;
  const ibLogoUrlToUse = globalIbLogo || booklet.ibLogoUrl;

  const renderFooter = (pageNum: string) => (
    <div className="absolute bottom-4 left-6 right-6 pt-3 border-t border-slate-200 flex justify-between items-center bg-white">
      <span className="text-[10px] text-slate-400 font-medium">{booklet.studentName} — Livret Scolaire PEI</span>
      <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{pageNum}</span>
    </div>
  );

  return (
    <div className="space-y-6 print:space-y-0">
      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 1 : PAGE DE GARDE / COUVERTURE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
        <div>
          {/* Header avec Logos et Titre */}
          <div className="flex items-center justify-between gap-4 mt-6">
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
              <p className="text-sm font-bold text-white/95 mt-1">
                {(booklet.term === '1er trimestre' || !booklet.term) ? 'Semestre 1' : (booklet.term === '2e trimestre' || booklet.term === '3e trimestre') ? 'Semestre 2' : booklet.term}
              </p>
            </div>
          </div>

          {/* Numéro de licence */}
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
              Année scolaire : {(booklet.schoolYear && booklet.schoolYear !== '2025/2026') ? booklet.schoolYear : '2026/2027'}
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

        {renderFooter('Couverture')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 2 : TABLEAU DES NIVEAUX IB & DESCRIPTEURS ATL
           ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
        <div>
          {/* Tableau 1 : Niveaux IB & Descripteurs */}
          <div className="mb-6">
            <table className="w-full text-xs table-border border-collapse">
              <thead>
                <tr className="table-blue-header font-bold text-center">
                  <th className="p-2 border border-[#7eaac9] w-20">Niveaux IB</th>
                  <th className="p-2 border border-[#7eaac9] w-20">Limites</th>
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

        {renderFooter('1')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 3 : MATRICE ATL GÉNÉRALE + MATIÈRE 1 (Français)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
        <div>
          <div className="text-center my-4">
            <h2 className="text-base font-bold text-[#1a5b88] tracking-wide">
              Critères Initiaux (Compétences Approche de l'Apprentissage)
            </h2>
          </div>

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

          <SubjectEvaluationBlock
            subjectName="Langue et littérature (Français)"
            report={booklet.subjects?.['Langue et littérature (Français)']}
          />
        </div>

        {renderFooter('2')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 4 : MATIÈRES 2 & 3 (Arabe & Anglais)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
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

        {renderFooter('3')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 5 : MATIÈRES 4 & 5 (Individus et Sociétés & Sciences)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
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

        {renderFooter('4')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 6 : MATIÈRES 6 & 7 (Mathématiques & Art visuel)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
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

        {renderFooter('5')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 7 : MATIÈRES 8 & 9 (EPS & Design)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
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

        {renderFooter('6')}
        <div className="page-corner-decor" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PAGE 8 : SIGNATURES ET COMMENTAIRES DE FIN D'ANNÉE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="booklet-page">
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

        {renderFooter('7')}
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
              Descripteurs de niveaux /8
              <div className="grid grid-cols-2 text-[10px] font-normal border-t border-[#7eaac9] mt-1 pt-0.5">
                <span>Semestre 1</span>
                <span>Semestre 2</span>
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
        <div className={`p-3 text-xs text-slate-800 leading-relaxed min-h-[60px] ${isRtl ? 'text-right font-arabic' : 'text-justify'}`}>
          {report?.observations || (
            <span className="italic text-slate-400">Aucune observation enregistrée pour cette matière.</span>
          )}
        </div>
      </div>
    </div>
  );
};
