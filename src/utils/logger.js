/**
 * LOGGER - SYSTÈME DE LOGGING STRUCTURÉ
 * ======================================
 * Fournit un système de logging avec niveaux et formatage
 */

import { LOG_CONFIG, FEATURE_FLAGS } from './constants.js';

/**
 * Niveaux de log
 */
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

export class Logger {
  /**
   * Niveau de log actuel
   */
  static currentLevel = LOG_LEVELS[LOG_CONFIG.LOG_LEVEL] || LOG_LEVELS.INFO;

  /**
   * Log un message de debug
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static debug(message, data = null) {
    if (this.currentLevel <= LOG_LEVELS.DEBUG) {
      this._log('DEBUG', message, data);
    }
  }

  /**
   * Log un message d'information
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static info(message, data = null) {
    if (this.currentLevel <= LOG_LEVELS.INFO) {
      this._log('INFO', message, data);
    }
  }

  /**
   * Log un avertissement
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static warn(message, data = null) {
    if (this.currentLevel <= LOG_LEVELS.WARN) {
      this._log('WARN', message, data);
    }
  }

  /**
   * Log une erreur
   * @param {string} message - Message à logger
   * @param {Error|*} data - Erreur ou données supplémentaires
   */
  static error(message, data = null) {
    if (this.currentLevel <= LOG_LEVELS.ERROR) {
      this._log('ERROR', message, data);
    }
  }

  /**
   * Log un événement de session
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static session(message, data = null) {
    this._log('SESSION', message, data);
  }

  /**
   * Log un événement d'insight
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static insight(message, data = null) {
    this._log('INSIGHT', message, data);
  }

  /**
   * Log un événement audio
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static audio(message, data = null) {
    this._log('AUDIO', message, data);
  }

  /**
   * Log un événement API
   * @param {string} message - Message à logger
   * @param {*} data - Données supplémentaires
   */
  static api(message, data = null) {
    this._log('API', message, data);
  }

  /**
   * Méthode interne de logging
   * @private
   */
  static _log(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = LOG_CONFIG.LOG_PREFIXES[level] || '';
    
    const formattedMessage = `[${timestamp}] ${prefix} [${level}] ${message}`;

    // Sélectionner la méthode console appropriée
    const consoleMethod = this._getConsoleMethod(level);

    if (data !== null && data !== undefined) {
      // Si c'est une erreur, afficher le stack
      if (data instanceof Error) {
        consoleMethod(formattedMessage);
        console.error(data);
        
        if (FEATURE_FLAGS.DEBUG_MODE) {
          console.trace();
        }
      } else if (LOG_CONFIG.VERBOSE || FEATURE_FLAGS.DEBUG_MODE) {
        // En mode verbose, afficher les données en JSON formaté
        consoleMethod(formattedMessage, '\n', JSON.stringify(data, null, 2));
      } else {
        consoleMethod(formattedMessage, data);
      }
    } else {
      consoleMethod(formattedMessage);
    }

    // Envoyer à un service d'analytics si activé
    if (FEATURE_FLAGS.ENABLE_ANALYTICS && level === 'ERROR') {
      this._sendToAnalytics(level, message, data);
    }
  }

  /**
   * Obtient la méthode console appropriée
   * @private
   */
  static _getConsoleMethod(level) {
    switch (level) {
      case 'DEBUG':
      case 'INFO':
      case 'SESSION':
      case 'INSIGHT':
      case 'AUDIO':
      case 'API':
        return console.log;
      case 'WARN':
        return console.warn;
      case 'ERROR':
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Envoie les logs à un service d'analytics
   * @private
   */
  static _sendToAnalytics(level, message, data) {
    // TODO: Implémenter l'envoi à un service d'analytics
    // Par exemple : Sentry, LogRocket, etc.
    console.log('[Analytics] Would send:', { level, message, data });
  }

  /**
   * Groupe des logs ensemble
   * @param {string} label - Label du groupe
   * @param {Function} fn - Fonction contenant les logs à grouper
   */
  static group(label, fn) {
    console.group(`📦 ${label}`);
    fn();
    console.groupEnd();
  }

  /**
   * Groupe des logs ensemble (collapsed)
   * @param {string} label - Label du groupe
   * @param {Function} fn - Fonction contenant les logs à grouper
   */
  static groupCollapsed(label, fn) {
    console.groupCollapsed(`📦 ${label}`);
    fn();
    console.groupEnd();
  }

  /**
   * Affiche une table
   * @param {Array|Object} data - Données à afficher
   */
  static table(data) {
    console.table(data);
  }

  /**
   * Démarre un timer
   * @param {string} label - Label du timer
   */
  static time(label) {
    console.time(`⏱️ ${label}`);
  }

  /**
   * Arrête un timer et affiche le temps écoulé
   * @param {string} label - Label du timer
   */
  static timeEnd(label) {
    console.timeEnd(`⏱️ ${label}`);
  }

  /**
   * Trace l'exécution
   */
  static trace() {
    console.trace();
  }

  /**
   * Assert une condition
   * @param {boolean} condition - Condition à vérifier
   * @param {string} message - Message si la condition est fausse
   */
  static assert(condition, message) {
    console.assert(condition, message);
  }

  /**
   * Efface la console
   */
  static clear() {
    console.clear();
  }

  /**
   * Change le niveau de log
   * @param {string} level - Nouveau niveau (DEBUG, INFO, WARN, ERROR)
   */
  static setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.currentLevel = LOG_LEVELS[level];
      this.info(`Log level changed to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  }

  /**
   * Active le mode verbose
   */
  static enableVerbose() {
    LOG_CONFIG.VERBOSE = true;
    this.info('Verbose mode enabled');
  }

  /**
   * Désactive le mode verbose
   */
  static disableVerbose() {
    LOG_CONFIG.VERBOSE = false;
    this.info('Verbose mode disabled');
  }
}

/**
 * Décorateur pour logger automatiquement l'entrée/sortie d'une fonction
 * @param {string} functionName - Nom de la fonction
 * @returns {Function}
 */
export function logFunction(functionName) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      Logger.debug(`→ Entering ${functionName}`, { args });
      
      try {
        const result = await originalMethod.apply(this, args);
        Logger.debug(`← Exiting ${functionName}`, { result });
        return result;
      } catch (error) {
        Logger.error(`✗ Error in ${functionName}`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Décorateur pour mesurer le temps d'exécution d'une fonction
 * @param {string} functionName - Nom de la fonction
 * @returns {Function}
 */
export function timeFunction(functionName) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      const startTime = performance.now();
      
      try {
        const result = await originalMethod.apply(this, args);
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        
        Logger.debug(`⏱️ ${functionName} took ${duration}ms`);
        
        return result;
      } catch (error) {
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);
        
        Logger.error(`⏱️ ${functionName} failed after ${duration}ms`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

// Export par défaut
export default Logger;