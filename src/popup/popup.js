/**
 * POPUP.JS - ORCHESTRATEUR PRINCIPAL
 * ===================================
 * Version restructurée selon l'architecture modulaire
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Services
import { AudioCaptureService } from '../services/audio/AudioCaptureService.js';
import { AudioProcessingService } from '../services/audio/AudioProcessingService.js';
import { SessionService } from '../services/api/SessionService.js';

// Composants
import { InsightsManager } from '../components/insights/InsightsManager.js';
import { ReportGenerator } from '../components/report/ReportGenerator.js';
import { LevelSystem } from '../components/level/LevelSystem.js';
import { CollapsibleSection } from '../components/ui/CollapsibleSection.js';

// Utils
import { Logger } from '../utils/logger.js';
import { FEATURE_FLAGS } from '../utils/constants.js';

// ============================================================================
// SÉLECTION DES ÉLÉMENTS DOM
// ============================================================================

const elements = {
  // Boutons
  startStopBtn: document.getElementById('startStopBtn'),
  openWindowBtn: document.getElementById('openWindow'),
  generateReportBtn: document.getElementById('generateReport'),
  resetBtn: document.getElementById('resetBtn'),
  testPermissionsBtn: document.getElementById('testPermissions'),
  
  // Containers
  adviceList: document.getElementById('adviceList'),
  emptyState: document.getElementById('emptyState'),
  reportContent: document.getElementById('reportContent'),
  reportLoading: document.getElementById('reportLoading'),
  reportData: document.getElementById('reportData'),
  reportEmpty: document.getElementById('reportEmpty'),
  
  // Level system
  levelBadge: document.getElementById('levelBadge'),
  levelTitle: document.getElementById('levelTitle'),
  levelSubtitle: document.getElementById('levelSubtitle'),
  progressFill: document.getElementById('progressFill'),
  currentLevelLabel: document.getElementById('currentLevelLabel'),
  progressScore: document.getElementById('progressScore'),
  nextLevelLabel: document.getElementById('nextLevelLabel'),
  
  // Debug
  debugCard: document.getElementById('debugCard'),
  debugInfo: document.getElementById('debugInfo')
};

// ============================================================================
// INITIALISATION DES SERVICES ET COMPOSANTS
// ============================================================================

let audioCaptureService = null;
let audioProcessingService = null;
let sessionService = null;
let insightsManager = null;
let reportGenerator = null;
let levelSystem = null;

let isListening = false;
let isInitializing = false; // 🆕 Protection contre les appels multiples

/**
 * Initialise tous les services et composants
 */
async function initializeApp() {
  Logger.info('🚀 Initialisation de l\'application KITT');
  
  try {
    // Initialiser les services
    audioCaptureService = new AudioCaptureService();
    audioProcessingService = new AudioProcessingService();
    sessionService = new SessionService();
    
    // Initialiser les composants
    insightsManager = new InsightsManager(
      elements.adviceList,
      elements.emptyState
    );
    
    reportGenerator = new ReportGenerator(
      elements.reportData,
      elements.reportLoading,
      elements.reportEmpty
    );
    
    levelSystem = new LevelSystem({
      badgeElement: elements.levelBadge,
      titleElement: elements.levelTitle,
      subtitleElement: elements.levelSubtitle,
      progressFillElement: elements.progressFill,
      currentLevelElement: elements.currentLevelLabel,
      scoreElement: elements.progressScore,
      nextLevelElement: elements.nextLevelLabel
    });
    
    // Initialiser les sections pliables
    CollapsibleSection.initializeAll();
    
    // Charger les données persistantes
    await loadPersistedData();
    
    // Activer le mode debug si nécessaire
    if (FEATURE_FLAGS.DEBUG_MODE) {
      elements.debugCard.style.display = 'block';
    }
    
    Logger.info('✅ Application initialisée avec succès');
    
  } catch (error) {
    Logger.error('❌ Erreur lors de l\'initialisation', error);
    showErrorNotification('Erreur d\'initialisation de l\'application');
  }
}

/**
 * Charge les données persistantes depuis le storage
 */
async function loadPersistedData() {
  try {
    await levelSystem.loadFromStorage();
    Logger.debug('Données de niveau chargées');
  } catch (error) {
    Logger.warn('Impossible de charger les données persistantes', error);
  }
}

// ============================================================================
// GESTION DE L'ÉCOUTE (START / STOP)
// ============================================================================

/**
 * Démarre l'écoute audio
 */
