/**
 * TRANSCRIPTION DISPLAY
 * =====================
 * Affiche les transcriptions en temps réel des conversations
 */

import { Logger } from '../../utils/logger.js';
import { UI_CONFIG } from '../../utils/constants.js';

export class TranscriptionDisplay {
  constructor(containerElement) {
    if (!containerElement) {
      throw new Error('TranscriptionDisplay: containerElement est requis');
    }

    this.container = containerElement;
    this.transcriptions = [];
    this.maxTranscriptions = 50; // Garder les 50 dernières

    Logger.debug('✓ TranscriptionDisplay initialisé');
  }

  /**
   * Ajoute une nouvelle transcription
   * @param {string} transcriptionText - Texte de la transcription
   */
  addTranscription(transcriptionText) {
    if (!transcriptionText || typeof transcriptionText !== 'string') {
      Logger.warn('⚠️ Transcription invalide', transcriptionText);
      return;
    }

    const cleanText = transcriptionText.trim();
    if (cleanText.length === 0) {
      Logger.debug('Transcription vide, ignorée');
      return;
    }

    Logger.debug('📝 Ajout transcription:', cleanText.substring(0, 50) + '...');

    // Parser la transcription (format: "CLIENT: texte\nCOMMERCIAL: texte")
    const messages = this._parseTranscription(cleanText);

    if (messages.length === 0) {
      Logger.warn('Aucun message parsé dans la transcription');
      return;
    }

    // Ajouter chaque message
    messages.forEach(message => {
      this._addMessage(message);
    });

    // Limiter le nombre de transcriptions
    if (this.transcriptions.length > this.maxTranscriptions) {
      this._removeOldestTranscription();
    }

    // Scroll vers le bas
    this._scrollToBottom();
  }

  /**
   * Parse une transcription en messages individuels
   * @private
   */
  _parseTranscription(text) {
    const messages = [];

    // Format attendu: "CLIENT: texte\nCOMMERCIAL: texte"
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Détecter le speaker (CLIENT ou COMMERCIAL)
      let speaker = 'unknown';
      let content = trimmedLine;

      if (trimmedLine.startsWith('CLIENT:')) {
        speaker = 'client';
        content = trimmedLine.replace('CLIENT:', '').trim();
      } else if (trimmedLine.startsWith('COMMERCIAL:')) {
        speaker = 'commercial';
        content = trimmedLine.replace('COMMERCIAL:', '').trim();
      }

      if (content) {
        messages.push({ speaker, content });
      }
    }

    return messages;
  }

  /**
   * Ajoute un message au DOM
   * @private
   */
  _addMessage(message) {
    const timestamp = Date.now();

    // Créer l'élément
    const messageElement = this._createMessageElement(message, timestamp);

    // Ajouter au conteneur
    this.container.appendChild(messageElement);

    // Ajouter au cache
    this.transcriptions.push({
      message,
      timestamp,
      element: messageElement
    });

    // Animer l'apparition
    requestAnimationFrame(() => {
      messageElement.classList.add('show');
    });
  }

  /**
   * Crée l'élément DOM pour un message
   * @private
   */
  _createMessageElement(message, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `transcription-message transcription-${message.speaker}`;
    messageDiv.setAttribute('data-timestamp', timestamp.toString());
    messageDiv.setAttribute('data-speaker', message.speaker);

    // Icône et label selon le speaker
    let icon, label, colorClass;
    if (message.speaker === 'client') {
      icon = '👤';
      label = 'Client';
      colorClass = 'client-message';
    } else if (message.speaker === 'commercial') {
      icon = '🎤';
      label = 'Commercial';
      colorClass = 'commercial-message';
    } else {
      icon = '💬';
      label = 'Message';
      colorClass = 'unknown-message';
    }

    messageDiv.innerHTML = `
      <div class="transcription-header ${colorClass}">
        <span class="transcription-icon">${icon}</span>
        <span class="transcription-speaker">${label}</span>
        <span class="transcription-time">${this._formatTime(timestamp)}</span>
      </div>
      <div class="transcription-content">${this._escapeHtml(message.content)}</div>
    `;

    return messageDiv;
  }

  /**
   * Supprime la transcription la plus ancienne
   * @private
   */
  _removeOldestTranscription() {
    if (this.transcriptions.length === 0) return;

    const oldest = this.transcriptions.shift();
    if (oldest && oldest.element) {
      oldest.element.style.transition = 'opacity 0.3s ease';
      oldest.element.style.opacity = '0';

      setTimeout(() => {
        oldest.element.remove();
      }, 300);
    }
  }

  /**
   * Scroll vers le bas du conteneur
   * @private
   */
  _scrollToBottom() {
    try {
      this.container.scrollTop = this.container.scrollHeight;
    } catch (e) {
      Logger.warn('Erreur lors du scroll', e);
    }
  }

  /**
   * Formate un timestamp en heure lisible
   * @private
   */
  _formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Échappe le HTML pour prévenir les injections
   * @private
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Efface toutes les transcriptions
   */
  clearAll() {
    this.transcriptions.forEach(item => {
      if (item.element) {
        item.element.remove();
      }
    });

    this.transcriptions = [];
    Logger.info('[TRANSCRIPTION] Toutes les transcriptions effacées');
  }

  /**
   * Obtient le nombre de transcriptions affichées
   * @returns {number}
   */
  getCount() {
    return this.transcriptions.length;
  }

  /**
   * Obtient les statistiques
   * @returns {Object}
   */
  getStatistics() {
    const stats = {
      total: this.transcriptions.length,
      byType: {
        client: 0,
        commercial: 0,
        unknown: 0
      }
    };

    this.transcriptions.forEach(item => {
      const speaker = item.message.speaker;
      if (stats.byType[speaker] !== undefined) {
        stats.byType[speaker]++;
      }
    });

    return stats;
  }
}
