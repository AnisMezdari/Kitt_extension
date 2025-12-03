/**
 * AUDIO PROCESSING SERVICE
 * =========================
 * Traite l'audio capturé et l'envoie au backend
 */

import { AUDIO_CONFIG, API_CONFIG } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';
import { float32ToPCM16 } from '../../utils/helpers.js';

export class AudioProcessingService {
  constructor() {
    this.audioContext = null;
    this.processor = null;
    this.audioBuffer = { client: [], commercial: [] };
    this.isProcessing = false;
    this.sendIntervalSeconds = AUDIO_CONFIG.SEND_INTERVAL_SECONDS;
    this.bufferThreshold = 0;
    this.sessionId = null;
    this.onDataCallback = null;
    this._isSending = false; // Flag pour éviter les envois multiples
    this._lastSendTime = 0; // Timestamp du dernier envoi
  }

  /**
   * Démarre le traitement audio
   * @param {MediaStream} micStream - Stream du microphone
   * @param {MediaStream} displayStream - Stream de l'écran
   * @param {string} sessionId - ID de la session
   * @param {Function} onDataCallback - Callback pour les données reçues
   */
  async startProcessing(micStream, displayStream, sessionId, onDataCallback) {
    Logger.audio('🎛️ Démarrage du traitement audio');

    if (this.isProcessing) {
      Logger.warn('Le traitement audio est déjà en cours');
      return;
    }

    this.sessionId = sessionId;
    this.onDataCallback = onDataCallback;

    try {
      // Créer le contexte audio
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const sampleRate = this.audioContext.sampleRate || 44100;
      
      // Calculer le seuil de buffer
      this.bufferThreshold = Math.round(sampleRate * this.sendIntervalSeconds);
      
      Logger.debug('Audio Context créé', { sampleRate, bufferThreshold: this.bufferThreshold });

      // Créer les sources audio
      const displaySource = this.audioContext.createMediaStreamSource(displayStream);
      const micSource = this.audioContext.createMediaStreamSource(micStream);

      // Créer un merger pour combiner les deux sources
      const merger = this.audioContext.createChannelMerger(2);
      displaySource.connect(merger, 0, 0); // Client (écran) → canal 0
      micSource.connect(merger, 0, 1);     // Commercial (micro) → canal 1

      // Créer le processeur audio
      this.processor = this.audioContext.createScriptProcessor(
        AUDIO_CONFIG.BUFFER_SIZE,
        2, // 2 canaux en entrée
        1  // 1 canal en sortie (pas utilisé)
      );

      // Connecter le merger au processeur
      merger.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Traiter l'audio
      this.processor.onaudioprocess = (e) => this._processAudioBuffer(e);

      this.isProcessing = true;
      Logger.audio('✅ Traitement audio démarré');

    } catch (error) {
      Logger.error('❌ Erreur lors du démarrage du traitement audio', error);
      this.stopProcessing();
      throw error;
    }
  }

  /**
   * Traite un buffer audio
   * @private
   */
  _processAudioBuffer(event) {
    // 🆕 VÉRIFICATIONS MULTIPLES pour éviter le traitement après arrêt
    if (!this.isProcessing) {
      Logger.debug('⏸️ Traitement arrêté, skip buffer');
      return;
    }
    
    if (!this.audioContext || !this.processor) {
      Logger.debug('⏸️ Contexte audio inexistant, skip buffer');
      return;
    }

    try {
      // Récupérer les données des deux canaux
      const channel1 = event.inputBuffer.getChannelData(0); // Client (écran)
      const channel2 = event.inputBuffer.getChannelData(1); // Commercial (micro)

      // Ajouter au buffer
      this.audioBuffer.client.push(...channel1);
      this.audioBuffer.commercial.push(...channel2);

      // Vérifier si on a assez de données pour envoyer
      if (this.audioBuffer.client.length >= this.bufferThreshold) {
        // Empêcher l'envoi multiple pendant qu'on traite
        if (!this._isSending) {
          this._sendAudioToBackend();
        }
      }
    } catch (error) {
      Logger.error('Erreur traitement buffer audio', error);
    }
  }

