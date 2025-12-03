/**
 * LEVEL SYSTEM
 * ============
 * Gère le système de niveaux et de gamification
 */

import { LEVEL_CONFIG, STORAGE_KEYS } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';

export class LevelSystem {
  constructor(elements) {
    this.elements = elements;
    this.currentPoints = 0;
    this.currentLevel = 1;
  }

  /**
   * Charge les données depuis le storage
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.USER_POINTS,
        STORAGE_KEYS.USER_LEVEL
      ]);

      this.currentPoints = result[STORAGE_KEYS.USER_POINTS] || 0;
      this.currentLevel = result[STORAGE_KEYS.USER_LEVEL] || 1;

      this.updateUI();

      Logger.debug('Données de niveau chargées', {
        points: this.currentPoints,
        level: this.currentLevel
      });

    } catch (error) {
      Logger.error('Erreur lors du chargement des données de niveau', error);
    }
  }

  /**
   * Sauvegarde les données dans le storage
   */
  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.USER_POINTS]: this.currentPoints,
        [STORAGE_KEYS.USER_LEVEL]: this.currentLevel
      });

      Logger.debug('Données de niveau sauvegardées');

    } catch (error) {
      Logger.error('Erreur lors de la sauvegarde des données de niveau', error);
    }
  }

  /**
   * Ajoute des points et met à jour le niveau si nécessaire
   * @param {number} points - Points à ajouter
   */
  async addPoints(points) {
    if (points <= 0) return;

    const oldLevel = this.currentLevel;
    this.currentPoints += points;

    // Calculer le nouveau niveau
    this.currentLevel = this._calculateLevel(this.currentPoints);

    // Vérifier si on a monté de niveau
    if (this.currentLevel > oldLevel) {
      this._onLevelUp(oldLevel, this.currentLevel);
    }

    // Mettre à jour l'UI
    this.updateUI();

    // Sauvegarder
    await this.saveToStorage();

    Logger.info(`💰 +${points} points`, {
      total: this.currentPoints,
      level: this.currentLevel
    });
  }

  /**
   * Calcule le niveau à partir des points
   * @private
   */
  _calculateLevel(points) {
    for (const threshold of LEVEL_CONFIG.LEVEL_THRESHOLDS) {
      if (points >= threshold.minPoints && points < threshold.maxPoints) {
        return threshold.level;
      }
    }
    
    // Si on dépasse tous les seuils, retourner le niveau max
    return LEVEL_CONFIG.LEVEL_THRESHOLDS[LEVEL_CONFIG.LEVEL_THRESHOLDS.length - 1].level;
  }

  /**
   * Récupère les infos du seuil de niveau actuel
   * @private
   */
  _getCurrentThreshold() {
    return LEVEL_CONFIG.LEVEL_THRESHOLDS.find(t => t.level === this.currentLevel);
  }

  /**
   * Récupère les infos du prochain niveau
   * @private
   */
  _getNextThreshold() {
    return LEVEL_CONFIG.LEVEL_THRESHOLDS.find(t => t.level === this.currentLevel + 1);
  }

  /**
   * Callback appelé quand on monte de niveau
   * @private
   */
  _onLevelUp(oldLevel, newLevel) {
    Logger.info(`🎉 LEVEL UP! ${oldLevel} → ${newLevel}`);
    
    // TODO: Afficher une animation/notification
    // TODO: Débloquer des badges si applicable
    
    // Pour l'instant, juste un log
    console.log(`
      ╔════════════════════════════╗
      ║   🎉 LEVEL UP! 🎉         ║
      ║   Level ${oldLevel} → Level ${newLevel}        ║
      ╚════════════════════════════╝
    `);
  }

  /**
   * Met à jour l'interface utilisateur
   */
  updateUI() {
    const currentThreshold = this._getCurrentThreshold();
    const nextThreshold = this._getNextThreshold();

    if (!currentThreshold) return;

    // Calculer la progression
    const pointsInLevel = this.currentPoints - currentThreshold.minPoints;
    const pointsNeeded = nextThreshold 
      ? nextThreshold.minPoints - currentThreshold.minPoints
      : 0;
    const progressPercent = nextThreshold 
      ? Math.min(100, (pointsInLevel / pointsNeeded) * 100)
      : 100;

    // Mettre à jour le badge
    if (this.elements.badgeElement) {
      this.elements.badgeElement.textContent = this.currentLevel;
    }

    // Mettre à jour le titre
    if (this.elements.titleElement) {
      this.elements.titleElement.textContent = `Level ${this.currentLevel}`;
    }

    // Mettre à jour le sous-titre
    if (this.elements.subtitleElement) {
      if (nextThreshold) {
        const pointsToNext = nextThreshold.minPoints - this.currentPoints;
        this.elements.subtitleElement.textContent = `${pointsToNext} points to next level`;
      } else {
        this.elements.subtitleElement.textContent = 'Niveau maximum atteint!';
      }
    }

    // Mettre à jour la barre de progression
    if (this.elements.progressFillElement) {
      this.elements.progressFillElement.style.width = `${progressPercent}%`;
    }

    // Mettre à jour les labels
    if (this.elements.currentLevelElement) {
      this.elements.currentLevelElement.textContent = this.currentLevel;
    }

    if (this.elements.nextLevelElement && nextThreshold) {
      this.elements.nextLevelElement.textContent = nextThreshold.level;
    }

    if (this.elements.scoreElement) {
      if (nextThreshold) {
        this.elements.scoreElement.textContent = 
          `★ ${this.currentPoints}/${nextThreshold.minPoints}`;
      } else {
        this.elements.scoreElement.textContent = `★ ${this.currentPoints}`;
      }
    }
  }

  /**
   * Obtient les points actuels
   * @returns {number}
   */
  getPoints() {
    return this.currentPoints;
  }

  /**
   * Obtient le niveau actuel
   * @returns {number}
   */
  getLevel() {
    return this.currentLevel;
  }

  /**
   * Obtient les statistiques complètes
   * @returns {Object}
   */
  getStatistics() {
    const currentThreshold = this._getCurrentThreshold();
    const nextThreshold = this._getNextThreshold();

    return {
      points: this.currentPoints,
      level: this.currentLevel,
      pointsInLevel: this.currentPoints - (currentThreshold?.minPoints || 0),
      pointsToNextLevel: nextThreshold 
        ? nextThreshold.minPoints - this.currentPoints 
        : 0,
      progressPercent: this._calculateProgressPercent()
    };
  }

  /**
   * Calcule le pourcentage de progression
   * @private
   */
  _calculateProgressPercent() {
    const currentThreshold = this._getCurrentThreshold();
    const nextThreshold = this._getNextThreshold();

    if (!currentThreshold || !nextThreshold) return 100;

    const pointsInLevel = this.currentPoints - currentThreshold.minPoints;
    const pointsNeeded = nextThreshold.minPoints - currentThreshold.minPoints;

    return Math.min(100, (pointsInLevel / pointsNeeded) * 100);
  }

  /**
   * Réinitialise les points et le niveau (pour debug/test)
   */
  async reset() {
    this.currentPoints = 0;
    this.currentLevel = 1;
    this.updateUI();
    await this.saveToStorage();
    
    Logger.warn('🔄 Niveau et points réinitialisés');
  }
}