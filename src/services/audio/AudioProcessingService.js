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
    // 🆕 DOUBLE BUFFER : un pour l'accumulation, un pour l'envoi
    this.audioBuffer = { client: [], commercial: [] };  // Buffer actif
    this.sendingBuffer = { client: [], commercial: [] }; // Buffer en cours d'envoi
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
    
    // 🆕 VÉRIFIER que le callback est bien défini
    if (!onDataCallback || typeof onDataCallback !== 'function') {
      Logger.error('❌ ERREUR CRITIQUE : Callback non défini ou invalide !');
      throw new Error('Callback obligatoire pour traiter les données audio');
    }
    
    Logger.debug('✓ Callback enregistré correctement');

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

    // ✅ CORRECTION BUG #1: TOUJOURS accumuler les données, même pendant l'envoi
    // Le double-buffer permet de ne jamais perdre de données

    try {
      // Récupérer les données des deux canaux
      const channel1 = event.inputBuffer.getChannelData(0); // Client (écran)
      const channel2 = event.inputBuffer.getChannelData(1); // Commercial (micro)

      // Ajouter au buffer actif (toujours, sans condition)
      this.audioBuffer.client.push(...channel1);
      this.audioBuffer.commercial.push(...channel2);

      // Vérifier si on a assez de données pour envoyer
      if (this.audioBuffer.client.length >= this.bufferThreshold) {
        Logger.debug(`📊 Seuil atteint: ${this.audioBuffer.client.length} échantillons`);
        // Déclencher l'envoi si pas déjà en cours
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

    // ✅ CORRECTION BUG #2: Suppression de la protection temporelle qui conflit avec SEND_INTERVAL_SECONDS
    // Avec SEND_INTERVAL_SECONDS=2s, on ne devrait jamais être "trop rapide"

    // Marquer comme en cours d'envoi
    this._isSending = true;
    const now = Date.now();
    this._lastSendTime = now;

    try {
      // ✅ CORRECTION BUG #3: SWAP des buffers au lieu de copier puis vider
      // Cela évite toute perte de données et élimine les race conditions

      const originalSize = this.audioBuffer.client.length;
      Logger.audio('📤 Envoi de l\'audio au backend', {
        clientSamples: originalSize,
        commercialSamples: this.audioBuffer.commercial.length,
        durationSeconds: (originalSize / AUDIO_CONFIG.SAMPLE_RATE).toFixed(2)
      });

      // SWAP: Le buffer actif devient le buffer d'envoi
      this.sendingBuffer = this.audioBuffer;

      // Créer de nouveaux buffers vides pour continuer l'accumulation
      this.audioBuffer = { client: [], commercial: [] };

      Logger.debug(`✓ Buffers swappés - Nouveau buffer actif vide, envoi de ${this.sendingBuffer.client.length} échantillons`);

      // Convertir Float32 → PCM 16-bit depuis le buffer d'envoi
      const clientBuffer = float32ToPCM16(new Float32Array(this.sendingBuffer.client));
      const commercialBuffer = float32ToPCM16(new Float32Array(this.sendingBuffer.commercial));

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
      
      Logger.audio('✅ Réponse du backend reçue', {
        hasAdvice: !!data.advice,
        hasTranscription: !!data.transcription,
        reason: data.reason || 'N/A'
      });
      
      // 🆕 LOG DÉTAILLÉ de l'advice si présent
      if (data.advice) {
        Logger.info('💡 INSIGHT REÇU DU BACKEND:', {
          type: data.advice.type,
          title: data.advice.title,
          description: data.advice.details?.description
        });
      }
      
      // 🆕 LOG de la transcription si présente
      if (data.transcription) {
        const transcriptLength = data.transcription.length;
        Logger.debug(`📝 Transcription reçue (${transcriptLength} caractères)`);
        
        // 🆕 ALERTE si transcription trop longue
        if (transcriptLength > 500) {
          Logger.warn(`⚠️ TRANSCRIPTION ANORMALEMENT LONGUE: ${transcriptLength} caractères`);
          Logger.warn(`   Contenu: ${data.transcription.substring(0, 100)}...`);
        }
      }
      
      // Appeler le callback avec les données
      if (this.onDataCallback) {
        Logger.debug('📞 Appel du callback avec les données');
        this.onDataCallback(data);
      } else {
        Logger.error('❌ CALLBACK NON DÉFINI ! Les insights ne peuvent pas être affichés');
      }

      Logger.audio('✅ Audio envoyé avec succès');

    } catch (error) {
      Logger.error('❌ Erreur lors de l\'envoi de l\'audio', error);

      // ✅ Avec le système de double-buffer, les nouvelles données continuent
      // à s'accumuler dans audioBuffer pendant l'envoi. En cas d'erreur,
      // on perd uniquement le chunk qui n'a pas pu être envoyé (sendingBuffer),
      // mais aucune donnée future n'est perdue.

    } finally {
      // Vider le buffer d'envoi et libérer le flag
      this.sendingBuffer = { client: [], commercial: [] };
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

    // Vider complètement les buffers (les deux)
    this.audioBuffer = { client: [], commercial: [] };
    this.sendingBuffer = { client: [], commercial: [] };

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