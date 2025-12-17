/**
 * INSIGHTS MANAGER
 * ================
 * Gère l'affichage, le cache et la validation des insights en temps réel
 */

import {
  INSIGHT_TYPES,
  INSIGHT_VISUAL_CONFIG,
  UI_CONFIG,
  VALID_INSIGHT_TYPES
} from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';
// ✅ CORRECTION: Imports supprimés car non utilisés après optimisation
// - THROTTLING_CONFIG: Le backend gère le throttling
// - calculateSimilarity: La détection de doublons est côté backend

export class InsightsManager {
  constructor(containerElement, emptyStateElement) {
    // 🆕 VALIDATION DES ÉLÉMENTS
    if (!containerElement) {
      throw new Error('InsightsManager: containerElement est requis et ne peut pas être null');
    }
    
    if (!emptyStateElement) {
      throw new Error('InsightsManager: emptyStateElement est requis et ne peut pas être null');
    }
    
    this.container = containerElement;
    this.emptyState = emptyStateElement;
    this.displayedInsights = [];
    this.lastAdviceTime = 0;
    
    Logger.debug('✓ InsightsManager initialisé', {
      containerId: this.container.id,
      emptyStateId: this.emptyState.id
    });
  }

  /**
   * Affiche un insight s'il passe toutes les validations
   * @param {Object} advice - L'insight à afficher
   * @returns {boolean} True si affiché, false sinon
   */
  displayInsight(advice) {
    Logger.info('🎯 InsightsManager.displayInsight appelé', advice);

    const now = Date.now();

    // Validation de la structure (seule validation côté client)
    if (!this._validateInsightStructure(advice)) {
      Logger.warn('⚠️ Structure d\'insight invalide', advice);
      return false;
    }

    // ✅ CORRECTION: Suppression des validations redondantes
    // Le backend gère déjà :
    // - Throttling/Cooldown (10-25s selon pertinence)
    // - Détection sémantique de doublons (embeddings + cosine similarity)
    // - Validation de la pertinence (score 0-100)
    // Ces vérifications côté client étaient inutiles et incohérentes

    // Afficher l'insight directement
    Logger.info('✅ Validation passée, affichage de l\'insight');
    this._renderInsight(advice, now);
    this.lastAdviceTime = now;

    return true;
  }

  /**
   * Valide la structure de l'insight
   * @private
   */
  _validateInsightStructure(advice) {
    if (!advice || typeof advice !== 'object') {
      return false;
    }

    // Valider le type
    if (!advice.type || !VALID_INSIGHT_TYPES.includes(advice.type)) {
      Logger.warn(`Type invalide: ${advice.type}. Utilisation de "progression"`);
      advice.type = INSIGHT_TYPES.PROGRESSION;
    }

    // Valider le titre
    if (!advice.title || typeof advice.title !== 'string') {
      Logger.warn('Titre manquant ou invalide');
      return false;
    }

    // Valider les détails
    if (!advice.details || typeof advice.details !== 'object') {
      advice.details = {};
    }

    if (!advice.details.description) {
      advice.details.description = 'Aucune description disponible';
    }

    return true;
  }

  // ✅ MÉTHODES SUPPRIMÉES: _checkGlobalThrottling, _isDuplicate, _checkTypeThrottling
  // Ces validations étaient redondantes avec le backend qui gère déjà:
  // - Cooldowns adaptatifs (10-25s selon score de pertinence)
  // - Détection sémantique de doublons avec sentence-transformers
  // - Scoring de pertinence multi-facteurs (0-100)
  // La suppression de ces méthodes améliore les performances et élimine les incohérences

