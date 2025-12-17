/**
 * CONSTANTES GLOBALES - KITT EXTENSION
 * =====================================
 * Toutes les valeurs configurables et constantes de l'application
 */

// ============================================================================
// CONFIGURATION AUDIO
// ============================================================================

export const AUDIO_CONFIG = {
  // Fréquence d'échantillonnage (Hz)
  SAMPLE_RATE: 44100,
  
  // Taille du buffer de traitement
  BUFFER_SIZE: 4096,
  
  // Intervalle d'envoi au backend (secondes)
  // ⚠️ NOTE: Ce paramètre est utilisé uniquement si VAD_ENABLED = false
  // Avec VAD activé, l'envoi se fait automatiquement à la fin de chaque phrase
  SEND_INTERVAL_SECONDS: 5,

  // ✅ NOUVEAU: Voice Activity Detection (VAD)
  // Active l'envoi intelligent basé sur la détection de fin de phrase
  // - true (recommandé): Envoie uniquement quand le commercial/client finit de parler
  // - false: Envoie toutes les SEND_INTERVAL_SECONDS (mode legacy)
  VAD_ENABLED: true,

  // Contraintes de capture audio
  CAPTURE_CONSTRAINTS: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100
    }
  },
  
  // Contraintes de capture écran
  DISPLAY_CONSTRAINTS: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100
    },
    video: true
  }
};

// ============================================================================
// TYPES D'INSIGHTS
// ============================================================================

export const INSIGHT_TYPES = {
  PROGRESSION: 'progression',
  OPPORTUNITY: 'opportunity',
  ALERT: 'alert'
};

export const VALID_INSIGHT_TYPES = Object.values(INSIGHT_TYPES);

// Configuration visuelle des types d'insights
// ✅ HARMONISÉ avec backend : Ajout des émojis utilisés côté backend pour cohérence
export const INSIGHT_VISUAL_CONFIG = {
  [INSIGHT_TYPES.PROGRESSION]: {
    color: '#48BB78',        // Vert
    iconPath: 'src/assets/icons/fusée.png',
    label: '🟢 Progression',
    emoji: '🟢',             // Émoji backend
    bgColor: 'rgba(72, 187, 120, 0.15)'
  },
  [INSIGHT_TYPES.OPPORTUNITY]: {
    color: '#4299E1',        // Bleu
    iconPath: 'src/assets/icons/cible.png',
    label: '🔵 Opportunité',
    emoji: '🔵',             // Émoji backend
    bgColor: 'rgba(66, 153, 225, 0.15)'
  },
  [INSIGHT_TYPES.ALERT]: {
    color: '#ED8936',        // ✅ CORRIGÉ: Rouge/Orange au lieu de orange clair pour cohérence avec 🔴
    iconPath: 'src/assets/icons/cloche.png',
    label: '🔴 Alerte',      // ✅ CORRIGÉ: 🔴 au lieu de 🟡 pour cohérence backend
    emoji: '🔴',             // Émoji backend
    bgColor: 'rgba(237, 137, 54, 0.15)'
  }
};

// ============================================================================
// THROTTLING & CACHE
// ============================================================================

export const THROTTLING_CONFIG = {
  // Intervalle minimum entre deux insights (millisecondes)
  // ⚡ OPTIMISÉ : Réduit de 7s à 3s pour un flux plus rapide
  MIN_ADVICE_INTERVAL: 3000,

  // Intervalle minimum pour le même type d'insight (millisecondes)
  // ⚡ OPTIMISÉ : Réduit de 5s à 2s
  SAME_TYPE_MIN_INTERVAL: 2000,
  
  // Seuil de similarité pour la détection de doublons (0-1)
  // Plus le nombre est bas, plus la détection est stricte
  SIMILARITY_THRESHOLD: 0.45,
  
  // Nombre maximum d'insights à garder en cache pour la détection
  MAX_CACHED_INSIGHTS: 10,
  
  // Nombre d'insights récents à comparer pour détecter les doublons
  RECENT_INSIGHTS_COMPARE_COUNT: 5
};

