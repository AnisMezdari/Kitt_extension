/*
============================================================================
POPUP.JS MODERNISÉ - VERSION AVEC DESIGN AMÉLIORÉ ET FIX macOS
============================================================================
*/

// ======== SÉLECTION DES ÉLÉMENTS DOM ========
const startStopBtn = document.getElementById("startStopBtn");
const adviceList = document.getElementById("advice");
const emptyState = document.getElementById("empty-state");
const openWindowBtn = document.getElementById("openWindow");
const generateReportBtn = document.getElementById("generateReport");
const reportContent = document.getElementById("reportContent");
const reportLoading = document.getElementById("reportLoading");
const reportData = document.getElementById("reportData");
const reportEmpty = document.getElementById("reportEmpty");
const resetBtn = document.getElementById('resetBtn');

// ======== VARIABLES GLOBALES ========
let mediaStream = null;
let micStream = null;
let audioContext = null;
let processor = null;
let audioBuffer = { client: [], commercial: [] };
let isListening = false;
let currentSessionId = null;
let conversationTranscript = [];

let sendIntervalSeconds = 3;
let bufferThreshold = 661500;

// Throttling optimisé
let lastAdviceTime = 0;
import { THROTTLING_CONFIG, UI_CONFIG } from './utils/constants.js';
const minInterval = THROTTLING_CONFIG.MIN_ADVICE_INTERVAL;
const displayDuration = UI_CONFIG.INSIGHT_DISPLAY_DURATION;



// Cache local des insights
let displayedInsights = [];
const MAX_CACHED_INSIGHTS = 10;

// ======== BOUTON DE TEST DES PERMISSIONS ========
document.getElementById('testPermissions')?.addEventListener('click', async () => {
  console.log("🧪 Test des permissions...");
  
  try {
    const micTest = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Microphone OK");
    micTest.getTracks().forEach(t => t.stop());
    
    const displayTest = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    console.log("✅ Partage d'écran OK");
    console.log("📊 Pistes audio:", displayTest.getAudioTracks().length);
    displayTest.getTracks().forEach(t => t.stop());
    
    alert("✅ Toutes les permissions fonctionnent !");
  } catch (e) {
    console.error("❌ Erreur:", e);
    alert(`❌ Erreur: ${e.message}\n\nSur Mac, vérifiez:\n- Préférences Système → Sécurité → Microphone\n- Préférences Système → Sécurité → Enregistrement d'écran`);
  }
});

// ======== GESTION DES SECTIONS PLIABLES ========
document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', function(e) {
    // Ne pas plier/déplier si on clique sur un bouton ou un élément interactif
    if (e.target.classList.contains('btn-generate-small') || 
        e.target.classList.contains('btn-start-listening') ||
        e.target.classList.contains('btn-stop-listening') ||
        e.target.classList.contains('btn-reset')) {
      return;
    }
    
    const target = this.getAttribute('data-target');
    const content = document.getElementById(target);
    
    if (!content) return;
    
    const isCollapsed = content.classList.contains('collapsed');
    
    if (isCollapsed) {
      content.classList.remove('collapsed');
      this.classList.add('expanded');
    } else {
      content.classList.add('collapsed');
      this.classList.remove('expanded');
    }
  });
});

// ======== OUVRIR L'EXTENSION DANS UNE NOUVELLE FENÊTRE ========
if (openWindowBtn) {
  openWindowBtn.onclick = () => {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html"),
      type: "popup",
      width: 450,
      height: 900,
      focused: true
    });
  };
}

// ======== CONFIGURATION DES TYPES DE CONSEILS ========
const adviceTypes = {
  progression: {
    color: '#48BB78',
    icon: chrome.runtime.getURL('img/fusée.png'),
    label: '🟢 Progression'
  },
  opportunity: {
    color: '#4299E1',
    icon: chrome.runtime.getURL('img/cible.png'),
    label: '🔵 Opportunité'
  },
  alert: {
    color: '#F6AD55',
    icon: chrome.runtime.getURL('img/cloche.png'),
    label: '🟡 Alerte'
  }
};

// ======== FONCTION DE VÉRIFICATION DE DOUBLON ========
function isInsightDuplicate(newInsight) {
  const newText = `${newInsight.title} ${newInsight.details.description}`.toLowerCase();
  
  for (let i = Math.max(0, displayedInsights.length - 5); i < displayedInsights.length; i++) {
    const oldInsight = displayedInsights[i];
    const oldText = `${oldInsight.title} ${oldInsight.details.description}`.toLowerCase();
    
    const newWords = new Set(newText.split(/\s+/));
    const oldWords = new Set(oldText.split(/\s+/));
    
    const intersection = new Set([...newWords].filter(x => oldWords.has(x)));
    const union = new Set([...newWords, ...oldWords]);
    
    const similarity = intersection.size / union.size;
    
    if (similarity > 0.45) {
      return true;
    }
  }
  
  return false;
}

