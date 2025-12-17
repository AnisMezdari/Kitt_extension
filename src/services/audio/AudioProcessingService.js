/**
 * AUDIO PROCESSING SERVICE
 * =========================
 * Traite l'audio capturé et l'envoie au backend
 */

import { AUDIO_CONFIG, API_CONFIG } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';
import { float32ToPCM16 } from '../../utils/helpers.js';
import { VoiceActivityDetector } from './VoiceActivityDetector.js';

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
    // ✅ CORRECTION: Ajout système de retry avec backoff exponentiel
    this._retryCount = 0;
    this._maxRetries = API_CONFIG.RETRY_ATTEMPTS; // 3 tentatives
    this._failedBuffer = null; // Stocke le buffer en cas d'échec pour retry
    // ✅ NOUVEAU: Voice Activity Detection pour envoi intelligent
    this.vad = null;
    this.vadEnabled = AUDIO_CONFIG.VAD_ENABLED !== undefined ? AUDIO_CONFIG.VAD_ENABLED : true;
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

      // ✅ Initialiser le Voice Activity Detector
      this.vad = new VoiceActivityDetector(sampleRate);

      // Calculer le seuil de buffer (utilisé comme fallback si VAD désactivé)
      this.bufferThreshold = Math.round(sampleRate * this.sendIntervalSeconds);

      Logger.debug('Audio Context créé', { sampleRate, bufferThreshold: this.bufferThreshold, vadEnabled: this.vadEnabled });

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
   * Traite un buffer audio avec protection contre débordement mémoire
   * @private
   */
  _processAudioBuffer(event) {
    // Vérifications pour éviter le traitement après arrêt
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

      // Ajouter au buffer actif
      this.audioBuffer.client.push(...channel1);
      this.audioBuffer.commercial.push(...channel2);

      // ✅ AMÉLIORATION: Protection contre débordement mémoire (réduit à 10s)
      const MAX_BUFFER_SIZE = AUDIO_CONFIG.SAMPLE_RATE * 10; // 10 secondes max (réduit de 15s)

      if (this.audioBuffer.client.length > MAX_BUFFER_SIZE) {
        const excess = this.audioBuffer.client.length - MAX_BUFFER_SIZE;
        Logger.warn(`⚠️ Buffer approchant la limite (${this.audioBuffer.client.length} samples), suppression des ${excess} plus anciens`);

        this.audioBuffer.client = this.audioBuffer.client.slice(-MAX_BUFFER_SIZE);
        this.audioBuffer.commercial = this.audioBuffer.commercial.slice(-MAX_BUFFER_SIZE);
      }

      // ✅ NOUVEAU: Décision d'envoi basée sur VAD (Voice Activity Detection)
      if (this.vadEnabled && this.vad) {
        // Analyser l'activité vocale sur les deux canaux
        const bufferDuration = channel1.length / AUDIO_CONFIG.SAMPLE_RATE;

        // Analyser commercial (microphone) - priorité
        const commercialDecision = this.vad.analyze(channel2, bufferDuration);

        if (commercialDecision.shouldSend) {
          Logger.info(`[VAD] 🎤 ${commercialDecision.description}`);

          if (!this._isSending && this.audioBuffer.client.length > 0) {
            Logger.debug(`[VAD] 📤 Envoi déclenché par fin de phrase`, {
              bufferSize: this.audioBuffer.client.length,
              durationSeconds: (this.audioBuffer.client.length / AUDIO_CONFIG.SAMPLE_RATE).toFixed(2)
            });
            this._sendAudioToBackend();
          }
        } else {
          // Log de debug occasionnel (tous les 50 buffers pour éviter le spam)
          if (Math.random() < 0.02) {
            Logger.debug(`[VAD] ${commercialDecision.reason}: ${commercialDecision.description}`, commercialDecision.stats);
          }
        }
      } else {
        // Mode LEGACY : Envoi basé sur le seuil de temps fixe
        if (this.audioBuffer.client.length >= this.bufferThreshold) {
          Logger.debug(`📊 Seuil atteint: ${this.audioBuffer.client.length} échantillons`);

          if (!this._isSending) {
            this._sendAudioToBackend();
          }
        }
      }
    } catch (error) {
      Logger.error('Erreur traitement buffer audio', error);
    }
  }

  /**
   * Envoie l'audio au backend avec gestion d'erreurs et retry
   * @private
   */
  async _sendAudioToBackend() {
    // Protection contre les envois multiples
    if (this._isSending) {
      Logger.warn('⚠️ Envoi déjà en cours, skip');
      return;
    }

    // Marquer comme en cours d'envoi
    this._isSending = true;
    const now = Date.now();
    this._lastSendTime = now;

    try {
      const originalSize = this.audioBuffer.client.length;
      Logger.audio('📤 Envoi de l\'audio au backend', {
        clientSamples: originalSize,
        commercialSamples: this.audioBuffer.commercial.length,
        durationSeconds: (originalSize / AUDIO_CONFIG.SAMPLE_RATE).toFixed(2),
        retryAttempt: this._retryCount
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

      // ✅ CORRECTION: Ajout de timeout sur la requête
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.REQUEST_TIMEOUT);

      // Envoyer au backend avec timeout
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.AUDIO_UPLOAD(this.sessionId)}`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // ✅ Succès : réinitialiser le compteur de retry
      this._retryCount = 0;
      this._failedBuffer = null;

      Logger.audio('✅ Réponse du backend reçue', {
        hasAdvice: !!data.advice,
        hasTranscription: !!data.transcription,
        reason: data.reason || 'N/A'
      });

      // LOG DÉTAILLÉ de l'advice si présent
      if (data.advice) {
        Logger.info('💡 INSIGHT REÇU DU BACKEND:', {
          type: data.advice.type,
          title: data.advice.title,
          description: data.advice.details?.description
        });
      }

      // LOG de la transcription si présente
      if (data.transcription) {
        const transcriptLength = data.transcription.length;
        Logger.debug(`📝 Transcription reçue (${transcriptLength} caractères)`);

        if (transcriptLength > 500) {
          Logger.warn(`⚠️ TRANSCRIPTION ANORMALEMENT LONGUE: ${transcriptLength} caractères`);
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
      // ✅ CORRECTION: Gestion robuste des erreurs avec retry
      const errorType = error.name === 'AbortError' ? 'TIMEOUT' :
                       error.message.includes('Failed to fetch') ? 'NETWORK' :
                       'SERVER';

      Logger.error(`❌ Erreur ${errorType} lors de l'envoi de l'audio`, {
        error: error.message,
        retryCount: this._retryCount,
        maxRetries: this._maxRetries
      });

      // Stocker le buffer pour retry
      this._failedBuffer = this.sendingBuffer;

      // Tenter un retry si possible
      if (this._retryCount < this._maxRetries) {
        this._retryCount++;
        const delay = API_CONFIG.RETRY_DELAY * Math.pow(API_CONFIG.RETRY_BACKOFF_MULTIPLIER, this._retryCount - 1);

        Logger.warn(`🔄 Tentative de retry dans ${delay}ms (${this._retryCount}/${this._maxRetries})`);

        // Libérer le flag pour permettre le retry
        this._isSending = false;

        // Programmer le retry avec backoff exponentiel
        setTimeout(() => {
          if (this._failedBuffer && this.isProcessing) {
            // Restaurer le buffer pour retry
            this.sendingBuffer = this._failedBuffer;
            this._sendAudioToBackend();
          }
        }, delay);

        return; // Sortir sans libérer le flag (sera fait par le retry)
      } else {
        // Échec définitif après tous les retries
        Logger.error('❌ ÉCHEC DÉFINITIF : Nombre maximum de tentatives atteint');
        this._retryCount = 0;
        this._failedBuffer = null;

        // Notifier l'utilisateur via le callback (si disponible)
        if (this.onDataCallback) {
          this.onDataCallback({
            error: true,
            message: 'Impossible de joindre le backend. Vérifiez votre connexion.'
          });
        }
      }

    } finally {
      // Vider le buffer d'envoi et libérer le flag (sauf si retry en cours)
      if (this._retryCount === 0) {
        this.sendingBuffer = { client: [], commercial: [] };
        this._isSending = false;
      }
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

    // ✅ Réinitialiser le VAD
    if (this.vad) {
      this.vad.hardReset();
    }

    Logger.audio('✅ Traitement audio arrêté');
  }

  /**
   * Active ou désactive le Voice Activity Detection
   * @param {boolean} enabled - true pour activer, false pour mode timer
   */
  setVADEnabled(enabled) {
    this.vadEnabled = enabled;
    Logger.info(`[VAD] ${enabled ? '✅ Activé' : '❌ Désactivé'} - Mode: ${enabled ? 'fin de phrase' : 'timer fixe'}`);
  }

  /**
   * Ajuste les seuils du VAD
   * @param {Object} thresholds - Nouveaux seuils
   */
  setVADThresholds(thresholds) {
    if (this.vad) {
      this.vad.setThresholds(thresholds);
    }
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