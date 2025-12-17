/**
 * VOICE ACTIVITY DETECTOR (VAD)
 * ==============================
 * Détecte l'activité vocale et les pauses pour envoyer l'audio au bon moment
 */

import { Logger } from '../../utils/logger.js';

export class VoiceActivityDetector {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;

    // Seuils de détection
    this.SILENCE_THRESHOLD = 0.005;  // ✅ CORRIGÉ: Moins sensible (0.01→0.005) pour ignorer pauses naturelles
    this.SPEECH_THRESHOLD = 0.02;    // RMS au dessus = parole active

    // Durées (en secondes)
    this.MIN_SPEECH_DURATION = 0.5;      // Minimum 0.5s de parole pour considérer
    this.SILENCE_BEFORE_SEND = 1.2;      // ✅ RÉDUIT: 1.2s de silence (réduit de 1.5s pour envois encore plus fréquents)
    this.NATURAL_PAUSE_THRESHOLD = 0.8;  // ✅ NOUVEAU: Pause < 0.8s = respiration, pas fin de phrase
    this.MIN_PHRASE_LENGTH = 1.0;        // Phrases < 1s = trop courtes, on attend
    this.MAX_WAIT_TIME = 6.0;            // ✅ CRITIQUE: 6s max (réduit de 8s pour éviter débordement à 10s)
    this.SHORT_PHRASE_EXTENSION = 1.5;   // ✅ RÉDUIT: +1.5s d'attente (réduit de 2.0s)

    // État
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.lastSpeechTime = null;
    this.silenceDuration = 0;
    this.speechDuration = 0;
    this.totalAccumulatedTime = 0;

    // Buffers pour lisser la détection
    this.energyHistory = [];
    this.historySize = 5;  // Moyenner sur 5 mesures

