class ChatGPTOrganizerContent {
  constructor() {
    this.chats = []
    this.folders = []
    this.observer = null
    this.isInitialized = false
    this.currentChatId = null
    this.addToFolderButton = null
    this.buttonInjectionTimeout = null
    this.chatUpdateTimeout = null
    this.buttonUpdateTimeout = null

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
    console.log("ChatGPT Organizer: Setting up content script")
    await this.loadStorageData()
    this.setupMutationObserver()
    this.detectAndProcessChats()
    this.addChatPageButton()
    this.isInitialized = true

    // Re-run detection periodically for dynamic content
    setInterval(() => {
      this.detectAndProcessChats()
      this.addChatPageButton()
    }, 3000)
  }

  async loadStorageData() {
    try {
      const result = await chrome.storage.local.get(["folders", "chats"])
      this.folders = result.folders || []
      this.chats = result.chats || []
      console.log("Loaded storage data:", { folders: this.folders.length, chats: this.chats.length })
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

    // Add organize buttons to each chat in sidebar
    this.addSidebarButtons()
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
      'ol li a[href*="/c/"]',
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
      let shouldUpdateChats = false
      let shouldUpdateButton = false

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          const target = mutation.target

          // Check for navigation changes (sidebar)
          if (
            target.matches("nav") ||
            target.closest("nav") ||
            target.querySelector('a[href*="/c/"]') ||
            target.querySelector('a[href*="/chat/"]')
          ) {
            shouldUpdateChats = true
          }

          // Check for main content changes (chat page)
          if (
            target.matches("main") ||
            target.closest("main") ||
            target.matches("header") ||
            target.closest("header") ||
            target.classList.contains("sticky")
          ) {
            shouldUpdateButton = true
          }
        }
      })

      // Debounce updates
      if (shouldUpdateChats) {
        clearTimeout(this.chatUpdateTimeout)
        this.chatUpdateTimeout = setTimeout(() => {
          this.detectAndProcessChats()
        }, 1000)
      }

      if (shouldUpdateButton) {
        clearTimeout(this.buttonUpdateTimeout)
        this.buttonUpdateTimeout = setTimeout(() => {
          this.addChatPageButton()
        }, 800)
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  addSidebarButtons() {
    const chatElements = this.getChatElements()

    chatElements.forEach((element) => {
      // Skip if button already exists
      if (element.querySelector(".chatgpt-organizer-sidebar-btn") || element.closest(".chatgpt-organizer-processed")) {
        return
      }

      const chatId = this.extractChatId(element)
      if (!chatId) return

      // Mark as processed
      element.classList.add("chatgpt-organizer-processed")

      // Create organize button
      const button = document.createElement("button")
      button.className = "chatgpt-organizer-sidebar-btn"
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

  addChatPageButton() {
    // Check if we're on a chat page
    const currentUrl = window.location.href
    const chatMatch = currentUrl.match(/\/c\/([^/?]+)|\/chat\/([^/?]+)/)

    if (!chatMatch) {
      // Remove button if not on chat page
      this.removeChatButton()
      return
    }

    const newChatId = chatMatch[1] || chatMatch[2]

    // Only proceed if chat ID changed or button doesn't exist
    if (this.currentChatId === newChatId && this.addToFolderButton && document.contains(this.addToFolderButton)) {
      return // Button already exists for this chat
    }

    this.currentChatId = newChatId
    console.log("Current chat ID:", this.currentChatId)

    // Remove existing button before creating new one
    this.removeChatButton()

    // Wait for page to stabilize before injecting
    clearTimeout(this.buttonInjectionTimeout)
    this.buttonInjectionTimeout = setTimeout(() => {
      this.injectChatButton()
    }, 500)
  }

  removeChatButton() {
    if (this.addToFolderButton) {
      this.addToFolderButton.remove()
      this.addToFolderButton = null
    }
    // Also remove any orphaned buttons
    document.querySelectorAll(".chatgpt-organizer-chat-btn").forEach((btn) => btn.remove())
  }

  injectChatButton() {
    // Prevent multiple injections
    if (this.addToFolderButton && document.contains(this.addToFolderButton)) {
      return
    }

    // Strategy 1: Find the header with share/edit buttons
    const targetContainer = this.findHeaderContainer()

    if (!targetContainer) {
      console.log("No suitable header container found, trying fallback")
      return // Don't inject if we can't find proper placement
    }

    console.log("Injecting button into:", targetContainer.tagName, targetContainer.className)

    // Create the button with proper ChatGPT styling
    this.addToFolderButton = document.createElement("button")
    this.addToFolderButton.className = "chatgpt-organizer-chat-btn btn relative btn-neutral border-0 md:border"
    this.addToFolderButton.innerHTML = `
      <div class="flex w-full items-center justify-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V5C2 3.89543 2.89543 3 4 3H9L11 5H20C21.1046 5 22 5.89543 22 7V19Z"/>
        </svg>
        <span class="hidden sm:inline">Add to Folder</span>
      </div>
    `
    this.addToFolderButton.title = "Add this chat to a folder"

    // Add click handler
    this.addToFolderButton.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      console.log("Button clicked, showing folder selector")
      this.showFolderSelector(this.currentChatId, this.addToFolderButton)
    })

    // Insert button in the correct position
    this.insertButtonInContainer(targetContainer)
  }

  findHeaderContainer() {
    // Look for the specific header structure in ChatGPT
    const selectors = [
      // Main header with buttons
      ".sticky.top-0.z-10.flex.h-14.items-center.justify-between.bg-white.p-2.font-semibold.text-gray-800.dark\\:bg-gray-800.dark\\:text-gray-100",
      ".sticky.top-0.z-10.flex.h-14.items-center.justify-between",
      ".flex.h-14.items-center.justify-between.bg-white.p-2",
      ".sticky.top-0.z-10",
      // Fallback selectors
      "header",
      ".flex.items-center.justify-between.border-b",
      ".border-b.border-black\\/10.dark\\:border-gray-900\\/50",
    ]

    for (const selector of selectors) {
      const container = document.querySelector(selector)
      if (container && container.offsetHeight > 0) {
        // Check if this container has buttons or is suitable for button placement
        const hasButtons =
          container.querySelector("button") ||
          container.querySelector(".btn") ||
          container.querySelector('[role="button"]')

        if (hasButtons || container.classList.contains("justify-between")) {
          console.log("Found suitable container:", selector)
          return container
        }
      }
    }

    return null
  }

  insertButtonInContainer(container) {
    // Find the right side of the header (usually contains share/edit buttons)
    const rightSide =
      container.querySelector(".flex.items-center.gap-1") ||
      container.querySelector(".flex.gap-1") ||
      container.querySelector(".ml-auto") ||
      container.querySelector(".flex:last-child")

    if (rightSide) {
      // Insert at the beginning of the button group
      rightSide.insertBefore(this.addToFolderButton, rightSide.firstChild)
      console.log("Inserted button in right side button group")
    } else {
      // Create a button container if none exists
      const buttonContainer = document.createElement("div")
      buttonContainer.className = "flex items-center gap-1"
      buttonContainer.appendChild(this.addToFolderButton)

      // Append to the end of the header
      container.appendChild(buttonContainer)
      console.log("Created new button container")
    }
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

    // Position popup directly below the button
    const rect = buttonElement.getBoundingClientRect()
    popup.style.position = "fixed"
    popup.style.top = `${rect.bottom + 8}px`
    popup.style.left = `${Math.max(10, rect.left - 100)}px` // Offset to center better
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
      console.log("Assigning chat to folder:", { chatId, folderId })

      // Reload fresh data from storage
      await this.loadStorageData()

      // Get current chat title if not in our list
      let chat = this.chats.find((c) => c.id === chatId)
      if (!chat) {
        // Try to get title from current page or chat elements
        let title = "Untitled Chat"

        if (this.currentChatId === chatId) {
          // We're on the chat page, try to get title from page
          const titleSelectors = [
            "h1",
            ".text-lg.font-semibold",
            '[data-testid="chat-title"]',
            ".text-xl.font-semibold",
            ".font-semibold",
            "title",
          ]

          for (const selector of titleSelectors) {
            const titleElement = document.querySelector(selector)
            if (titleElement && titleElement.textContent?.trim()) {
              title = titleElement.textContent.trim()
              console.log("Found title:", title)
              break
            }
          }

          // Fallback: try to get from document title
          if (title === "Untitled Chat" && document.title && !document.title.includes("ChatGPT")) {
            title = document.title.split(" | ")[0] || "Untitled Chat"
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
        console.log("Created new chat:", chat)
      }

      // Remove from previous folder
      if (chat.folderId) {
        const prevFolder = this.folders.find((f) => f.id === chat.folderId)
        if (prevFolder) {
          prevFolder.chatIds = prevFolder.chatIds || []
          prevFolder.chatIds = prevFolder.chatIds.filter((id) => id !== chatId)
          console.log("Removed from previous folder:", prevFolder.name)
        }
      }

      // Add to new folder
      chat.folderId = folderId
      if (folderId) {
        const folder = this.folders.find((f) => f.id === folderId)
        if (folder) {
          if (!folder.chatIds) folder.chatIds = []
          if (!folder.chatIds.includes(chatId)) {
            folder.chatIds.push(chatId)
          }
          console.log("Added to folder:", folder.name, "Total chats:", folder.chatIds.length)
        }
      } else {
        console.log("Removed from all folders")
      }

      // Save to storage with error handling
      const saveData = {
        folders: this.folders,
        chats: this.chats,
      }

      console.log("Saving data:", saveData)
      await chrome.storage.local.set(saveData)

      // Verify save
      const verification = await chrome.storage.local.get(["folders", "chats"])
      console.log("Verification - saved successfully:", verification)

      // Show success notification
      this.showNotification(
        folderId ? `Added to "${this.folders.find((f) => f.id === folderId)?.name}"` : "Removed from folder",
        "success",
      )

      // Update storage data
      await this.loadStorageData()

      // Notify popup about changes
      chrome.runtime.sendMessage({
        type: "FOLDER_UPDATED",
        folders: this.folders,
        chats: this.chats,
      })
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
