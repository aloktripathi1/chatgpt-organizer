class ChatGPTOrganizerContent {
  constructor() {
    this.chats = []
    this.folders = []
    this.observer = null
    this.isInitialized = false
    this.currentChatId = null

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
    this.setupMutationObserver()
    this.detectAndProcessChats()
    this.addOpenChatButton()
    this.isInitialized = true

    // Re-run detection periodically for dynamic content
    setInterval(() => {
      this.detectAndProcessChats()
      this.addOpenChatButton()
    }, 2000)
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

  detectAndProcessChats() {
    const chatElements = this.getChatElements()
    const detectedChats = []

    chatElements.forEach((element) => {
      const chatId = this.extractChatId(element)
      const title = this.extractChatTitle(element)

      if (chatId && title) {
        detectedChats.push({
          id: chatId,
          title: title,
          url: this.extractChatUrl(element),
          element: element,
          folderId: null,
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

    // Add organize buttons to each chat
    this.addOrganizeButtons()
  }

  getChatElements() {
    // Enhanced selectors for different ChatGPT layouts
    const selectors = [
      'nav[aria-label="Chat history"] a',
      'nav a[href*="/c/"]',
      'nav a[href*="/chat/"]',
      '.flex.flex-col.gap-2 a[href*="/c/"]',
      '.overflow-y-auto a[href*="/c/"]',
      '[data-testid="history-item"]',
      ".relative.grow.overflow-hidden a",
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

    const match = href.match(/\/c\/([^/?]+)|\/chat\/([^/?]+)/)
    return match ? match[1] || match[2] : null
  }

  extractChatTitle(element) {
    // Multiple strategies to get chat title
    let title = ""

    // Try title attribute first
    if (element.getAttribute("title")) {
      title = element.getAttribute("title")
    }
    // Try text content of various child elements
    else if (element.querySelector(".truncate")) {
      title = element.querySelector(".truncate").textContent?.trim()
    } else if (element.querySelector("div:last-child")) {
      title = element.querySelector("div:last-child").textContent?.trim()
    } else {
      title = element.textContent?.trim()
    }

    // Clean up the title
    title = title || "Untitled Chat"
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
        if (mutation.type === "childList") {
          const target = mutation.target
          // Check if navigation or chat list changed
          if (
            target.matches("nav") ||
            target.closest("nav") ||
            target.querySelector('a[href*="/c/"]') ||
            target.querySelector('a[href*="/chat/"]') ||
            mutation.addedNodes.length > 0
          ) {
            shouldUpdate = true
          }
        }
      })

      if (shouldUpdate) {
        clearTimeout(this.updateTimeout)
        this.updateTimeout = setTimeout(() => {
          this.detectAndProcessChats()
          this.addOpenChatButton()
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
      // Skip if button already exists
      if (element.querySelector(".chatgpt-organizer-btn") || element.closest(".chatgpt-organizer-processed")) {
        return
      }

      const chatId = this.extractChatId(element)
      if (!chatId) return

      // Mark as processed
      element.classList.add("chatgpt-organizer-processed")

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

      // Find the best container to position the button
      const container = element.closest("div") || element.parentElement
      if (container) {
        container.style.position = "relative"
        container.appendChild(button)
      }
    })
  }

  addOpenChatButton() {
    // Remove existing button
    const existingBtn = document.querySelector(".chatgpt-organizer-open-chat-btn")
    if (existingBtn) {
      existingBtn.remove()
    }

    // Check if we're on a chat page
    const currentUrl = window.location.href
    const chatMatch = currentUrl.match(/\/c\/([^/?]+)|\/chat\/([^/?]+)/)

    if (!chatMatch) return

    this.currentChatId = chatMatch[1] || chatMatch[2]

    // Find suitable container for the button
    const containers = ["header", ".sticky.top-0", ".flex.items-center.justify-between", ".border-b", "nav + div"]

    let targetContainer = null
    for (const selector of containers) {
      const element = document.querySelector(selector)
      if (element && element.offsetHeight > 0) {
        targetContainer = element
        break
      }
    }

    if (!targetContainer) {
      // Fallback: create floating button
      targetContainer = document.body
    }

    // Create the button
    const button = document.createElement("button")
    button.className = "chatgpt-organizer-open-chat-btn"
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z"/>
      </svg>
      <span>Add to Folder</span>
    `
    button.title = "Add this chat to a folder"

    button.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.showFolderSelector(this.currentChatId, button)
    })

    targetContainer.appendChild(button)
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
              ? '<div class="no-folders">No folders available.<br><small>Create one in the extension popup.</small></div>'
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
    popup.style.top = `${Math.min(rect.bottom + 5, window.innerHeight - 300)}px`
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 250)}px`
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
      const closeHandler = (e) => {
        if (!popup.contains(e.target) && !buttonElement.contains(e.target)) {
          popup.remove()
          document.removeEventListener("click", closeHandler)
        }
      }
      document.addEventListener("click", closeHandler)
    }, 100)
  }

  async assignChatToFolder(chatId, folderId) {
    try {
      // Get current chat title if not in our list
      let chat = this.chats.find((c) => c.id === chatId)
      if (!chat) {
        // Try to get title from current page or chat elements
        let title = "Untitled Chat"

        if (this.currentChatId === chatId) {
          // We're on the chat page, try to get title from page
          const titleElement =
            document.querySelector("h1") ||
            document.querySelector(".text-lg.font-semibold") ||
            document.querySelector('[data-testid="chat-title"]')
          if (titleElement) {
            title = titleElement.textContent?.trim() || title
          }
        } else {
          // Try to find in chat list
          const chatElement = this.getChatElements().find((el) => this.extractChatId(el) === chatId)
          if (chatElement) {
            title = this.extractChatTitle(chatElement)
          }
        }

        chat = {
          id: chatId,
          title: title,
          url: `https://chat.openai.com/c/${chatId}`,
          folderId: null,
        }
        this.chats.push(chat)
      }

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

      // Show success notification
      this.showNotification(
        folderId ? `Added to "${this.folders.find((f) => f.id === folderId)?.name}"` : "Removed from folder",
        "success",
      )

      // Update storage data
      await this.loadStorageData()
    } catch (error) {
      console.error("Error assigning chat to folder:", error)
      this.showNotification("Error updating folder", "error")
    }
  }

  showNotification(message, type = "success") {
    // Remove existing notifications
    document.querySelectorAll(".chatgpt-organizer-notification").forEach((n) => n.remove())

    const notification = document.createElement("div")
    notification.className = `chatgpt-organizer-notification ${type}`
    notification.textContent = message

    document.body.appendChild(notification)

    // Trigger animation
    requestAnimationFrame(() => {
      notification.classList.add("show")
    })

    setTimeout(() => {
      notification.classList.remove("show")
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }
}

// Check if running in a browser context
if (typeof window !== "undefined") {
  // Initialize when script loads
  new ChatGPTOrganizerContent()
}