  /**
   * Rend l'insight dans le DOM
   * @private
   */
  _renderInsight(advice, timestamp) {
    // Ajouter au cache (max 10 insights, aligné avec le backend)
    const MAX_CACHED_INSIGHTS = 10;
    this.displayedInsights.push(advice);
    if (this.displayedInsights.length > MAX_CACHED_INSIGHTS) {
      this.displayedInsights = this.displayedInsights.slice(-MAX_CACHED_INSIGHTS);
    }

    // Retirer la classe "new-insight" des anciens
    this.container.querySelectorAll('.advice-item').forEach(item => {
      item.classList.remove('new-insight');
    });

    // Masquer l'état vide
    this.emptyState.style.display = 'none';

    // Créer l'élément
    const adviceItem = this._createInsightElement(advice, timestamp);
    
    // Ajouter au conteneur
    this.container.appendChild(adviceItem);
    
    // Animer l'apparition
    requestAnimationFrame(() => {
      adviceItem.classList.add('show');
      
      setTimeout(() => {
        try {
          adviceItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch (e) {
          this.container.scrollTop = this.container.scrollHeight;
        }
      }, 20);
    });

    // Retirer l'animation après 5s
    setTimeout(() => {
      adviceItem.classList.remove('new-insight');
    }, UI_CONFIG.NEW_INSIGHT_ANIMATION_DURATION);

    // Programmer la suppression automatique
    this._scheduleAutoRemoval(adviceItem);

    // Log
    const typeConfig = INSIGHT_VISUAL_CONFIG[advice.type];
    Logger.info(`[INSIGHT] Affiché: ${typeConfig.label} - ${advice.title}`);
  }

  /**
   * Crée l'élément DOM pour un insight
   * @private
   */
  _createInsightElement(advice, timestamp) {
    const typeConfig = INSIGHT_VISUAL_CONFIG[advice.type];
    
    const adviceItem = document.createElement('div');
    adviceItem.className = 'advice-item new-insight';
    adviceItem.setAttribute('data-timestamp', timestamp.toString());
    adviceItem.setAttribute('data-type', advice.type);

    const iconUrl = chrome.runtime.getURL(typeConfig.iconPath);

    adviceItem.innerHTML = `
      <div class="advice-icon-container">
        <img src="${iconUrl}" alt="${typeConfig.label}" class="advice-icon-image">
      </div>
      <div class="advice-text-content">
        <div class="advice-compact-title">${advice.title}</div>
        <p class="advice-compact-description">${advice.details.description}</p>
      </div>
      <button class="advice-menu-btn" aria-label="Options">⋮</button>
    `;

    return adviceItem;
  }

  /**
   * Programme la suppression automatique d'un insight
   * @private
   */
  _scheduleAutoRemoval(element) {
    setTimeout(() => {
      element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      element.style.opacity = '0';
      element.style.transform = 'translateX(-30px)';
      
      setTimeout(() => {
        element.remove();
        
        // Afficher l'état vide si plus d'insights
        if (this.container.querySelectorAll('.advice-item').length === 0) {
          this.emptyState.style.display = 'block';
        }
      }, 500);
    }, UI_CONFIG.INSIGHT_DISPLAY_DURATION);
  }

  /**
   * Efface tous les insights affichés
   * @param {boolean} animated - Si true, anime la suppression
   */
  clearAllInsights(animated = true) {
    const insights = this.container.querySelectorAll('.advice-item');
    
    if (insights.length === 0) {
      Logger.info('Aucun insight à effacer');
      return;
    }

    if (!animated) {
      insights.forEach(insight => insight.remove());
      this.displayedInsights = [];
      this.emptyState.style.display = 'block';
      Logger.info('[RESET] Tous les insights ont été effacés');
      return;
    }

    // Animation en cascade
    insights.forEach((insight, index) => {
      setTimeout(() => {
        insight.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        insight.style.opacity = '0';
        insight.style.transform = 'translateX(-30px)';
        
        setTimeout(() => {
          insight.remove();
          
          // Afficher l'état vide si c'était le dernier
          if (index === insights.length - 1) {
            this.emptyState.style.display = 'block';
          }
        }, 300);
      }, index * UI_CONFIG.CASCADE_ANIMATION_DELAY);
    });

    // Vider le cache
    this.displayedInsights = [];
    
    Logger.info('[RESET] Tous les insights ont été effacés');
  }

  /**
   * Obtient le nombre d'insights affichés
   * @returns {number}
   */
  getInsightCount() {
    return this.container.querySelectorAll('.advice-item').length;
  }

  /**
   * Obtient les statistiques des insights
   * @returns {Object}
   */
  getStatistics() {
    const insights = this.container.querySelectorAll('.advice-item');
    const stats = {
      total: insights.length,
      byType: {
        [INSIGHT_TYPES.PROGRESSION]: 0,
        [INSIGHT_TYPES.OPPORTUNITY]: 0,
        [INSIGHT_TYPES.ALERT]: 0
      }
    };

    insights.forEach(insight => {
      const type = insight.getAttribute('data-type');
      if (stats.byType[type] !== undefined) {
        stats.byType[type]++;
      }
    });

    return stats;
  }
}