// ======== FONCTION POUR SUPPRIMER UN INSIGHT APRÈS EXPIRATION ========
function removeInsightAfterDelay(insightElement, delay) {
  setTimeout(() => {
    insightElement.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    insightElement.style.opacity = '0';
    insightElement.style.transform = 'translateX(-30px)';
    
    setTimeout(() => {
      insightElement.remove();
      
      if (adviceList.querySelectorAll('.advice-item').length === 0) {
        emptyState.style.display = "block";
      }
    }, 500);
  }, delay);
}

// ======== AFFICHAGE DES CONSEILS ========
function displayAdvice(advice) {
  const now = Date.now();
  
  // Throttling
  if (now - lastAdviceTime < MIN_ADVICE_INTERVAL) {
    console.log(`[THROTTLE] Trop tôt (${(now - lastAdviceTime) / 1000}s < 7s)`);
    return;
  }
  
  // Vérification doublon
  if (isInsightDuplicate(advice)) {
    console.log(`[BLOCKED] Insight trop similaire détecté`);
    return;
  }
  
  // Vérification du même type dans les 5 dernières secondes
  const recentInsights = adviceList.querySelectorAll('.advice-item');
  for (let item of recentInsights) {
    const itemType = item.getAttribute('data-type');
    const itemTimestamp = parseInt(item.getAttribute('data-timestamp') || '0');
    
    if (itemType === advice.type && (now - itemTimestamp) < 5000) {
      console.log(`[BLOCKED] Même type "${advice.type}" détecté il y a ${((now - itemTimestamp) / 1000).toFixed(1)}s`);
      return;
    }
  }
  
  lastAdviceTime = now;
  
  // Ajouter au cache
  displayedInsights.push(advice);
  if (displayedInsights.length > MAX_CACHED_INSIGHTS) {
    displayedInsights = displayedInsights.slice(-MAX_CACHED_INSIGHTS);
  }
  
  // Retirer la classe "new-insight" des anciens
  adviceList.querySelectorAll('.advice-item').forEach(item => {
    item.classList.remove('new-insight');
  });
  
  emptyState.style.display = "none";

  const adviceItem = document.createElement("div");
  adviceItem.className = "advice-item new-insight";
  adviceItem.setAttribute("data-timestamp", now.toString());

  const title = advice.title || "Conseil IA";
  let type = advice.type || "progression";
  const details = advice.details || {};
  const description = details.description || "Aucune description disponible";
  
  // Validation du type
  const validTypes = ["progression", "opportunity", "alert"];
  if (!validTypes.includes(type)) {
    console.warn(`[VALIDATION] Type invalide : ${type}. Utilisation de "progression"`);
    type = "progression";
  }
  
  adviceItem.setAttribute("data-type", type);

  const typeConfig = adviceTypes[type] || adviceTypes.progression;
  
  adviceItem.innerHTML = `
    <div class="advice-icon-container">
      <img src="${typeConfig.icon}" alt="${typeConfig.label}" class="advice-icon-image">
    </div>
    <div class="advice-text-content">
      <div class="advice-compact-title">${title}</div>
      <p class="advice-compact-description">${description}</p>
    </div>
    <button class="advice-menu-btn">⋮</button>
  `;

  adviceList.appendChild(adviceItem);
  
  requestAnimationFrame(() => {
    adviceItem.classList.add("show");
    setTimeout(() => {
      try {
        adviceItem.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch (e) {
        adviceList.scrollTop = adviceList.scrollHeight;
      }
    }, 20);
  });
  
  setTimeout(() => {
    adviceItem.classList.remove('new-insight');
  }, 5000);
  
  removeInsightAfterDelay(adviceItem, INSIGHT_DISPLAY_DURATION);
  
  console.log(`[INSIGHT] Affiché : ${typeConfig.label} - ${title}`);
}

// ======== BOUTON RESET - EFFACER TOUS LES INSIGHTS ========
if (resetBtn) {
  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Demander confirmation
    if (confirm('Voulez-vous effacer tous les insights affichés ?')) {
      // Animer la disparition de chaque insight
      const insights = adviceList.querySelectorAll('.advice-item');
      
      insights.forEach((insight, index) => {
        setTimeout(() => {
          insight.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          insight.style.opacity = '0';
          insight.style.transform = 'translateX(-30px)';
          
          setTimeout(() => {
            insight.remove();
            
            // Afficher l'état vide si c'était le dernier
            if (index === insights.length - 1) {
              emptyState.style.display = "block";
            }
          }, 300);
        }, index * 50); // Effet en cascade
      });
      
      // Vider le cache
      displayedInsights = [];
      
      console.log('[RESET] Tous les insights ont été effacés');
    }
  });
}

