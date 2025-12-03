/**
 * SESSION SERVICE
 * ===============
 * Gère les sessions d'appel et les transcriptions
 */

import { API_CONFIG, ERROR_MESSAGES } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';

export class SessionService {
  constructor() {
    this.currentSessionId = null;
    this.conversationTranscript = [];
    this.sessionStartTime = null;
  }

  /**
   * Crée une nouvelle session
   * @returns {Promise<string>} ID de la session créée
   */
  async createSession() {
    Logger.session('📞 Création d\'une nouvelle session');

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CALLS_START}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.SESSION_CREATE_FAILED);
      }

      const data = await response.json();
      this.currentSessionId = data.call_id;
      this.conversationTranscript = [];
      this.sessionStartTime = Date.now();

      Logger.session('✅ Session créée', {
        sessionId: this.currentSessionId
      });

      return this.currentSessionId;

    } catch (error) {
      Logger.error('❌ Erreur lors de la création de la session', error);
      throw error;
    }
  }

  /**
   * Termine la session active
   * @returns {Promise<void>}
   */
  async endSession() {
    if (!this.currentSessionId) {
      Logger.warn('Aucune session active à terminer');
      return;
    }

    Logger.session('🔚 Fin de la session', {
      sessionId: this.currentSessionId
    });

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CALLS_END(this.currentSessionId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        Logger.warn('Erreur lors de la fermeture de la session côté serveur');
      }

      const data = await response.json();
      Logger.session('✅ Session terminée', data);

    } catch (error) {
      Logger.error('❌ Erreur lors de la fin de session', error);
    } finally {
      // Nettoyer l'état local même si la requête échoue
      const duration = this.sessionStartTime 
        ? Date.now() - this.sessionStartTime 
        : 0;
        
      Logger.session('📊 Durée de la session', {
        duration: `${(duration / 1000 / 60).toFixed(2)} minutes`,
        messagesCount: this.conversationTranscript.length
      });

      this.currentSessionId = null;
      this.conversationTranscript = [];
      this.sessionStartTime = null;
    }
  }

  /**
   * Récupère l'état de la session depuis le backend
   * @returns {Promise<Object>} État de la session
   */
  async getSessionState() {
    if (!this.currentSessionId) {
      throw new Error(ERROR_MESSAGES.NO_ACTIVE_SESSION);
    }

    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CALLS_STATE(this.currentSessionId)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error('Impossible de récupérer l\'état de la session');
      }

      const data = await response.json();
      return data;

    } catch (error) {
      Logger.error('❌ Erreur lors de la récupération de l\'état', error);
      throw error;
    }
  }

  /**
   * Ajoute une transcription à la conversation
   * @param {string} text - Texte transcrit
   */
  addTranscript(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return;
    }

    this.conversationTranscript.push(text.trim());
    
    Logger.debug('📝 Transcription ajoutée', {
      length: text.length,
      totalTranscripts: this.conversationTranscript.length
    });
  }

  /**
   * Récupère la transcription complète
   * @returns {string}
   */
  getFullTranscript() {
    return this.conversationTranscript.join('\n');
  }

  /**
   * Récupère l'ID de la session active
   * @returns {string|null}
   */
  getSessionId() {
    return this.currentSessionId;
  }

  /**
   * Vérifie si une session est active
   * @returns {boolean}
   */
  hasActiveSession() {
    return this.currentSessionId !== null;
  }

  /**
   * Récupère le nombre de messages dans la transcription
   * @returns {number}
   */
  getTranscriptCount() {
    return this.conversationTranscript.length;
  }

  /**
   * Récupère la durée de la session en millisecondes
   * @returns {number}
   */
  getSessionDuration() {
    if (!this.sessionStartTime) return 0;
    return Date.now() - this.sessionStartTime;
  }

  /**
   * Récupère les statistiques de la session
   * @returns {Object}
   */
  getStatistics() {
    return {
      sessionId: this.currentSessionId,
      isActive: this.hasActiveSession(),
      duration: this.getSessionDuration(),
      transcriptCount: this.getTranscriptCount(),
      totalCharacters: this.getFullTranscript().length,
      startTime: this.sessionStartTime
    };
  }

  /**
   * Efface la transcription locale
   */
  clearTranscript() {
    this.conversationTranscript = [];
    Logger.debug('🧹 Transcription effacée');
  }
}