// ============================================================================
// AFFICHAGE & UI
// ============================================================================

export const UI_CONFIG = {
  // Durée d'affichage d'un insight avant suppression automatique (ms)
  INSIGHT_DISPLAY_DURATION: 300000, // 5 minutes
  
  // Durée de l'animation de nouvelle insight (ms)
  NEW_INSIGHT_ANIMATION_DURATION: 5000,
  
  // Hauteur maximale du conteneur d'insights (px)
  INSIGHTS_MAX_HEIGHT: 400,
  
  // Délai entre les animations en cascade (ms)
  CASCADE_ANIMATION_DELAY: 50,
  
  // Durée des transitions (ms)
  TRANSITION_DURATION: 300
};

// ============================================================================
// API & BACKEND
// ============================================================================

export const API_CONFIG = {
  // URL de base du backend
  BASE_URL: 'http://localhost:8000',
  
  // Endpoints
  ENDPOINTS: {
    CALLS_START: '/calls/start',
    CALLS_END: (sessionId) => `/calls/${sessionId}/end`,
    CALLS_STATE: (sessionId) => `/calls/${sessionId}/state`,
    AUDIO_UPLOAD: (sessionId) => `/audio/${sessionId}`,
    RESUME_GENERATE: (sessionId) => `/resume/${sessionId}`
  },
  
  // Timeouts (millisecondes)
  REQUEST_TIMEOUT: 30000,
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  RETRY_BACKOFF_MULTIPLIER: 2
};

// ============================================================================
// MESSAGES D'ERREUR
// ============================================================================

export const ERROR_MESSAGES = {
  // Permissions
  MICROPHONE_DENIED: "Microphone refusé. Vérifiez les permissions système (Préférences → Sécurité → Microphone)",
  SCREEN_DENIED: "Partage d'écran refusé. Assurez-vous de sélectionner 'Partager l'audio de l'onglet'",
  NO_AUDIO_TRACK: "Aucune piste audio détectée. Cochez bien 'Partager l'audio' dans la popup",
  
  // Session
  NO_ACTIVE_SESSION: "Aucune session active. Démarrez un appel d'abord.",
  SESSION_CREATE_FAILED: "Impossible de créer la session",
  SESSION_CLOSE_FAILED: "Erreur lors de la fermeture de la session",
  
  // Backend
  BACKEND_UNREACHABLE: "Impossible de joindre le backend. Vérifiez qu'il est bien lancé sur localhost:8000",
  SUMMARY_GENERATION_FAILED: "Erreur lors de la génération du résumé",
  
  // Audio
  AUDIO_PROCESSING_ERROR: "Erreur de traitement audio",
  AUDIO_SEND_FAILED: "Échec de l'envoi des données audio",
  
  // Validation
  INVALID_INSIGHT_TYPE: "Type d'insight invalide",
  INVALID_SESSION_ID: "ID de session invalide"
};

// ============================================================================
// MESSAGES DE SUCCÈS
// ============================================================================

export const SUCCESS_MESSAGES = {
  SESSION_STARTED: "✅ Écoute démarrée avec succès",
  SESSION_STOPPED: "✅ Écoute arrêtée",
  PERMISSIONS_OK: "✅ Toutes les permissions fonctionnent !",
  REPORT_GENERATED: "✅ Rapport généré avec succès"
};

// ============================================================================
// NIVEAUX & GAMIFICATION
// ============================================================================

