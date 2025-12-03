/**
 * AUDIO CAPTURE SERVICE
 * =====================
 * Gère la capture audio bidirectionnelle (microphone + écran)
 * avec gestion d'erreurs spécifiques à chaque plateforme
 */

import { AUDIO_CONFIG, ERROR_MESSAGES, SUCCESS_MESSAGES } from '../../utils/constants.js';
import { Logger } from '../../utils/logger.js';

export class AudioCaptureService {
  constructor() {
    this.micStream = null;
    this.displayStream = null;
    this.isCapturing = false;
  }

  /**
   * Démarre la capture audio bidirectionnelle
   * @returns {Promise<{micStream: MediaStream, displayStream: MediaStream}>}
   * @throws {AudioCaptureError}
   */
  async startCapture() {
    Logger.info('🎤 Démarrage de la capture audio');

    try {
      // ÉTAPE 1 : Capturer le microphone EN PREMIER (plus fiable sur macOS)
      await this._captureMicrophone();
      
      // ÉTAPE 2 : Capturer l'audio de l'écran
      await this._captureDisplay();
      
      // ÉTAPE 3 : Valider les pistes audio
      this._validateAudioTracks();
      
      this.isCapturing = true;
      Logger.info(SUCCESS_MESSAGES.SESSION_STARTED);
      
      return {
        micStream: this.micStream,
        displayStream: this.displayStream
      };
      
    } catch (error) {
      // Nettoyer en cas d'erreur
      this.stopCapture();
      throw error;
    }
  }

  /**
   * Capture le flux du microphone
   * @private
   */
  async _captureMicrophone() {
    Logger.debug('🎤 Demande d\'accès au microphone...');
    
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia(
        AUDIO_CONFIG.CAPTURE_CONSTRAINTS
      );
      
      Logger.info('✅ Microphone capturé', {
        tracks: this.micStream.getAudioTracks().length
      });
      
    } catch (error) {
      Logger.error('❌ Erreur microphone', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new MicrophonePermissionError(ERROR_MESSAGES.MICROPHONE_DENIED);
      } else if (error.name === 'NotFoundError') {
        throw new MicrophoneNotFoundError('Aucun microphone détecté');
      } else {
        throw new AudioCaptureError(`Erreur microphone: ${error.message}`);
      }
    }
  }

  /**
   * Capture le flux de l'écran avec audio
   * @private
   */
  async _captureDisplay() {
    Logger.debug('🖥️ Demande d\'accès à l\'audio de l\'onglet...');
    
    try {
      this.displayStream = await navigator.mediaDevices.getDisplayMedia(
        AUDIO_CONFIG.DISPLAY_CONSTRAINTS
      );
      
      Logger.info('✅ Audio de l\'onglet capturé', {
        audioTracks: this.displayStream.getAudioTracks().length,
        videoTracks: this.displayStream.getVideoTracks().length
      });
      
    } catch (error) {
      Logger.error('❌ Erreur capture écran', error);
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new ScreenCaptureError(ERROR_MESSAGES.SCREEN_DENIED);
      } else {
        throw new AudioCaptureError(`Erreur capture écran: ${error.message}`);
      }
    }
  }

  /**
   * Valide que les pistes audio sont bien présentes
   * @private
   * @throws {NoAudioTrackError}
   */
  _validateAudioTracks() {
    const audioTracks = this.displayStream.getAudioTracks();
    
    if (audioTracks.length === 0) {
      throw new NoAudioTrackError(ERROR_MESSAGES.NO_AUDIO_TRACK);
    }
    
    Logger.info(`✅ ${audioTracks.length} piste(s) audio détectée(s)`);
  }

  /**
   * Arrête la capture audio et libère les ressources
   */
  stopCapture() {
    Logger.info('🛑 Arrêt de la capture audio');
    
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => {
        track.stop();
        Logger.debug('🎤 Piste microphone arrêtée');
      });
      this.micStream = null;
    }
    
    if (this.displayStream) {
      this.displayStream.getTracks().forEach(track => {
        track.stop();
        Logger.debug('🖥️ Piste écran arrêtée');
      });
      this.displayStream = null;
    }
    
    this.isCapturing = false;
    Logger.info('✅ Capture arrêtée');
  }

  /**
   * Vérifie si la capture est active
   * @returns {boolean}
   */
  isActive() {
    return this.isCapturing && 
           this.micStream !== null && 
           this.displayStream !== null;
  }

  /**
   * Obtient les informations sur les pistes audio
   * @returns {Object}
   */
  getAudioInfo() {
    if (!this.isActive()) {
      return {
        isActive: false,
        micTracks: 0,
        displayTracks: 0
      };
    }
    
    return {
      isActive: true,
      micTracks: this.micStream.getAudioTracks().length,
      displayTracks: this.displayStream.getAudioTracks().length,
      micSettings: this.micStream.getAudioTracks()[0]?.getSettings(),
      displaySettings: this.displayStream.getAudioTracks()[0]?.getSettings()
    };
  }

  /**
   * Teste les permissions avant de démarrer
   * @returns {Promise<Object>} Résultat du test
   */
  static async testPermissions() {
    Logger.info('🧪 Test des permissions...');
    
    const result = {
      microphone: false,
      screen: false,
      errors: []
    };
    
    // Test microphone
    try {
      const micTest = await navigator.mediaDevices.getUserMedia({ audio: true });
      result.microphone = true;
      Logger.info('✅ Microphone OK');
      micTest.getTracks().forEach(t => t.stop());
    } catch (error) {
      result.errors.push(`Microphone: ${error.message}`);
      Logger.error('❌ Microphone KO', error);
    }
    
    // Test écran
    try {
      const displayTest = await navigator.mediaDevices.getDisplayMedia({ 
        audio: true, 
        video: true 
      });
      result.screen = true;
      result.audioTracks = displayTest.getAudioTracks().length;
      Logger.info('✅ Partage d\'écran OK');
      Logger.info(`📊 Pistes audio: ${result.audioTracks}`);
      displayTest.getTracks().forEach(t => t.stop());
    } catch (error) {
      result.errors.push(`Écran: ${error.message}`);
      Logger.error('❌ Partage d\'écran KO', error);
    }
    
    return result;
  }
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

/**
 * Erreur de base pour la capture audio
 */
export class AudioCaptureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AudioCaptureError';
  }
}

/**
 * Erreur de permission microphone
 */
export class MicrophonePermissionError extends AudioCaptureError {
  constructor(message) {
    super(message);
    this.name = 'MicrophonePermissionError';
  }
}

/**
 * Erreur microphone non trouvé
 */
export class MicrophoneNotFoundError extends AudioCaptureError {
  constructor(message) {
    super(message);
    this.name = 'MicrophoneNotFoundError';
  }
}

/**
 * Erreur de capture d'écran
 */
export class ScreenCaptureError extends AudioCaptureError {
  constructor(message) {
    super(message);
    this.name = 'ScreenCaptureError';
  }
}

/**
 * Erreur piste audio manquante
 */
export class NoAudioTrackError extends AudioCaptureError {
  constructor(message) {
    super(message);
    this.name = 'NoAudioTrackError';
  }
}