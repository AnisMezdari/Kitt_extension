/**
 * HELPERS - FONCTIONS UTILITAIRES
 * ================================
 * Collection de fonctions utilitaires réutilisables
 */

/**
 * Calcule la similarité entre deux textes (Jaccard similarity)
 * @param {string} text1 - Premier texte
 * @param {string} text2 - Deuxième texte
 * @returns {number} Score de similarité entre 0 et 1
 */
export function calculateSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Debounce une fonction
 * @param {Function} func - Fonction à debouncer
 * @param {number} delay - Délai en millisecondes
 * @returns {Function}
 */
export function debounce(func, delay) {
  let timeoutId;
  
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Throttle une fonction
 * @param {Function} func - Fonction à throttler
 * @param {number} limit - Limite en millisecondes
 * @returns {Function}
 */
export function throttle(func, limit) {
  let inThrottle;
  
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Formate une durée en millisecondes en format lisible
 * @param {number} ms - Durée en millisecondes
 * @returns {string}
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Formate une date en format lisible
 * @param {Date|number} date - Date ou timestamp
 * @returns {string}
 */
export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  const options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return d.toLocaleDateString('fr-FR', options);
}

/**
 * Sanitize un texte pour l'affichage HTML
 * @param {string} text - Texte à sanitizer
 * @returns {string}
 */
export function sanitizeHTML(text) {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Remplace les astérisques par "Le client" dans un texte
 * @param {string} text - Texte à traiter
 * @returns {string}
 */
export function replaceAsterisks(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\*/g, 'Le client');
}

/**
 * Tronque un texte à une longueur maximale
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @param {string} suffix - Suffixe à ajouter (défaut: "...")
 * @returns {string}
 */
export function truncate(text, maxLength, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Génère un ID unique
 * @returns {string}
 */
export function generateUniqueId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Attend un certain temps (promesse)
 * @param {number} ms - Temps d'attente en millisecondes
 * @returns {Promise}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry une fonction async avec backoff exponentiel
 * @param {Function} fn - Fonction async à retry
 * @param {number} maxAttempts - Nombre max de tentatives
 * @param {number} delay - Délai initial en ms
 * @param {number} backoffMultiplier - Multiplicateur pour le backoff
 * @returns {Promise}
 */
export async function retryWithBackoff(
  fn,
  maxAttempts = 3,
  delay = 1000,
  backoffMultiplier = 2
) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts) {
        const waitTime = delay * Math.pow(backoffMultiplier, attempt - 1);
        console.log(`Retry ${attempt}/${maxAttempts} after ${waitTime}ms...`);
        await sleep(waitTime);
      }
    }
  }
  
  throw lastError;
}

/**
 * Clone profondément un objet
 * @param {Object} obj - Objet à cloner
 * @returns {Object}
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * Fusionne deux objets profondément
 * @param {Object} target - Objet cible
 * @param {Object} source - Objet source
 * @returns {Object}
 */
export function deepMerge(target, source) {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
  }
  
  return output;
}

/**
 * Vérifie si une valeur est un objet
 * @param {*} item - Valeur à vérifier
 * @returns {boolean}
 */
function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Convertit un buffer audio Float32Array en PCM 16-bit
 * @param {Float32Array} float32Array - Buffer audio
 * @returns {ArrayBuffer}
 */
export function float32ToPCM16(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  
  for (let i = 0; i < float32Array.length; i++) {
    // Clamp la valeur entre -1 et 1
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    // Convertir en 16-bit integer
    view.setInt16(i * 2, sample * 0x7FFF, true);
  }
  
  return buffer;
}

/**
 * Extrait le nom de fichier d'une URL
 * @param {string} url - URL
 * @returns {string}
 */
export function extractFilename(url) {
  if (!url) return '';
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return pathname.split('/').pop() || '';
  } catch (e) {
    return '';
  }
}

/**
 * Vérifie si un objet est vide
 * @param {Object} obj - Objet à vérifier
 * @returns {boolean}
 */
export function isEmpty(obj) {
  if (obj === null || obj === undefined) return true;
  if (typeof obj === 'string') return obj.trim() === '';
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * Capitalise la première lettre d'une chaîne
 * @param {string} str - Chaîne à capitaliser
 * @returns {string}
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convertit un nombre en format lisible (1000 -> 1K)
 * @param {number} num - Nombre à formater
 * @returns {string}
 */
export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Parse un JSON en toute sécurité
 * @param {string} json - String JSON
 * @param {*} defaultValue - Valeur par défaut en cas d'erreur
 * @returns {*}
 */
export function safeJSONParse(json, defaultValue = null) {
  try {
    return JSON.parse(json);
  } catch (e) {
    console.warn('Failed to parse JSON:', e);
    return defaultValue;
  }
}

/**
 * Crée un élément DOM avec des attributs
 * @param {string} tag - Tag HTML
 * @param {Object} attributes - Attributs
 * @param {string} content - Contenu HTML
 * @returns {HTMLElement}
 */
export function createElement(tag, attributes = {}, content = '') {
  const element = document.createElement(tag);
  
  Object.keys(attributes).forEach(key => {
    if (key === 'className') {
      element.className = attributes[key];
    } else if (key === 'dataset') {
      Object.keys(attributes[key]).forEach(dataKey => {
        element.dataset[dataKey] = attributes[key][dataKey];
      });
    } else {
      element.setAttribute(key, attributes[key]);
    }
  });
  
  if (content) {
    element.innerHTML = content;
  }
  
  return element;
}

/**
 * Détecte le système d'exploitation
 * @returns {string} 'windows', 'mac', 'linux', ou 'unknown'
 */
export function detectOS() {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (userAgent.includes('win')) return 'windows';
  if (userAgent.includes('mac')) return 'mac';
  if (userAgent.includes('linux')) return 'linux';
  
  return 'unknown';
}

/**
 * Copie du texte dans le presse-papier
 * @param {string} text - Texte à copier
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}