async function startListening() {
  Logger.session('Démarrage de l\'écoute');
  
  // 🆕 PROTECTION : Empêcher les appels multiples
  if (isInitializing || isListening) {
    Logger.warn('⚠️ Écoute déjà en cours ou en démarrage');
    return;
  }
  
  isInitializing = true;
  
  try {
    // Désactiver le bouton pendant le démarrage
    elements.startStopBtn.disabled = true;
    
    // 🆕 NETTOYER les anciennes instances si elles existent
    await cleanupAudioResources();
    
    // 🆕 RECRÉER les services (pour être sûr d'avoir des instances fraîches)
    audioCaptureService = new AudioCaptureService();
    audioProcessingService = new AudioProcessingService();
    
    // 1. Créer la session
    const sessionId = await sessionService.createSession();
    Logger.session('Session créée', { sessionId });
    
    // 2. Capturer l'audio (microphone + écran)
    const { micStream, displayStream } = await audioCaptureService.startCapture();
    
    // 3. Démarrer le traitement audio
    await audioProcessingService.startProcessing(
      micStream,
      displayStream,
      sessionId,
      handleAudioData
    );
    
    // 4. Mettre à jour l'UI
    updateUIForListening(true);
    isListening = true;
    
    Logger.session('✅ Écoute démarrée avec succès');
    
  } catch (error) {
    Logger.error('❌ Erreur lors du démarrage de l\'écoute', error);
    
    // Nettoyer en cas d'erreur
    await cleanupAudioResources();
    
    // Afficher un message d'erreur approprié
    showErrorNotification(error.message);
    
  } finally {
    isInitializing = false;
    elements.startStopBtn.disabled = false;
  }
}

/**
 * Arrête l'écoute audio
 */
async function stopListening() {
  Logger.session('Arrêt de l\'écoute');
  
  try {
    // 1. Arrêter le traitement audio
    if (audioProcessingService) {
      audioProcessingService.stopProcessing();
    }
    
    // 2. Arrêter la capture audio
    if (audioCaptureService) {
      audioCaptureService.stopCapture();
    }
    
    // 3. Mettre à jour l'UI
    updateUIForListening(false);
    isListening = false;
    
    Logger.session('✅ Écoute arrêtée');
    
  } catch (error) {
    Logger.error('❌ Erreur lors de l\'arrêt de l\'écoute', error);
  }
}

/**
 * Nettoie toutes les ressources audio
 */
async function cleanupAudioResources() {
  Logger.debug('🧹 Nettoyage des ressources audio');
  
  // Arrêter le traitement audio
  if (audioProcessingService) {
    try {
      audioProcessingService.stopProcessing();
      Logger.debug('✓ AudioProcessingService arrêté');
    } catch (e) {
      Logger.warn('Erreur arrêt AudioProcessingService', e);
    }
  }
  
  // Arrêter la capture audio
  if (audioCaptureService) {
    try {
      audioCaptureService.stopCapture();
      Logger.debug('✓ AudioCaptureService arrêté');
    } catch (e) {
      Logger.warn('Erreur arrêt AudioCaptureService', e);
    }
  }
  
  // Fermer la session si active
  if (sessionService && sessionService.hasActiveSession()) {
    try {
      await sessionService.endSession();
      Logger.debug('✓ Session fermée');
    } catch (e) {
      Logger.warn('Erreur fermeture session', e);
    }
  }
  
  Logger.debug('✅ Nettoyage terminé');
}

/**
 * Met à jour l'interface pour refléter l'état d'écoute
 * @param {boolean} listening - true si en écoute, false sinon
 */
function updateUIForListening(listening) {
  if (listening) {
    elements.startStopBtn.classList.remove('btn-start-listening');
    elements.startStopBtn.classList.add('btn-stop-listening');
    elements.startStopBtn.textContent = 'Stop Listening';
  } else {
    elements.startStopBtn.classList.remove('btn-stop-listening');
    elements.startStopBtn.classList.add('btn-start-listening');
    elements.startStopBtn.textContent = 'Start Listening';
  }
}

// ============================================================================
// GESTION DES DONNÉES AUDIO
// ============================================================================

/**
 * Callback appelé quand des données audio sont traitées
 * @param {Object} data - Données retournées par le backend
 */
function handleAudioData(data) {
  Logger.audio('Données audio reçues', { hasAdvice: !!data.advice });
  
  // Traiter l'insight si présent
  if (data.advice) {
    const displayed = insightsManager.displayInsight(data.advice);
    
    if (displayed) {
      // Ajouter des points si l'insight est affiché
      levelSystem.addPoints(10);
    }
  }
  
  // Enregistrer la transcription si présente
  if (data.transcription && data.transcription.trim()) {
    sessionService.addTranscript(data.transcription);
  }
  
  // Log la raison si pas d'insight
  if (data.reason) {
    Logger.debug(`Pas d'insight: ${data.reason}`);
  }
}

