/**
 * REPORT GENERATOR
 * ================
 * Génère et affiche les comptes-rendus d'appel
 */

import { API_CONFIG, ERROR_MESSAGES } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';
import { replaceAsterisks } from '../../utils/helpers.js';

export class ReportGenerator {
  constructor(reportDataElement, reportLoadingElement, reportEmptyElement) {
    this.reportDataElement = reportDataElement;
    this.reportLoadingElement = reportLoadingElement;
    this.reportEmptyElement = reportEmptyElement;
  }

  /**
   * Génère un compte-rendu pour une session
   * @param {string} sessionId - ID de la session
   * @param {string} transcript - Transcription complète
   * @returns {Promise<Object>} Rapport généré
   */
  async generate(sessionId, transcript) {
    Logger.info('📊 Génération du compte-rendu', { sessionId });

    // Afficher l'état de chargement
    this._showLoading();

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.RESUME_GENERATE(sessionId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: sessionId,
            user_message: transcript || '',
            timestamp: Date.now()
          })
        }
      );

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.SUMMARY_GENERATION_FAILED);
      }

      const data = await response.json();
      
      Logger.info('✅ Compte-rendu généré avec succès');
      
      return data.summary;

    } catch (error) {
      Logger.error('❌ Erreur lors de la génération du compte-rendu', error);
      this._showError(error.message);
      throw error;
    }
  }

  /**
   * Affiche un rapport
   * @param {Object} summary - Résumé à afficher
   */
  async display(summary) {
    if (!summary) {
      Logger.warn('Aucun résumé à afficher');
      return;
    }

    Logger.info('📄 Affichage du compte-rendu');

    // Masquer le loading
    this._hideLoading();

    // Sanitizer le contenu
    const sanitizedSummary = this._sanitizeSummary(summary);

    // Générer le HTML
    const html = this._generateHTML(sanitizedSummary);

    // Afficher
    this.reportDataElement.innerHTML = html;

    // Initialiser les sections pliables du rapport
    this._initializeCollapsibles();

    Logger.info('✅ Compte-rendu affiché');
  }

  /**
   * Sanitize le résumé (remplace les astérisques, etc.)
   * @private
   */
  _sanitizeSummary(summary) {
    const sanitized = JSON.parse(JSON.stringify(summary)); // Deep clone

    // Sanitizer les textes
    if (sanitized.summary) {
      if (sanitized.summary.main) {
        sanitized.summary.main = replaceAsterisks(sanitized.summary.main);
      }
      if (sanitized.summary.details) {
        sanitized.summary.details = replaceAsterisks(sanitized.summary.details);
      }
    }

    // Sanitizer les key points
    if (sanitized.key_points) {
      if (sanitized.key_points.strengths) {
        sanitized.key_points.strengths = sanitized.key_points.strengths.map(replaceAsterisks);
      }
      if (sanitized.key_points.weaknesses) {
        sanitized.key_points.weaknesses = sanitized.key_points.weaknesses.map(replaceAsterisks);
      }
      if (sanitized.key_points.improvements) {
        sanitized.key_points.improvements = sanitized.key_points.improvements.map(replaceAsterisks);
      }
      if (sanitized.key_points.score?.comment) {
        sanitized.key_points.score.comment = replaceAsterisks(sanitized.key_points.score.comment);
      }
    }

    // Sanitizer les actions
    if (sanitized.next_actions?.actions) {
      sanitized.next_actions.actions = sanitized.next_actions.actions.map(action => ({
        ...action,
        action: replaceAsterisks(action.action),
        reason: replaceAsterisks(action.reason)
      }));
    }

    return sanitized;
  }

  /**
   * Génère le HTML du rapport
   * @private
   */
  _generateHTML(summary) {
    const keyPoints = summary.key_points || {};
    const nextActions = summary.next_actions || {};
    const mainSummary = summary.summary?.main || 'Résumé non disponible.';
    const detailedSummary = summary.summary?.details || '';

    let html = '';

    // Section Résumé
    html += `
      <div class="summary-subsection">
        <div class="subsection-header">
          <h3>📝 Résumé de l'appel</h3>
          <button class="subsection-toggle">▼</button>
        </div>
        <div class="subsection-content">
          <div style="background: rgba(124, 93, 250, 0.1); border-left: 4px solid #7C5DFA; padding: 14px; border-radius: 8px; margin-bottom: 12px;">
            <p style="margin: 0; line-height: 1.6; color: #E2E8F0;">${mainSummary}</p>
            ${detailedSummary ? `<p style="margin-top: 12px; color: #A0AEC0; font-size: 13px;">${detailedSummary}</p>` : ''}
          </div>
        </div>
      </div>
    `;

    // Section Prochaines Actions
    if (nextActions.actions?.length) {
      html += `
        <div class="summary-subsection">
          <div class="subsection-header">
            <h3>🚀 Prochaines actions</h3>
            <button class="subsection-toggle">▼</button>
          </div>
          <div class="subsection-content">
            <ul class="summary-list">
              ${nextActions.actions.map(a => `
                <li style="border-left: 3px solid #48BB78;">
                  <strong style="color: #E2E8F0;">${a.action}</strong><br>
                  <span style="color: #F6AD55; font-size: 12px;">⏰ ${a.deadline || 'Non spécifié'}</span><br>
                  <span style="color: #A0AEC0; font-size: 13px;">💡 ${a.reason || '-'}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      `;
    }

    // Section Points Clés & Évaluation
    if (keyPoints.score || keyPoints.strengths?.length || keyPoints.weaknesses?.length || keyPoints.improvements?.length) {
      html += `
        <div class="summary-subsection">
          <div class="subsection-header">
            <h3>🎯 Points clés & Évaluation</h3>
            <button class="subsection-toggle">▼</button>
          </div>
          <div class="subsection-content">
      `;

      // Score
      if (keyPoints.score) {
        html += `
          <div style="background: rgba(124, 93, 250, 0.15); border-left: 4px solid #7C5DFA; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <p style="font-size: 24px; font-weight: bold; color: #7C5DFA; margin: 0;">
              ${keyPoints.score.value}/20
            </p>
            <p style="color: #A0AEC0; font-size: 13px; margin: 4px 0 0 0;">
              ${keyPoints.score.comment || ''}
            </p>
          </div>
        `;
      }

      // Points forts
      if (keyPoints.strengths?.length) {
        html += `
          <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">✅ Points forts</p>
          <ul class="summary-list" style="margin-bottom: 16px;">
            ${keyPoints.strengths.map(s => `<li style="border-left: 3px solid #48BB78;">${s}</li>`).join('')}
          </ul>
        `;
      }

      // Points faibles
      if (keyPoints.weaknesses?.length) {
        html += `
          <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">⚠️ Points faibles</p>
          <ul class="summary-list" style="margin-bottom: 16px;">
            ${keyPoints.weaknesses.map(w => `<li style="border-left: 3px solid #E53E3E;">${w}</li>`).join('')}
          </ul>
        `;
      }

      // Axes d'amélioration
      if (keyPoints.improvements?.length) {
        html += `
          <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">🎯 Axes d'amélioration</p>
          <ul class="summary-list">
            ${keyPoints.improvements.map(i => `<li style="border-left: 3px solid #F6AD55;">${i}</li>`).join('')}
          </ul>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Initialise les sections pliables du rapport
   * @private
   */
  _initializeCollapsibles() {
    const headers = this.reportDataElement.querySelectorAll('.subsection-header');
    
    headers.forEach(header => {
      const button = header.querySelector('.subsection-toggle');
      const content = header.nextElementSibling;
      
      header.onclick = () => {
        const isCollapsed = content.classList.contains('collapsed');
        
        if (isCollapsed) {
          content.classList.remove('collapsed');
          button.textContent = '▼';
        } else {
          content.classList.add('collapsed');
          button.textContent = '▲';
        }
      };
    });
  }

  /**
   * Affiche l'état de chargement
   * @private
   */
  _showLoading() {
    this.reportEmptyElement.style.display = 'none';
    this.reportDataElement.parentElement.style.display = 'block';
    this.reportLoadingElement.style.display = 'block';
    this.reportDataElement.innerHTML = '';
  }

  /**
   * Masque l'état de chargement
   * @private
   */
  _hideLoading() {
    this.reportLoadingElement.style.display = 'none';
  }

  /**
   * Affiche une erreur
   * @private
   */
  _showError(message) {
    this._hideLoading();
    
    this.reportDataElement.innerHTML = `
      <div style="color: #FC8181; padding: 16px; background: rgba(254, 178, 178, 0.1); border-radius: 8px;">
        <p>❌ ${message}</p>
      </div>
    `;
  }
}