    Logger.debug('✓ VoiceActivityDetector initialisé', {
      silenceThreshold: this.SILENCE_THRESHOLD,
      minSpeechDuration: this.MIN_SPEECH_DURATION,
      silenceBeforeSend: this.SILENCE_BEFORE_SEND
    });
  }

  /**
   * Analyse un buffer audio et retourne si on doit envoyer
   * @param {Float32Array} audioData - Données audio à analyser
   * @param {number} bufferDuration - Durée du buffer en secondes
   * @returns {Object} { shouldSend: boolean, reason: string, stats: Object }
   */
  analyze(audioData, bufferDuration) {
    // Calculer l'énergie RMS du buffer
    const rms = this._calculateRMS(audioData);

    // Ajouter à l'historique et lisser
    this.energyHistory.push(rms);
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }

    const smoothedRMS = this._getSmoothedRMS();

    // Détecter si c'est de la parole ou du silence
    const isSpeechNow = smoothedRMS > this.SPEECH_THRESHOLD;
    const isSilenceNow = smoothedRMS < this.SILENCE_THRESHOLD;

    // Mettre à jour les compteurs
    this.totalAccumulatedTime += bufferDuration;

    // MACHINE À ÉTATS
    if (isSpeechNow) {
      // PAROLE DÉTECTÉE
      if (!this.isSpeaking) {
        // Début de parole
        this.isSpeaking = true;
        this.speechStartTime = Date.now();
        this.silenceDuration = 0;
        Logger.debug('[VAD] 🎤 Début de parole détecté', { rms: smoothedRMS.toFixed(4) });
      }

      this.lastSpeechTime = Date.now();
      this.speechDuration = (Date.now() - this.speechStartTime) / 1000;

    } else if (isSilenceNow && this.isSpeaking) {
      // SILENCE APRÈS PAROLE
      const timeSinceLastSpeech = (Date.now() - this.lastSpeechTime) / 1000;
      this.silenceDuration = timeSinceLastSpeech;

      // ✅ AMÉLIORATION: Ne logger que les silences significatifs (> 0.8s)
      // Les micro-pauses (respiration) ne sont pas considérées comme fin de phrase
      if (this.silenceDuration > this.NATURAL_PAUSE_THRESHOLD) {
        Logger.debug('[VAD] 🔇 Silence significatif détecté', {
          speechDuration: this.speechDuration.toFixed(2) + 's',
          silenceDuration: this.silenceDuration.toFixed(2) + 's',
          totalTime: this.totalAccumulatedTime.toFixed(2) + 's'
        });
      }
    }

    // DÉCISION D'ENVOI
    const decision = this._shouldSendAudio();

    // Réinitialiser si on envoie
    if (decision.shouldSend) {
      this._reset();
    }

    return {
      ...decision,
      stats: {
        rms: smoothedRMS,
        isSpeaking: this.isSpeaking,
        speechDuration: this.speechDuration,
        silenceDuration: this.silenceDuration,
        totalTime: this.totalAccumulatedTime
      }
    };
  }

  /**
   * Décide si on doit envoyer l'audio maintenant
   * @private
   */
  _shouldSendAudio() {
    // CAS 1: Pas encore de parole détectée
    if (!this.isSpeaking && this.speechStartTime === null) {
      // Timeout maximum sans parole
      if (this.totalAccumulatedTime >= this.MAX_WAIT_TIME) {
        return {
          shouldSend: true,
          reason: 'timeout_no_speech',
          description: `Pas de parole après ${this.MAX_WAIT_TIME}s`
        };
      }
      return {
        shouldSend: false,
        reason: 'waiting_for_speech',
        description: 'En attente de parole'
      };
    }

    // CAS 2: Parole en cours
    if (this.isSpeaking && this.silenceDuration < this.SILENCE_BEFORE_SEND) {
      // Timeout de sécurité
      if (this.totalAccumulatedTime >= this.MAX_WAIT_TIME) {
        return {
          shouldSend: true,
          reason: 'max_time_reached',
          description: `Durée max atteinte (${this.MAX_WAIT_TIME}s)`
        };
      }
      return {
        shouldSend: false,
        reason: 'speech_in_progress',
        description: 'Parole en cours'
      };
    }

    // CAS 3: Silence suffisant après parole
    if (this.silenceDuration >= this.SILENCE_BEFORE_SEND) {
      // Vérifier la durée de parole
      if (this.speechDuration < this.MIN_SPEECH_DURATION) {
        return {
          shouldSend: false,
          reason: 'speech_too_short',
          description: `Parole trop courte (${this.speechDuration.toFixed(2)}s < ${this.MIN_SPEECH_DURATION}s)`
        };
      }

      // ✅ NOUVEAU: Ignorer les pauses naturelles (< 0.8s de silence)
      // Ces pauses sont juste des respirations, pas des fins de phrase
      if (this.silenceDuration < this.NATURAL_PAUSE_THRESHOLD) {
        return {
          shouldSend: false,
          reason: 'natural_pause',
          description: `Pause naturelle détectée (${this.silenceDuration.toFixed(2)}s < ${this.NATURAL_PAUSE_THRESHOLD}s) - pas une fin de phrase`
        };
      }

      // CAS 3A: Phrase courte (< 1s) - attendre un peu plus
      if (this.speechDuration < this.MIN_PHRASE_LENGTH) {
        const totalWaitTime = this.speechDuration + this.silenceDuration;
        const maxWaitForShort = this.MIN_PHRASE_LENGTH + this.SHORT_PHRASE_EXTENSION;

        if (totalWaitTime < maxWaitForShort) {
          return {
            shouldSend: false,
            reason: 'short_phrase_waiting',
            description: `Phrase courte (${this.speechDuration.toFixed(2)}s), attente de suite (${totalWaitTime.toFixed(2)}s/${maxWaitForShort}s)`
          };
        }
      }

      // CAS 3B: Phrase normale ou timeout atteint
      return {
        shouldSend: true,
        reason: 'end_of_speech',
        description: `Fin de phrase détectée (parole: ${this.speechDuration.toFixed(2)}s, silence: ${this.silenceDuration.toFixed(2)}s)`
      };
    }

    // Fallback
    return {
      shouldSend: false,
      reason: 'waiting',
      description: 'En attente'
    };
  }

  /**
   * Calcule le RMS (Root Mean Square) d'un buffer audio
   * @private
   */
  _calculateRMS(audioData) {
    if (!audioData || audioData.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }

    return Math.sqrt(sumSquares / audioData.length);
  }

  /**
   * Obtient le RMS lissé (moyenne des N dernières mesures)
   * @private
   */
  _getSmoothedRMS() {
    if (this.energyHistory.length === 0) return 0;

    const sum = this.energyHistory.reduce((acc, val) => acc + val, 0);
    return sum / this.energyHistory.length;
  }

  /**
   * Réinitialise l'état après un envoi
   * @private
   */
  _reset() {
    Logger.debug('[VAD] 🔄 Réinitialisation après envoi');

    this.isSpeaking = false;
    this.speechStartTime = null;
    this.lastSpeechTime = null;
    this.silenceDuration = 0;
    this.speechDuration = 0;
    this.totalAccumulatedTime = 0;
    this.energyHistory = [];
  }

  /**
   * Réinitialisation complète (changement de session)
   */
  hardReset() {
    this._reset();
    Logger.info('[VAD] 🧹 Réinitialisation complète');
  }

  /**
   * Ajuste les seuils de détection
   * @param {Object} thresholds - Nouveaux seuils
   */
  setThresholds(thresholds) {
    if (thresholds.silenceThreshold !== undefined) {
      this.SILENCE_THRESHOLD = thresholds.silenceThreshold;
    }
    if (thresholds.speechThreshold !== undefined) {
      this.SPEECH_THRESHOLD = thresholds.speechThreshold;
    }
    if (thresholds.silenceBeforeSend !== undefined) {
      this.SILENCE_BEFORE_SEND = thresholds.silenceBeforeSend;
    }

    Logger.info('[VAD] ⚙️ Seuils ajustés', {
      silenceThreshold: this.SILENCE_THRESHOLD,
      speechThreshold: this.SPEECH_THRESHOLD,
      silenceBeforeSend: this.SILENCE_BEFORE_SEND
    });
  }
}