// ============================================================================
// GÉNÉRATION DE RAPPORT
// ============================================================================

/**
 * Génère le compte-rendu de la session
 */
async function generateReport() {
  Logger.info('🎯 Génération du compte-rendu');
  
  if (!sessionService.hasActiveSession()) {
    showErrorNotification('Aucune session active. Démarrez un appel d\'abord.');
    return;
  }
  
  try {
    // Désactiver le bouton pendant la génération
    elements.generateReportBtn.disabled = true;
    
    // Générer le rapport
    const report = await reportGenerator.generate(
      sessionService.getSessionId(),
      sessionService.getFullTranscript()
    );
    
    // Afficher le rapport
    await reportGenerator.display(report);
    
    // Ajouter des points pour la génération du rapport
    levelSystem.addPoints(200);
    
    // Terminer la session
    await sessionService.endSession();
    
    Logger.info('✅ Compte-rendu généré avec succès');
    
  } catch (error) {
    Logger.error('❌ Erreur lors de la génération du rapport', error);
    showErrorNotification('Erreur lors de la génération du compte-rendu');
    
  } finally {
    elements.generateReportBtn.disabled = false;
  }
}

// ============================================================================
// GESTION DES ÉVÉNEMENTS
// ============================================================================

/**
 * Initialise tous les event listeners
 */
function initializeEventListeners() {
  // Bouton Start/Stop
  if (elements.startStopBtn) {
    elements.startStopBtn.addEventListener('click', async () => {
      if (!isListening) {
        await startListening();
      } else {
        await stopListening();
      }
    });
  }
  
  // Bouton Open Window
  if (elements.openWindowBtn) {
    elements.openWindowBtn.addEventListener('click', () => {
      chrome.windows.create({
        url: chrome.runtime.getURL('src/popup/popup.html'),
        type: 'popup',
        width: 450,
        height: 900,
        focused: true
      });
    });
  }
  
  // Bouton Generate Report
  if (elements.generateReportBtn) {
    elements.generateReportBtn.addEventListener('click', generateReport);
  }
  
  // Bouton Reset
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      
      if (confirm('Voulez-vous effacer tous les insights affichés ?')) {
        insightsManager.clearAllInsights(true);
      }
    });
  }
  
  // Bouton Test Permissions (debug)
  if (elements.testPermissionsBtn) {
    elements.testPermissionsBtn.addEventListener('click', async () => {
      Logger.info('🧪 Test des permissions');
      
      try {
        const result = await AudioCaptureService.testPermissions();
        
        const message = `
          ✅ Microphone: ${result.microphone ? 'OK' : 'KO'}
          ✅ Écran: ${result.screen ? 'OK' : 'KO'}
          📊 Pistes audio: ${result.audioTracks || 0}
          ${result.errors.length > 0 ? '\n❌ Erreurs:\n' + result.errors.join('\n') : ''}
        `;
        
        if (elements.debugInfo) {
          elements.debugInfo.textContent = message;
        }
        
        alert(result.microphone && result.screen ? 
          '✅ Toutes les permissions fonctionnent !' : 
          '❌ Certaines permissions sont manquantes'
        );
        
      } catch (error) {
        Logger.error('❌ Erreur test permissions', error);
        alert(`❌ Erreur: ${error.message}`);
      }
    });
  }
  
  // Gérer la fermeture de la popup
  window.addEventListener('beforeunload', async () => {
    if (isListening) {
      await cleanupAudioResources();
    }
  });
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Affiche une notification d'erreur
 * @param {string} message - Message d'erreur
 */
function showErrorNotification(message) {
  // TODO: Implémenter un système de toast/notification
  alert(`❌ ${message}`);
}

/**
 * Affiche une notification de succès
 * @param {string} message - Message de succès
 */
function showSuccessNotification(message) {
  // TODO: Implémenter un système de toast/notification
  console.log(`✅ ${message}`);
}

// ============================================================================
// INITIALISATION AU CHARGEMENT
// ============================================================================

/**
 * Point d'entrée principal de l'application
 */
async function main() {
  try {
    Logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    Logger.info('🚗 KITT Extension - Démarrage');
    Logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Initialiser l'application
    await initializeApp();
    
    // Initialiser les event listeners
    initializeEventListeners();
    
    Logger.info('✨ Application prête');
    
  } catch (error) {
    Logger.error('💥 Erreur fatale lors de l\'initialisation', error);
    showErrorNotification('Erreur critique lors du chargement de l\'application');
  }
}

// Lancer l'application quand le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// ============================================================================
// EXPORTS (pour les tests)
// ============================================================================

export {
  startListening,
  stopListening,
  generateReport,
  handleAudioData
};