  /**
   * Envoie l'audio au backend
   * @private
   */
  async _sendAudioToBackend() {
    // Protection contre les envois multiples
    if (this._isSending) {
      Logger.warn('⚠️ Envoi déjà en cours, skip');
      return;
    }

    // Protection temporelle (minimum 2.5 secondes entre envois)
    const now = Date.now();
    const timeSinceLastSend = now - this._lastSendTime;
    if (timeSinceLastSend < 2500 && this._lastSendTime > 0) {
      Logger.warn(`⚠️ Envoi trop rapide (${timeSinceLastSend}ms), skip`);
      return;
    }

    // Marquer comme en cours d'envoi
    this._isSending = true;
    this._lastSendTime = now;

    try {
      Logger.audio('📤 Envoi de l\'audio au backend', {
        clientSamples: this.audioBuffer.client.length,
        commercialSamples: this.audioBuffer.commercial.length
      });

      // Copier les buffers AVANT de les vider (pour éviter les race conditions)
      const clientBufferCopy = [...this.audioBuffer.client];
      const commercialBufferCopy = [...this.audioBuffer.commercial];

      // Vider les buffers IMMÉDIATEMENT pour éviter les doublons
      this.audioBuffer.client = [];
      this.audioBuffer.commercial = [];

      // Convertir Float32 → PCM 16-bit
      const clientBuffer = float32ToPCM16(new Float32Array(clientBufferCopy));
      const commercialBuffer = float32ToPCM16(new Float32Array(commercialBufferCopy));

      // Créer le FormData
      const formData = new FormData();
      formData.append('client_audio', new Blob([clientBuffer], { type: 'application/octet-stream' }));
      formData.append('commercial_audio', new Blob([commercialBuffer], { type: 'application/octet-stream' }));

      // Envoyer au backend
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUDIO_UPLOAD(this.sessionId)}`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Appeler le callback avec les données
      if (this.onDataCallback) {
        this.onDataCallback(data);
      }

      Logger.audio('✅ Audio envoyé avec succès');

    } catch (error) {
      Logger.error('❌ Erreur lors de l\'envoi de l\'audio', error);
      
      // En cas d'erreur, ne pas restaurer les buffers (éviter les doublons)
      // Les données sont perdues mais c'est mieux que des doublons
      
    } finally {
      // Libérer le flag d'envoi
      this._isSending = false;
    }
  }

  /**
   * Arrête le traitement audio
   */
  stopProcessing() {
    Logger.audio('🛑 Arrêt du traitement audio');

    // Marquer comme arrêté IMMÉDIATEMENT pour stopper les callbacks
    this.isProcessing = false;

    // Déconnecter et nettoyer le processor
    if (this.processor) {
      try {
        // Retirer le handler AVANT de déconnecter
        this.processor.onaudioprocess = null;
        this.processor.disconnect();
        Logger.debug('✓ Processor déconnecté');
      } catch (e) {
        Logger.warn('Erreur déconnexion processor', e);
      }
      this.processor = null;
    }

    // Fermer l'audio context
    if (this.audioContext) {
      try {
        this.audioContext.close();
        Logger.debug('✓ AudioContext fermé');
      } catch (e) {
        Logger.warn('Erreur fermeture AudioContext', e);
      }
      this.audioContext = null;
    }

    // Vider complètement les buffers
    this.audioBuffer = { client: [], commercial: [] };
    
    // Réinitialiser les flags
    this._isSending = false;
    this._lastSendTime = 0;
    this.sessionId = null;
    this.onDataCallback = null;

    Logger.audio('✅ Traitement audio arrêté');
  }

  /**
   * Vérifie si le traitement est en cours
   * @returns {boolean}
   */
  isActive() {
    return this.isProcessing && this.audioContext !== null;
  }

  /**
   * Obtient les informations sur le traitement
   * @returns {Object}
   */
  getInfo() {
    return {
      isProcessing: this.isProcessing,
      sessionId: this.sessionId,
      bufferThreshold: this.bufferThreshold,
      currentBufferSize: this.audioBuffer.client.length,
      sampleRate: this.audioContext?.sampleRate || 0
    };
  }
}