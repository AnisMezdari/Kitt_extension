/**
 * SESSION STATE MONITOR
 * =====================
 * Synchronise l'état de la session avec le backend
 */

import { Logger } from '../../utils/logger.js';

export class SessionStateMonitor {
  constructor(sessionService) {
    if (!sessionService) {
      throw new Error('SessionStateMonitor: sessionService est requis');
    }

    this.sessionService = sessionService;
    this.pollingInterval = null;
    this.pollingFrequency = 10000; // 10 secondes
    this.onStateUpdateCallback = null;
    this.lastState = null;

    Logger.debug('✓ SessionStateMonitor initialisé');
  }

  /**
   * Démarre la synchronisation de l'état de session
   * @param {Function} onStateUpdate - Callback appelé lors de chaque mise à jour
   */
  startMonitoring(onStateUpdate) {
    if (this.pollingInterval) {
      Logger.warn('⚠️ Monitoring déjà actif');
      return;
    }

    this.onStateUpdateCallback = onStateUpdate;

    Logger.info('[SESSION MONITOR] 🎬 Démarrage de la synchronisation');

    // Récupérer l'état immédiatement
    this._fetchAndUpdate();

    // Puis toutes les 10 secondes
    this.pollingInterval = setInterval(() => {
      this._fetchAndUpdate();
    }, this.pollingFrequency);
  }

  /**
   * Arrête la synchronisation
   */
  stopMonitoring() {
    if (!this.pollingInterval) {
      return;
    }

    Logger.info('[SESSION MONITOR] 🛑 Arrêt de la synchronisation');

    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
    this.lastState = null;
  }

  /**
   * Récupère l'état et notifie le callback
   * @private
   */
  async _fetchAndUpdate() {
    try {
      // Vérifier qu'une session est active
      if (!this.sessionService.hasActiveSession()) {
        Logger.debug('Aucune session active, skip polling');
        return;
      }

      // Récupérer l'état depuis le backend
      const state = await this.sessionService.getSessionState();

      if (!state) {
        Logger.warn('État de session vide');
        return;
      }

      // Vérifier les changements
      const hasChanges = this._detectChanges(state);

      if (hasChanges) {
        Logger.debug('[SESSION MONITOR] 🔄 Changements détectés', {
          phase: state.conversation_phase,
          insightCount: state.insight_count,
          messageCount: state.total_message_count
        });

        // Notifier le callback
        if (this.onStateUpdateCallback) {
          this.onStateUpdateCallback(state);
        }
      }

      // Sauvegarder l'état
      this.lastState = state;

    } catch (error) {
      // Ne pas loguer comme erreur critique, car c'est un polling régulier
      Logger.debug('Erreur lors de la récupération de l\'état', error.message);
    }
  }

  /**
   * Détecte les changements entre deux états
   * @private
   */
  _detectChanges(newState) {
    if (!this.lastState) {
      return true; // Premier fetch
    }

    // Comparer les propriétés importantes
    return (
      this.lastState.conversation_phase !== newState.conversation_phase ||
      this.lastState.insight_count !== newState.insight_count ||
      this.lastState.total_message_count !== newState.total_message_count ||
      JSON.stringify(this.lastState.pain_points) !== JSON.stringify(newState.pain_points)
    );
  }

  /**
   * Récupère le dernier état connu
   * @returns {Object|null}
   */
  getLastState() {
    return this.lastState;
  }

  /**
   * Vérifie si le monitoring est actif
   * @returns {boolean}
   */
  isMonitoring() {
    return this.pollingInterval !== null;
  }

  /**
   * Change la fréquence de polling
   * @param {number} frequencyMs - Fréquence en millisecondes
   */
  setPollingFrequency(frequencyMs) {
    if (frequencyMs < 5000) {
      Logger.warn('Fréquence trop basse, minimum 5s');
      return;
    }

    this.pollingFrequency = frequencyMs;

    // Redémarrer le polling si actif
    if (this.pollingInterval) {
      this.stopMonitoring();
      this.startMonitoring(this.onStateUpdateCallback);
    }
  }
}
