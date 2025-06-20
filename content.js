class ChatGPTOrganizerContent {
  constructor() {
    this.chats = []
    this.folders = []
    this.observer = null
    this.isInitialized = false

    this.init()
  }

  async init() {
    // Wait for page to load
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.setup())
    } else {
      this.setup()
    }
  }

  async setup() {
    await this.loadStorageData()
    this.detectChats()
    this.setupMutationObserver()
    this.addOrganizeButtons()
    this.isInitialized = true
  }

  async loadStorageData() {
    try {
      const result = await chrome.storage.local.get(["folders", "chats"])
      this.folders = result.folders || []
      this.chats = result.chats || []
    } catch (error) {
      console.error("Error loading storage data:", error)
    }
  }

  detectChats() {
    const chatElements = this.getChatElements()
    const detectedChats = []

    chatElements.forEach((element, index) => {
      const chatId = this.extractChatId(element)
      const title = this.extractChatTitle(element)

      if (chatId && title) {
        detectedChats.push({
          id: chatId,
          title: title,
          url: this.extractChatUrl(element),
          element: element,
          folderId: null, // Will be preserved from existing data
        })
      }
    })

    // Update chats and notify popup
    if (detectedChats.length > 0) {
      chrome.runtime.sendMessage({
        type: "CHATS_UPDATED",
        chats: detectedChats,
      })
    }
  }

  getChatElements() {
    // Multiple selectors to handle different ChatGPT layouts
    const selectors = [
      'nav[aria-label="Chat history"] a',
      '[data-testid="conversation-turn"] a',
      ".flex.flex-col.gap-2.pb-2.text-gray-100.text-sm a",
      'nav a[href*="/c/"]',
      ".relative.grow.overflow-hidden.whitespace-nowrap a",
    ]

    let elements = []
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector)
      if (found.length > 0) {
        elements = Array.from(found)
        break
      }
    }

    return elements.filter((el) => {
      const href = el.getAttribute("href")
      return href && (href.includes("/c/") || href.includes("/chat/"))
    })
  }

  extractChatId(element) {
    const href = element.getAttribute("href")
    if (!href) return null

    // Extract ID from URL patterns like /c/chat-id or /chat/chat-id
    const match = href.match(/\/c\/([^/?]+)|\/chat\/([^/?]+)/)
    return match ? match[1] || match[2] : null
  }

  extractChatTitle(element) {
    // Try multiple methods to get the chat title
    const titleElement =
      element.querySelector("[title]") ||
      element.querySelector(".truncate") ||
      element.querySelector("div:last-child") ||
      element

    let title = titleElement.getAttribute("title") || titleElement.textContent?.trim() || "Untitled Chat"

    // Clean up the title
    title = title.replace(/^\d+\.\s*/, "") // Remove numbering
    title = title.length > 50 ? title.substring(0, 50) + "..." : title

    return title
  }

  extractChatUrl(element) {
    const href = element.getAttribute("href")
    return href ? (href.startsWith("http") ? href : `https://chat.openai.com${href}`) : null
  }

  setupMutationObserver() {
    if (this.observer) {
      this.observer.disconnect()
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false

      mutations.forEach((mutation) => {
        // Check if chat list has changed
        if (mutation.type === "childList") {
          const target = mutation.target
          if (
            target.matches("nav") ||
            target.closest("nav") ||
            target.querySelector('a[href*="/c/"]') ||
            target.querySelector('a[href*="/chat/"]')
          ) {
            shouldUpdate = true
          }
        }
      })

      if (shouldUpdate) {
        // Debounce updates
        clearTimeout(this.updateTimeout)
        this.updateTimeout = setTimeout(() => {
          this.detectChats()
          this.addOrganizeButtons()
        }, 500)
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  addOrganizeButtons() {
    const chatElements = this.getChatElements()

    chatElements.forEach((element) => {
      if (element.querySelector(".chatgpt-organizer-btn")) {
        return // Button already exists
      }

      const chatId = this.extractChatId(element)
      if (!chatId) return

      // Create organize button
      const button = document.createElement("button")
      button.className = "chatgpt-organizer-btn"
      button.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z"/>
                </svg>
            `
      button.title = "Add to folder"

      button.addEventListener("click", (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.showFolderSelector(chatId, button)
      })

      // Position the button
      const container = element.closest("div") || element.parentElement
      if (container) {
        container.style.position = "relative"
        container.appendChild(button)
      }
    })
  }

  showFolderSelector(chatId, buttonElement) {
    // Remove existing selector
    const existing = document.querySelector(".folder-selector-popup")
    if (existing) {
      existing.remove()
    }

    // Create folder selector popup
    const popup = document.createElement("div")
    popup.className = "folder-selector-popup"

    const chat = this.chats.find((c) => c.id === chatId)
    const currentFolderId = chat?.folderId

    popup.innerHTML = `
            <div class="folder-selector-content">
                <div class="folder-selector-header">
                    <span>Add to folder</span>
                    <button class="folder-selector-close">×</button>
                </div>
                <div class="folder-selector-list">
                    ${
                      this.folders.length === 0
                        ? '<div class="no-folders">No folders available. Create one in the extension popup.</div>'
                        : this.folders
                            .map(
                              (folder) => `
                            <div class="folder-option ${currentFolderId === folder.id ? "selected" : ""}" data-folder-id="${folder.id}">
                                <div class="folder-color" style="background-color: ${folder.color}"></div>
                                <span class="folder-name">${this.escapeHtml(folder.name)}</span>
                                ${currentFolderId === folder.id ? '<span class="current-badge">Current</span>' : ""}
                            </div>
                        `,
                            )
                            .join("")
                    }
                    ${
                      currentFolderId
                        ? `
                        <div class="folder-option remove-option" data-folder-id="">
                            <div class="folder-color" style="background-color: #ef4444"></div>
                            <span class="folder-name">Remove from folder</span>
                        </div>
                    `
                        : ""
                    }
                </div>
            </div>
        `

    // Position popup near button
    const rect = buttonElement.getBoundingClientRect()
    popup.style.position = "fixed"
    popup.style.top = `${rect.bottom + 5}px`
    popup.style.left = `${rect.left}px`
    popup.style.zIndex = "10000"

    document.body.appendChild(popup)

    // Add event listeners
    popup.querySelector(".folder-selector-close").addEventListener("click", () => {
      popup.remove()
    })

    popup.querySelectorAll(".folder-option").forEach((option) => {
      option.addEventListener("click", () => {
        const folderId = option.dataset.folderId || null
        this.assignChatToFolder(chatId, folderId)
        popup.remove()
      })
    })

    // Close on outside click
    setTimeout(() => {
      document.addEventListener(
        "click",
        (e) => {
          if (!popup.contains(e.target) && !buttonElement.contains(e.target)) {
            popup.remove()
          }
        },
        { once: true },
      )
    }, 100)
  }

  async assignChatToFolder(chatId, folderId) {
    try {
      // Update local data
      let chat = this.chats.find((c) => c.id === chatId)
      if (!chat) {
        // Create chat entry if it doesn't exist
        const chatElement = this.getChatElements().find((el) => this.extractChatId(el) === chatId)
        if (chatElement) {
          chat = {
            id: chatId,
            title: this.extractChatTitle(chatElement),
            url: this.extractChatUrl(chatElement),
            folderId: null,
          }
          this.chats.push(chat)
        }
      }

      if (chat) {
        // Remove from previous folder
        if (chat.folderId) {
          const prevFolder = this.folders.find((f) => f.id === chat.folderId)
          if (prevFolder) {
            prevFolder.chatIds = prevFolder.chatIds.filter((id) => id !== chatId)
          }
        }

        // Add to new folder
        chat.folderId = folderId
        if (folderId) {
          const folder = this.folders.find((f) => f.id === folderId)
          if (folder && !folder.chatIds.includes(chatId)) {
            folder.chatIds.push(chatId)
          }
        }

        // Save to storage
        await chrome.storage.local.set({
          folders: this.folders,
          chats: this.chats,
        })

        // Show success feedback
        this.showNotification(folderId ? "Added to folder" : "Removed from folder")
      }
    } catch (error) {
      console.error("Error assigning chat to folder:", error)
      this.showNotification("Error updating folder", "error")
    }
  }

  showNotification(message, type = "success") {
    const notification = document.createElement("div")
    notification.className = `chatgpt-organizer-notification ${type}`
    notification.textContent = message

    document.body.appendChild(notification)

    setTimeout(() => {
      notification.classList.add("show")
    }, 100)

    setTimeout(() => {
      notification.classList.remove("show")
      setTimeout(() => notification.remove(), 300)
    }, 2000)
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}

// Initialize when script loads
new ChatGPTOrganizerContent()