// ======== GÉNÉRER LE COMPTE-RENDU ========
if (generateReportBtn) {
  generateReportBtn.onclick = async () => {
    if (!currentSessionId) {
      alert("Aucune session active. Démarrez un appel d'abord.");
      return;
    }

    reportEmpty.style.display = "none";
    reportContent.style.display = "block";
    reportLoading.style.display = "block";
    reportData.innerHTML = "";
    generateReportBtn.disabled = true;

    try {
      let fullTranscript = conversationTranscript.join("\n");
      
      if (!fullTranscript.trim() || conversationTranscript.length === 0) {
        const stateResponse = await fetch(`http://localhost:8000/calls/${currentSessionId}/state`);
        
        if (!stateResponse.ok) {
          throw new Error("Impossible de récupérer l'état de la session");
        }
        
        const stateData = await stateResponse.json();
        
        if (stateData.message_count === 0) {
          throw new Error("Aucune conversation enregistrée.");
        }
      }

      const response = await fetch(`http://localhost:8000/resume/${currentSessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: currentSessionId,
          user_message: fullTranscript || "",
          timestamp: Date.now()
        })
      });

      if (!response.ok) {
        throw new Error("Erreur lors de la génération du résumé");
      }

      const data = await response.json();
      const summary = data.summary;

      reportLoading.style.display = "none";
      displaySummary(summary);

      // Fermer la session
      if (currentSessionId) {
        fetch(`http://localhost:8000/calls/${currentSessionId}/end`, {
          method: "POST"
        })
        .then(res => res.json())
        .then(data => {
          console.log("[SESSION] Terminée:", data);
        })
        .catch(err => console.error("Erreur fermeture session:", err));
        
        currentSessionId = null;
      }

    } catch (error) {
      console.error("Erreur génération résumé:", error);
      reportLoading.style.display = "none";
      reportData.innerHTML = `
        <div style="color: #FC8181; padding: 16px; background: rgba(254, 178, 178, 0.1); border-radius: 8px;">
          <p>❌ ${error.message}</p>
        </div>
      `;
    } finally {
      generateReportBtn.disabled = false;
    }
  };
}