export const LEVEL_CONFIG = {
  // Points requis pour chaque niveau
  LEVEL_THRESHOLDS: [
    { level: 1, minPoints: 0, maxPoints: 1000 },
    { level: 2, minPoints: 1000, maxPoints: 6000 },
    { level: 3, minPoints: 6000, maxPoints: 15000 },
    { level: 4, minPoints: 15000, maxPoints: 30000 },
    { level: 5, minPoints: 30000, maxPoints: 50000 },
    { level: 6, minPoints: 50000, maxPoints: 100000 },
    { level: 7, minPoints: 100000, maxPoints: Infinity }
  ],
  
  // Points gagnés par action
  POINTS_PER_ACTION: {
    CALL_COMPLETED: 100,
    INSIGHT_APPLIED: 50,
    REPORT_GENERATED: 200,
    DAILY_LOGIN: 10,
    STREAK_BONUS: 25
  },
  
  // Badges et récompenses
  BADGES: {
    FIRST_CALL: { id: 'first_call', name: 'Premier Appel', points: 50 },
    TEN_CALLS: { id: 'ten_calls', name: '10 Appels', points: 500 },
    MASTER: { id: 'master', name: 'Maître', points: 2000 }
  }
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  CURRENT_SESSION_ID: 'kitt_current_session_id',
  USER_LEVEL: 'kitt_user_level',
  USER_POINTS: 'kitt_user_points',
  INSIGHTS_CACHE: 'kitt_insights_cache',
  SETTINGS: 'kitt_settings',
  LAST_SESSION_DATE: 'kitt_last_session_date',
  CALL_HISTORY: 'kitt_call_history'
};

// ============================================================================
// VALIDATIONS
// ============================================================================

export const VALIDATION_RULES = {
  // Session ID doit être un UUID valide
  SESSION_ID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  
  // Titre d'insight
  INSIGHT_TITLE_MIN_LENGTH: 3,
  INSIGHT_TITLE_MAX_LENGTH: 100,
  
  // Description d'insight
  INSIGHT_DESCRIPTION_MIN_LENGTH: 10,
  INSIGHT_DESCRIPTION_MAX_LENGTH: 500,
  
  // Buffer audio
  MIN_BUFFER_SIZE: 100,
  MAX_BUFFER_SIZE: 441000  // ✅ CORRIGÉ: 10 secondes à 44100 Hz (réduit de 1000000 pour cohérence)
};

// ============================================================================
// LOGGING
// ============================================================================

export const LOG_CONFIG = {
  // Niveau de log (DEBUG, INFO, WARN, ERROR)
  LOG_LEVEL: 'INFO',
  
  // Préfixes pour chaque type de log
  LOG_PREFIXES: {
    DEBUG: '🐛',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    SESSION: '🚀',
    INSIGHT: '💡',
    AUDIO: '🎤',
    API: '🌐'
  },
  
  // Activer les logs détaillés
  VERBOSE: false
};

// ============================================================================
// ANIMATIONS
// ============================================================================

export const ANIMATION_CONFIG = {
  // Durées
  FADE_DURATION: 500,
  SLIDE_DURATION: 400,
  COLLAPSE_DURATION: 300,
  
  // Easing functions
  EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
  
  // Transformations
  SLIDE_DISTANCE: 30 // px
};

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURE_FLAGS = {
  // Activer le système de niveaux
  ENABLE_LEVEL_SYSTEM: true,
  
  // Activer les animations avancées
  ENABLE_ANIMATIONS: true,
  
  // Activer le mode debug
  DEBUG_MODE: false,
  
  // Activer les analytics
  ENABLE_ANALYTICS: false,
  
  // Activer le cache de résumés
  ENABLE_SUMMARY_CACHE: true
};

// ============================================================================
// EXPORT DEFAULT (pour import simplifié)
// ============================================================================

export default {
  AUDIO_CONFIG,
  INSIGHT_TYPES,
  INSIGHT_VISUAL_CONFIG,
  THROTTLING_CONFIG,
  UI_CONFIG,
  API_CONFIG,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  LEVEL_CONFIG,
  STORAGE_KEYS,
  VALIDATION_RULES,
  LOG_CONFIG,
  ANIMATION_CONFIG,
  FEATURE_FLAGS
};