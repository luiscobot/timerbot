// Manages a countdown timer with multi-tab synchronization
class Timer {
  constructor() {
    this.defaultTime = 10 * 60; // 10 minutes
    this.timeRemaining = this.defaultTime;
    this.interval = null;
    this.isRunning = false;
    this.isPaused = false;
    this.audioEnabled = false;

    // Enables real-time synchronization across browser tabs
    this.channel = new BroadcastChannel("timer-sync");
    this.channel.addEventListener("message", (event) => {
      this.handleBroadcast(event.data);
    });

    this.loadState();
    this.updateUI();
    this.initializeAudio();
  }

  // Restores timer state from previous session
  loadState() {
    const savedState = localStorage.getItem("timerState");
    if (savedState) {
      const state = JSON.parse(savedState);

      this.timeRemaining = state.timeRemaining ?? this.defaultTime;
      this.isRunning = state.isRunning ?? false;
      this.isPaused = state.isPaused ?? false;

      if (this.isRunning && !this.isPaused) {
        this.start(false); // Don't broadcast on initial load
      }
    }
  }

  // Saves state and optionally broadcasts to other tabs
  updateState(shouldBroadcast = true) {
    const state = {
      timeRemaining: this.timeRemaining,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
    };

    localStorage.setItem("timerState", JSON.stringify(state));

    if (shouldBroadcast) {
      this.channel.postMessage(state);
    }
  }

  // Updates both display and button states
  updateUI() {
    this.updateDisplay();
    this.updateButtonState();
  }

  // Synchronizes timer state when other tabs make changes
  handleBroadcast(data) {
    // Ignore non-timer messages (image updates, etc.)
    if (
      data.type &&
      (data.type === "imageUpdated" || data.type === "imageRemoved")
    ) {
      return;
    }

    // Only process timer state updates
    if (typeof data.timeRemaining === "number") {
      this.timeRemaining = data.timeRemaining;
      this.isRunning = data.isRunning ?? false;
      this.isPaused = data.isPaused ?? false;

      // Sync the interval state
      this.clearInterval();
      if (this.isRunning && !this.isPaused) {
        this.startInterval();
      }

      this.updateUI();
    }
  }

  // Begins countdown
  start(shouldBroadcast = true) {
    this.isRunning = true;
    this.isPaused = false;

    this.enableAudioOnUserAction();
    this.startInterval();
    this.updateUI();
    this.updateState(shouldBroadcast);
  }

  // Creates the countdown interval
  startInterval() {
    this.clearInterval();

    this.interval = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.updateDisplay();
        this.updateState(false); // Save but don't broadcast every tick
      } else {
        this.handleTimerComplete();
      }
    }, 1000);
  }

  // Safely clears the interval
  clearInterval() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Temporarily suspends countdown
  pause() {
    this.isPaused = true;
    this.clearInterval();
    this.updateUI();
    this.updateState();
  }

  // Restores timer to initial state
  reset() {
    this.clearInterval();
    this.timeRemaining = this.defaultTime;
    this.isRunning = false;
    this.isPaused = false;
    this.updateUI();
    this.updateState();
  }

  // Switches between timer states
  toggle() {
    if (!this.isRunning || this.isPaused) {
      this.start();
    } else {
      this.pause();
    }
  }

  // Renders current time on screen
  updateDisplay() {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;

    const minuteElement = document.querySelector("[data-minutes]");
    const secondElement = document.querySelector("[data-seconds]");

    if (minuteElement) {
      minuteElement.textContent = minutes.toString().padStart(2, "0");
    }

    if (secondElement) {
      secondElement.textContent = seconds.toString().padStart(2, "0");
    }
  }

  // Updates button text and styling
  updateButtonState() {
    const toggleButton = document.querySelector("[data-toggle]");
    if (!toggleButton) return;

    let text;
    let className;

    if (!this.isRunning) {
      text = "Start";
      className = "start";
    } else if (this.isPaused) {
      text = "Resume";
      className = "start";
    } else {
      text = "Pause";
      className = "pause";
    }

    toggleButton.textContent = text;
    toggleButton.classList.remove("start", "pause");
    toggleButton.classList.add(className);
  }

  // Executes when countdown reaches zero
  handleTimerComplete() {
    this.clearInterval();
    this.isRunning = false;
    this.isPaused = false;
    this.timeRemaining = this.defaultTime;

    this.updateUI();
    this.updateState();
    this.playCompletionSound();

    console.log("Timer completed!");
  }

  // Initializes audio and enables it on first user interaction
  initializeAudio() {
    const audio = document.getElementById("timer-sound");
    if (!audio) return;

    // Enable audio on first user interaction
    const enableAudio = () => {
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          this.audioEnabled = true;
          console.log("Audio enabled");
        })
        .catch(() => {
          console.log("Audio could not be enabled");
        });

      // Remove listeners after first interaction
      document.removeEventListener("click", enableAudio);
      document.removeEventListener("keydown", enableAudio);
    };

    document.addEventListener("click", enableAudio);
    document.addEventListener("keydown", enableAudio);
  }

  // Enables audio when user takes action (for cross-tab audio)
  enableAudioOnUserAction() {
    const audio = document.getElementById("timer-sound");
    if (audio && !this.audioEnabled) {
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          this.audioEnabled = true;
          console.log("Audio enabled via user action");
        })
        .catch(() => {
          console.log("Audio could not be enabled via user action");
        });
    }
  }

  // Plays sound when timer completes
  playCompletionSound() {
    const audio = document.getElementById("timer-sound");
    if (audio) {
      audio.currentTime = 0;
      audio
        .play()
        .then(() => {
          this.audioEnabled = true;
          console.log("Audio played successfully");
        })
        .catch((error) => {
          console.log("Could not play timer completion sound:", error);
        });
    }
  }

  // Cleanup method
  destroy() {
    this.clearInterval();
    this.channel?.close();
  }
}

// Initialize timer when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const timer = new Timer();

  // Attach event listeners
  document.querySelector("[data-toggle]")?.addEventListener("click", () => {
    timer.toggle();
  });

  document.querySelector("[data-reset]")?.addEventListener("click", () => {
    timer.reset();
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    timer.destroy();
  });
});