// ======== AFFICHER LE RÉSUMÉ FORMATÉ ========
function displaySummary(summary) {
  if (!summary) return;

  const replaceAsterisks = (text) => {
    if (!text || typeof text !== "string") return text;
    return text.replace(/\*/g, "Le client");
  };

  const keyPoints = summary.key_points || {};
  const nextActions = summary.next_actions || {};
  const mainSummary = replaceAsterisks(summary.summary?.main || "Résumé non disponible.");
  const detailedSummary = replaceAsterisks(summary.summary?.details || "");

  if (keyPoints.strengths) keyPoints.strengths = keyPoints.strengths.map(replaceAsterisks);
  if (keyPoints.weaknesses) keyPoints.weaknesses = keyPoints.weaknesses.map(replaceAsterisks);
  if (keyPoints.improvements) keyPoints.improvements = keyPoints.improvements.map(replaceAsterisks);
  if (nextActions.actions) {
    nextActions.actions = nextActions.actions.map(a => ({
      ...a,
      action: replaceAsterisks(a.action),
      reason: replaceAsterisks(a.reason)
    }));
  }

  let html = `
    <div class="summary-subsection">
      <div class="subsection-header">
        <h3>📝 Résumé de l'appel</h3>
        <button class="subsection-toggle">▼</button>
      </div>
      <div class="subsection-content">
        <div style="background: rgba(124, 93, 250, 0.1); border-left: 4px solid #7C5DFA; padding: 14px; border-radius: 8px; margin-bottom: 12px;">
          <p style="margin: 0; line-height: 1.6; color: #E2E8F0;">${mainSummary}</p>
          ${detailedSummary ? `<p style="margin-top: 12px; color: #A0AEC0; font-size: 13px;">${detailedSummary}</p>` : ''}
        </div>
      </div>
    </div>

    ${nextActions.actions?.length ? `
      <div class="summary-subsection">
        <div class="subsection-header">
          <h3>🚀 Prochaines actions</h3>
          <button class="subsection-toggle">▼</button>
        </div>
        <div class="subsection-content">
          <ul class="summary-list">
            ${nextActions.actions.map(a => `
              <li style="border-left: 3px solid #48BB78;">
                <strong style="color: #E2E8F0;">${a.action}</strong><br>
                <span style="color: #F6AD55; font-size: 12px;">⏰ ${a.deadline || 'Non spécifié'}</span><br>
                <span style="color: #A0AEC0; font-size: 13px;">💡 ${a.reason || '-'}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    ` : ''}

    ${keyPoints.score || keyPoints.strengths?.length || keyPoints.weaknesses?.length || keyPoints.improvements?.length ? `
      <div class="summary-subsection">
        <div class="subsection-header">
          <h3>🎯 Points clés & Évaluation</h3>
          <button class="subsection-toggle">▼</button>
        </div>
        <div class="subsection-content">
          ${keyPoints.score ? `
            <div style="background: rgba(124, 93, 250, 0.15); border-left: 4px solid #7C5DFA; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
              <p style="font-size: 24px; font-weight: bold; color: #7C5DFA; margin: 0;">
                ${keyPoints.score.value}/20
              </p>
              <p style="color: #A0AEC0; font-size: 13px; margin: 4px 0 0 0;">
                ${replaceAsterisks(keyPoints.score.comment || '')}
              </p>
            </div>
          ` : ''}

          ${keyPoints.strengths?.length ? `
            <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">✅ Points forts</p>
            <ul class="summary-list" style="margin-bottom: 16px;">
              ${keyPoints.strengths.map(s => `<li style="border-left: 3px solid #48BB78;">${s}</li>`).join('')}
            </ul>
          ` : ''}

          ${keyPoints.weaknesses?.length ? `
            <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">⚠️ Points faibles</p>
            <ul class="summary-list" style="margin-bottom: 16px;">
              ${keyPoints.weaknesses.map(w => `<li style="border-left: 3px solid #E53E3E;">${w}</li>`).join('')}
            </ul>
          ` : ''}

          ${keyPoints.improvements?.length ? `
            <p style="color: #E2E8F0; font-weight: 600; margin-bottom: 8px;">🎯 Axes d'amélioration</p>
            <ul class="summary-list">
              ${keyPoints.improvements.map(i => `<li style="border-left: 3px solid #F6AD55;">${i}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      </div>
    ` : ''}
  `;

  reportData.innerHTML = html;

  // Ajouter les gestionnaires pour déplier/replier les sous-sections
  reportData.querySelectorAll('.subsection-header').forEach(header => {
    const button = header.querySelector('.subsection-toggle');
    const content = header.nextElementSibling;
    
    header.onclick = () => {
      const isCollapsed = content.classList.contains("collapsed");
      if (isCollapsed) {
        content.classList.remove("collapsed");
        button.textContent = "▼";
      } else {
        content.classList.add("collapsed");
        button.textContent = "▲";
      }
    };
  });
}

// ======== DÉMARRER / ARRÊTER L'ÉCOUTE - VERSION OPTIMISÉE macOS ========
if (startStopBtn) {
  startStopBtn.onclick = async () => {
    if (!isListening) {
      try {
        // Créer la session
        const sessionResponse = await fetch("http://localhost:8000/calls/start", { 
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        
        if (!sessionResponse.ok) {
          throw new Error("Impossible de créer la session");
        }
        
        const sessionData = await sessionResponse.json();
        currentSessionId = sessionData.call_id;
        conversationTranscript = [];
        displayedInsights = [];
        
        console.log(`\n🚀 SESSION: ${currentSessionId}\n`);
        
        // ÉTAPE 1 : Capturer le microphone EN PREMIER (plus fiable sur Mac)
        console.log("🎤 Demande d'accès au microphone...");
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 44100
            }
          });
          console.log("✅ Microphone capturé");
        } catch (micError) {
          console.error("❌ Erreur microphone:", micError);
          throw new Error("Microphone refusé. Vérifiez les permissions système (Préférences → Sécurité → Microphone)");
        }
        
        // ÉTAPE 2 : Capturer l'audio de l'onglet
        console.log("🖥️ Demande d'accès à l'audio de l'onglet...");
        try {
          mediaStream = await navigator.mediaDevices.getDisplayMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              sampleRate: 44100
            }, 
            video: true 
          });
          console.log("✅ Audio de l'onglet capturé");
        } catch (displayError) {
          console.error("❌ Erreur capture écran:", displayError);
          
          // Nettoyer le micro si l'écran échoue
          if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
            micStream = null;
          }
          
          throw new Error("Partage d'écran refusé. Assurez-vous de sélectionner 'Partager l'audio de l'onglet'");
        }

        // Vérifier que l'audio est bien présent dans le stream
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error("Aucune piste audio détectée. Cochez bien 'Partager l'audio' dans la popup");
        }
        console.log(`✅ ${audioTracks.length} piste(s) audio détectée(s)`);

        // Créer le contexte audio
        audioContext = new AudioContext();
        const sampleRate = audioContext.sampleRate || 44100;
        bufferThreshold = Math.round(sampleRate * sendIntervalSeconds);
        
        const displaySource = audioContext.createMediaStreamSource(mediaStream);
        const micSource = audioContext.createMediaStreamSource(micStream);
        const merger = audioContext.createChannelMerger(2);
        
        displaySource.connect(merger, 0, 0);
        micSource.connect(merger, 0, 1);
        
        processor = audioContext.createScriptProcessor(4096, 2, 1);
        merger.connect(processor);
        processor.connect(audioContext.destination);

        processor.onaudioprocess = (e) => {
          const channel1 = e.inputBuffer.getChannelData(0);
          const channel2 = e.inputBuffer.getChannelData(1);
          
          if (!audioBuffer.client) audioBuffer.client = [];
          if (!audioBuffer.commercial) audioBuffer.commercial = [];
          
          audioBuffer.client.push(...channel1);
          audioBuffer.commercial.push(...channel2);

          if (audioBuffer.client.length >= bufferThreshold) {
            const clientBuffer = new ArrayBuffer(audioBuffer.client.length * 2);
            const commercialBuffer = new ArrayBuffer(audioBuffer.commercial.length * 2);
            
            const clientView = new DataView(clientBuffer);
            const commercialView = new DataView(commercialBuffer);
            
            for (let i = 0; i < audioBuffer.client.length; i++) {
              clientView.setInt16(i * 2, audioBuffer.client[i] * 0x7fff, true);
              commercialView.setInt16(i * 2, audioBuffer.commercial[i] * 0x7fff, true);
            }

            const formData = new FormData();
            formData.append('client_audio', new Blob([clientBuffer], { type: 'application/octet-stream' }));
            formData.append('commercial_audio', new Blob([commercialBuffer], { type: 'application/octet-stream' }));

            fetch(`http://localhost:8000/audio/${currentSessionId}`, {
              method: "POST",
              body: formData
            })
            .then(res => res.json())
            .then(data => { 
              if (data.advice) {
                const validTypes = ["progression", "opportunity", "alert"];
                
                if (!validTypes.includes(data.advice.type)) {
                  console.warn(`[VALIDATION] Type invalide : ${data.advice.type}`);
                  data.advice.type = "progression";
                }
                
                displayAdvice(data.advice);
              } else if (data.reason) {
                console.log(`[SKIP] ${data.reason}`);
              }
              
              if (data.transcription && data.transcription.trim()) {
                conversationTranscript.push(data.transcription);
              }
            })
            .catch(err => { 
              console.error("[ERROR]", err);
            });

            audioBuffer.client = [];
            audioBuffer.commercial = [];
          }
        };

        startStopBtn.classList.remove("btn-start-listening");
        startStopBtn.classList.add("btn-stop-listening");
        startStopBtn.textContent = "Stop Listening";

        isListening = true;
        console.log("✅ Écoute démarrée avec succès");

      } catch (err) {
        console.error("[ERROR] Capture audio :", err);
        alert(`❌ ${err.message}`);
        
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
          mediaStream = null;
        }
        if (micStream) {
          micStream.getTracks().forEach(track => track.stop());
          micStream = null;
        }
        
        // Fermer la session si elle a été créée
        if (currentSessionId) {
          fetch(`http://localhost:8000/calls/${currentSessionId}/end`, {
            method: "POST"
          }).catch(() => {});
          currentSessionId = null;
        }
      }
    } else {
      // Arrêter l'écoute
      console.log("🛑 Arrêt de l'écoute...");
      if (processor) processor.disconnect();
      if (audioContext) audioContext.close();
      if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
      if (micStream) micStream.getTracks().forEach(track => track.stop());

      mediaStream = null;
      micStream = null;
      audioContext = processor = null;

      startStopBtn.classList.remove("btn-stop-listening");
      startStopBtn.classList.add("btn-start-listening");
      startStopBtn.textContent = "Start Listening";

      isListening = false;
      console.log("✅ Écoute arrêtée");
    }
  };
}