/**
 * COLLAPSIBLE SECTION
 * ===================
 * Composant UI pour gérer les sections pliables/dépliables
 */

import { Logger } from '../../utils/logger.js';

export class CollapsibleSection {
  constructor(headerElement) {
    this.header = headerElement;
    this.targetId = headerElement.getAttribute('data-target');
    this.content = document.getElementById(this.targetId);
    this.chevron = headerElement.querySelector('.chevron-icon');
    
    if (!this.content) {
      Logger.warn(`Section pliable non trouvée: ${this.targetId}`);
      return;
    }

    this._initialize();
  }

  /**
   * Initialise les event listeners
   * @private
   */
  _initialize() {
    this.header.addEventListener('click', (e) => {
      // Ne pas plier/déplier si on clique sur un bouton
      if (this._isInteractiveElement(e.target)) {
        return;
      }
      
      this.toggle();
    });
  }

  /**
   * Vérifie si l'élément cliqué est interactif
   * @private
   */
  _isInteractiveElement(element) {
    const interactiveSelectors = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '.btn-generate-small',
      '.btn-start-listening',
      '.btn-stop-listening',
      '.btn-reset'
    ];

    return interactiveSelectors.some(selector => 
      element.matches(selector) || element.closest(selector)
    );
  }

  /**
   * Bascule l'état de la section
   */
  toggle() {
    if (this.isExpanded()) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  /**
   * Déplie la section
   */
  expand() {
    this.content.classList.remove('collapsed');
    this.header.classList.add('expanded');
    
    if (this.chevron) {
      this.chevron.style.transform = 'rotate(90deg)';
    }

    Logger.debug(`Section dépliée: ${this.targetId}`);
  }

  /**
   * Plie la section
   */
  collapse() {
    this.content.classList.add('collapsed');
    this.header.classList.remove('expanded');
    
    if (this.chevron) {
      this.chevron.style.transform = 'rotate(0deg)';
    }

    Logger.debug(`Section pliée: ${this.targetId}`);
  }

  /**
   * Vérifie si la section est dépliée
   * @returns {boolean}
   */
  isExpanded() {
    return !this.content.classList.contains('collapsed');
  }

  /**
   * Initialise toutes les sections pliables de la page
   * @static
   */
  static initializeAll() {
    const headers = document.querySelectorAll('.collapsible-header');
    const sections = [];

    headers.forEach(header => {
      const section = new CollapsibleSection(header);
      sections.push(section);
    });

    Logger.debug(`${sections.length} section(s) pliable(s) initialisée(s)`);

    return sections;
  }
}