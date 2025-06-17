// Image drop and validation functionality
class ImageDropHandler {
  constructor() {
    this.targetWidth = 400;
    this.targetHeight = 200;
    this.allowedTypes = ["image/jpeg", "image/jpg", "image/png"];

    this.init();
  }

  init() {
    const dropZone = document.querySelector("[data-drop-zone]");
    const fileInput = document.querySelector("[data-file-input]");
    const removeBtn = document.querySelector("[data-remove-image]");

    if (!dropZone || !fileInput) return;

    // Load existing image on page load
    this.loadStoredImage();

    // Drag and drop events
    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", this.handleDragOver.bind(this));
    dropZone.addEventListener("dragleave", this.handleDragLeave.bind(this));
    dropZone.addEventListener("drop", this.handleDrop.bind(this));

    // File input change
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });

    // Remove image
    removeBtn?.addEventListener("click", this.removeImage.bind(this));
  }

  handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add("drag-over");
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
  }

  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  handleFile(file) {
    // Validate file type
    if (!this.allowedTypes.includes(file.type)) {
      alert("Solo se permiten archivos JPG y PNG");
      return;
    }

    // Validate file size (optional - 5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert("El archivo es demasiado grande (máximo 5MB)");
      return;
    }

    // Create image to validate dimensions
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Validate dimensions
      if (img.width !== this.targetWidth || img.height !== this.targetHeight) {
        alert(
          `La imagen debe ser exactamente ${this.targetWidth}x${this.targetHeight}px. Tu imagen es ${img.width}x${img.height}px`,
        );
        return;
      }

      // Convert to base64 and store
      this.convertAndStore(file);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert("Error al cargar la imagen");
    };

    img.src = objectUrl;
  }

  convertAndStore(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      const base64 = e.target.result;

      // Store in localStorage
      localStorage.setItem("timerImage", base64);

      // Update UI
      this.displayImage(base64);

      // Broadcast to other tabs
      const channel = new BroadcastChannel("timer-sync");
      channel.postMessage({ type: "imageUpdated", image: base64 });
      channel.close();
    };

    reader.onerror = () => {
      alert("Error al procesar la imagen");
    };

    reader.readAsDataURL(file);
  }

  displayImage(base64) {
    const dropZone = document.querySelector("[data-drop-zone]");
    const preview = document.querySelector("[data-image-preview]");
    const previewImg = document.querySelector("[data-preview-img]");

    if (dropZone && preview && previewImg) {
      dropZone.hidden = true;
      preview.hidden = false;
      previewImg.src = base64;
    }
  }

  removeImage() {
    localStorage.removeItem("timerImage");

    const dropZone = document.querySelector("[data-drop-zone]");
    const preview = document.querySelector("[data-image-preview]");
    const previewImg = document.querySelector("[data-preview-img]");
    const fileInput = document.querySelector("[data-file-input]");

    if (dropZone && preview && previewImg && fileInput) {
      dropZone.hidden = false;
      preview.hidden = true;
      previewImg.src = "";
      fileInput.value = "";
    }

    // Broadcast removal to other tabs
    const channel = new BroadcastChannel("timer-sync");
    channel.postMessage({ type: "imageRemoved" });
    channel.close();
  }

  loadStoredImage() {
    const storedImage = localStorage.getItem("timerImage");
    if (storedImage) {
      this.displayImage(storedImage);
    }
  }
}

// Global handler reference for cross-tab communication
let globalImageHandler = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  globalImageHandler = new ImageDropHandler();
});

// Listen for image updates from other tabs
const imageChannel = new BroadcastChannel("timer-sync");

imageChannel.addEventListener("message", (event) => {
  if (event.data.type === "imageUpdated" && globalImageHandler) {
    globalImageHandler.displayImage(event.data.image);
  } else if (event.data.type === "imageRemoved" && globalImageHandler) {
    globalImageHandler.removeImage();
  }
});
