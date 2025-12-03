// Configuration de la fenêtre popup
const WINDOW_CONFIG = {
  // Taille de la fenêtre
  width: 450,          // Largeur en pixels (min: 350, max: 800)
  height: 700,         // Hauteur en pixels (min: 400, max: 1200)
  
  // Position de la fenêtre
  position: 'top-right', // Options: 'top-right', 'top-left', 'bottom-right', 'bottom-left', 'center'
  
  // Marges par rapport aux bords de l'écran
  margin: 20,          // Marge en pixels
  
  // Options avancées
  alwaysOnTop: false,  // Garder la fenêtre toujours au premier plan (nécessite Chrome 90+)
  resizable: true      // Permettre le redimensionnement manuel
};

// Fonction pour calculer la position
function getWindowPosition(screenWidth, screenHeight, windowWidth, windowHeight, margin) {
  const positions = {
    'top-right': {
      left: screenWidth - windowWidth - margin,
      top: margin
    },
    'top-left': {
      left: margin,
      top: margin
    },
    'bottom-right': {
      left: screenWidth - windowWidth - margin,
      top: screenHeight - windowHeight - margin
    },
    'bottom-left': {
      left: margin,
      top: screenHeight - windowHeight - margin
    },
    'center': {
      left: (screenWidth - windowWidth) / 2,
      top: (screenHeight - windowHeight) / 2
    }
  };
  
  return positions[WINDOW_CONFIG.position] || positions['top-right'];
}

// Export pour utilisation dans popup.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WINDOW_CONFIG, getWindowPosition };
}