// Main content script - DOM injection and mutation observation
class ChatGPTFolderExtension {
  constructor() {
    this.observer = null
    this.isInitialized = false
    this.retryCount = 0
    this.maxRetries = 10
  }

  async init() {
    if (this.isInitialized) return

    console.log("ChatGPT Folder+ Extension initializing...")

    // Initialize storage
    await window.folderStorage.init()

    // Wait for ChatGPT to load
    await this.waitForChatGPTLoad()

    // Inject UI elements
    this.injectUI()

    // Setup mutation observer
    this.setupMutationObserver()

    this.isInitialized = true
    console.log("ChatGPT Folder+ Extension initialized successfully")
  }

  async waitForChatGPTLoad() {
    return new Promise((resolve) => {
      const checkLoad = () => {
        const sidebar =
          document.querySelector('nav[aria-label="Chat history"]') ||
          document.querySelector('[data-testid="conversation-turn"]') ||
          document.querySelector("main")

        if (sidebar || this.retryCount >= this.maxRetries) {
          resolve()
        } else {
          this.retryCount++
          setTimeout(checkLoad, 1000)
        }
      }
      checkLoad()
    })
  }

  injectUI() {
    this.injectAddButton()
    this.injectPanelToggle()
    this.injectChatMenuOptions()
  }

  injectAddButton() {
    // Remove existing button
    const existingBtn = document.getElementById("chatgpt-folder-add-btn")
    if (existingBtn) existingBtn.remove()

    // Find the main content area
    const mainContent =
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector(".flex.flex-col.items-center")

    if (!mainContent) {
      console.log("Main content area not found, retrying...")
      setTimeout(() => this.injectAddButton(), 2000)
      return
    }

    // Create and inject the Add+ button
    const addButton = window.folderUI.createAddButton()

    // Create container for the button
    const buttonContainer = document.createElement("div")
    buttonContainer.className = "chatgpt-folder-add-container"
    buttonContainer.appendChild(addButton)

    // Insert at the top of main content
    mainContent.insertBefore(buttonContainer, mainContent.firstChild)
  }

  injectPanelToggle() {
    // Remove existing toggle
    const existingToggle = document.getElementById("chatgpt-folder-panel-toggle")
    if (existingToggle) existingToggle.remove()

    // Create and inject the panel toggle
    const panelToggle = window.folderUI.createPanelToggle()
    document.body.appendChild(panelToggle)
  }

  injectChatMenuOptions() {
    // Inject options into chat menus
    window.folderUI.injectChatMenuOptions()
  }

  setupMutationObserver() {
    if (this.observer) {
      this.observer.disconnect()
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldReinject = false

      mutations.forEach((mutation) => {
        // Check if new chat items were added
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a chat item or contains chat items
              if (
                node.querySelector &&
                (node.querySelector('[data-testid="conversation-turn"]') ||
                  node.matches('[data-testid="conversation-turn"]'))
              ) {
                shouldReinject = true
              }

              // Check if main content was modified
              if (node.querySelector && node.querySelector("main")) {
                shouldReinject = true
              }
            }
          })
        }
      })

      if (shouldReinject) {
        // Debounce re-injection
        clearTimeout(this.reinjectTimeout)
        this.reinjectTimeout = setTimeout(() => {
          this.injectChatMenuOptions()

          // Re-inject Add+ button if missing
          if (!document.getElementById("chatgpt-folder-add-btn")) {
            this.injectAddButton()
          }

          // Re-inject panel toggle if missing
          if (!document.getElementById("chatgpt-folder-panel-toggle")) {
            this.injectPanelToggle()
          }
        }, 500)
      }
    })

    // Observe the entire document for changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    })
  }

  // Handle page navigation
  handleNavigation() {
    // Re-initialize when navigating within ChatGPT
    if (window.location.href.includes("chat.openai.com") || window.location.href.includes("chatgpt.com")) {
      setTimeout(() => {
        this.injectUI()
      }, 1000)
    }
  }
}

// Initialize the extension
const extension = new ChatGPTFolderExtension()

// Start initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => extension.init())
} else {
  extension.init()
}

// Handle navigation changes
let lastUrl = location.href
new MutationObserver(() => {
  const url = location.href
  if (url !== lastUrl) {
    lastUrl = url
    extension.handleNavigation()
  }
}).observe(document, { subtree: true, childList: true })

// Handle page visibility changes
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    setTimeout(() => extension.injectUI(), 1000)
  }
})
