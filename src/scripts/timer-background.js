// Background image handler for timer page
class TimerBackgroundHandler {
  constructor() {
    this.backgroundElement = document.querySelector('[data-background-image]');
    this.channel = new BroadcastChannel('timer-sync');
    
    this.init();
  }

  init() {
    if (!this.backgroundElement) return;

    // Load stored image on page load
    this.loadStoredImage();

    // Listen for image updates from other tabs
    this.channel.addEventListener('message', (event) => {
      if (event.data.type === 'imageUpdated') {
        this.setBackgroundImage(event.data.image);
      } else if (event.data.type === 'imageRemoved') {
        this.removeBackgroundImage();
      }
    });
  }

  loadStoredImage() {
    const storedImage = localStorage.getItem('timerImage');
    if (storedImage) {
      this.setBackgroundImage(storedImage);
    }
  }

  setBackgroundImage(base64Image) {
    if (this.backgroundElement) {
      this.backgroundElement.style.backgroundImage = `url(${base64Image})`;
      this.backgroundElement.style.display = 'block';
    }
  }

  removeBackgroundImage() {
    if (this.backgroundElement) {
      this.backgroundElement.style.backgroundImage = '';
      this.backgroundElement.style.display = 'none';
    }
  }

  destroy() {
    this.channel?.close();
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const backgroundHandler = new TimerBackgroundHandler();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    backgroundHandler.destroy();
  });
});