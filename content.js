// Main content script - Proper ChatGPT integration
class ChatGPTFolderExtension {
  constructor() {
    this.observer = null
    this.isInitialized = false
    this.chatMenuObserver = null
    this.currentTheme = "light"
  }

  async init() {
    if (this.isInitialized) return

    console.log("ChatGPT Folder+ initializing...")

    // Initialize storage
    await window.folderStorage.init()

    // Wait for ChatGPT to fully load
    await this.waitForChatGPTLoad()

    // Detect theme
    this.detectTheme()

    // Inject UI elements properly
    this.injectNativeUI()

    // Setup comprehensive mutation observer
    this.setupMutationObserver()

    this.isInitialized = true
    console.log("ChatGPT Folder+ initialized successfully")
  }

  async waitForChatGPTLoad() {
    return new Promise((resolve) => {
      const checkLoad = () => {
        // Look for ChatGPT's main header and sidebar
        const header =
          document.querySelector("header") ||
          document.querySelector('[data-testid="chat-header"]') ||
          document.querySelector("nav + div") // Header is usually after nav

        const sidebar =
          document.querySelector('nav[aria-label="Chat history"]') ||
          document.querySelector('[data-testid="conversation-turn"]') ||
          document.querySelector("aside")

        if (header && sidebar) {
          resolve()
        } else {
          setTimeout(checkLoad, 500)
        }
      }
      checkLoad()
    })
  }

  detectTheme() {
    // Check if ChatGPT is in dark mode
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark") ||
      getComputedStyle(document.body).backgroundColor.includes("rgb(32") ||
      window.matchMedia("(prefers-color-scheme: dark)").matches

    this.currentTheme = isDark ? "dark" : "light"
    document.documentElement.setAttribute("data-folder-theme", this.currentTheme)
  }

  injectNativeUI() {
    this.injectHeaderButton()
    this.injectPanelToggle()
    this.observeChatMenus()
  }

  injectHeaderButton() {
    // Remove existing button
    const existingBtn = document.getElementById("chatgpt-folder-btn")
    if (existingBtn) existingBtn.remove()

    // Find ChatGPT's actual header with share button
    const shareButton =
      document.querySelector('button[aria-label*="Share"]') ||
      document.querySelector('button:has(svg[data-icon="share"])') ||
      document.querySelector('[data-testid="share-button"]')

    let headerContainer = null

    if (shareButton) {
      // Found share button, use its parent container
      headerContainer = shareButton.parentElement
    } else {
      // Fallback: look for header patterns
      const possibleHeaders = [
        document.querySelector("header"),
        document.querySelector('[role="banner"]'),
        document.querySelector("nav + div"), // Header usually comes after nav
        document.querySelector(".sticky.top-0"), // Common sticky header pattern
      ]

      headerContainer = possibleHeaders.find((el) => el && el.offsetHeight > 0)
    }

    if (!headerContainer) {
      console.log("Header container not found, retrying...")
      setTimeout(() => this.injectHeaderButton(), 2000)
      return
    }

    // Create native-looking button
    const folderButton = this.createNativeHeaderButton()

    // Insert button in the right position
    if (shareButton) {
      shareButton.parentNode.insertBefore(folderButton, shareButton.nextSibling)
    } else {
      headerContainer.appendChild(folderButton)
    }
  }

  createNativeHeaderButton() {
    const button = document.createElement("button")
    button.id = "chatgpt-folder-btn"
    button.className = "chatgpt-folder-header-btn"

    // Match ChatGPT's button styling
    button.innerHTML = `
      <div class="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Folders</span>
      </div>
    `

    button.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.openFolderManager()
    })

    return button
  }

  injectPanelToggle() {
    const existingToggle = document.getElementById("chatgpt-folder-toggle")
    if (existingToggle) existingToggle.remove()

    const toggle = document.createElement("button")
    toggle.id = "chatgpt-folder-toggle"
    toggle.className = "chatgpt-folder-panel-toggle"
    toggle.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
    `
    toggle.title = "Toggle Folders Panel"

    toggle.addEventListener("click", () => this.toggleFolderPanel())
    document.body.appendChild(toggle)
  }

  observeChatMenus() {
    // Watch for chat items and their menus
    const sidebar =
      document.querySelector('nav[aria-label="Chat history"]') ||
      document.querySelector("aside") ||
      document.querySelector('[data-testid="conversation-turn"]')?.closest("nav")

    if (!sidebar) {
      setTimeout(() => this.observeChatMenus(), 1000)
      return
    }

    // Observe chat items being added/modified
    if (this.chatMenuObserver) {
      this.chatMenuObserver.disconnect()
    }

    this.chatMenuObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for new chat items
            this.processChatItems(node)

            // Check for opened menus
            this.processOpenMenus(node)
          }
        })
      })
    })

    this.chatMenuObserver.observe(sidebar, {
      childList: true,
      subtree: true,
    })

    // Process existing chat items
    this.processChatItems(sidebar)
  }

  processChatItems(container) {
    // Find all chat items that haven't been processed
    const chatItems = container.querySelectorAll(
      'li:not(.folder-processed), [data-testid="conversation-turn"]:not(.folder-processed)',
    )

    chatItems.forEach((chatItem) => {
      this.addFolderMenuToChatItem(chatItem)
      chatItem.classList.add("folder-processed")
    })
  }

  addFolderMenuToChatItem(chatItem) {
    // Find the three-dot menu button
    const menuButton =
      chatItem.querySelector('button[aria-haspopup="menu"]') ||
      chatItem.querySelector('button:has([data-icon="more"])') ||
      chatItem.querySelector("button:has(svg)") // Fallback for any button with SVG

    if (!menuButton) return

    // Add click listener to inject our menu option when menu opens
    const originalClick = menuButton.onclick
    menuButton.addEventListener("click", (e) => {
      // Let the original menu open first
      setTimeout(() => {
        this.injectFolderMenuOption(chatItem)
      }, 50)
    })
  }

  injectFolderMenuOption(chatItem) {
    // Find the opened menu
    const menu =
      document.querySelector('[role="menu"]') ||
      document.querySelector('[data-headlessui-state="open"]') ||
      document.querySelector(".absolute.z-10") // Common menu pattern

    if (!menu || menu.querySelector(".folder-menu-option")) return

    const chatId = this.extractChatId(chatItem)
    if (!chatId) return

    // Create folder menu option that matches ChatGPT's style
    const folderOption = document.createElement("div")
    folderOption.className = "folder-menu-option"
    folderOption.innerHTML = `
      <button class="folder-menu-item" data-chat-id="${chatId}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Add to Folder</span>
      </button>
    `

    folderOption.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.showFolderSelector(chatId)
      // Close the menu
      menu.style.display = "none"
      document.body.click() // Trigger outside click to close menu
    })

    // Insert at the top of the menu
    menu.insertBefore(folderOption, menu.firstChild)
  }

  processOpenMenus(container) {
    // Look for newly opened menus and inject our options
    const menus = container.querySelectorAll('[role="menu"]:not(.folder-menu-processed)')
    menus.forEach((menu) => {
      menu.classList.add("folder-menu-processed")
      // Menu processing is handled by chat item click listeners
    })
  }

  extractChatId(chatItem) {
    // Try multiple methods to extract chat ID
    const link = chatItem.querySelector('a[href*="/c/"]')
    if (link) {
      const match = link.href.match(/\/c\/([^/?]+)/)
      return match ? match[1] : null
    }

    // Fallback: look for data attributes or other identifiers
    const dataId = chatItem.getAttribute("data-id") || chatItem.getAttribute("data-chat-id") || chatItem.id

    return dataId || null
  }

  async openFolderManager() {
    if (document.getElementById("folder-manager-modal")) return

    const modal = await this.createFolderManagerModal()
    document.body.appendChild(modal)
  }

  async createFolderManagerModal() {
    const folders = await window.folderStorage.getFolders()

    const modal = document.createElement("div")
    modal.id = "folder-manager-modal"
    modal.className = "folder-modal-overlay"

    modal.innerHTML = `
      <div class="folder-modal-content">
        <div class="folder-modal-header">
          <h2>Manage Folders</h2>
          <button class="folder-modal-close" aria-label="Close">&times;</button>
        </div>
        
        <div class="folder-modal-body">
          <div class="folder-create-section">
            <div class="folder-input-group">
              <input type="text" id="folder-name-input" placeholder="New folder name..." maxlength="50">
              <input type="color" id="folder-color-input" value="#10a37f" title="Folder color">
              <button id="create-folder-btn" class="folder-btn-primary">Create</button>
            </div>
          </div>
          
          <div class="folder-list-section">
            <h3>Your Folders</h3>
            <div class="folder-list" id="folder-list">
              ${await this.renderFolderList(folders)}
            </div>
          </div>
        </div>
      </div>
    `

    // Add event listeners
    modal.querySelector(".folder-modal-close").addEventListener("click", () => modal.remove())
    modal.querySelector("#create-folder-btn").addEventListener("click", () => this.createFolder())
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove()
    })

    // Handle folder actions
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("folder-edit-btn")) {
        this.editFolder(e.target.dataset.folderId)
      } else if (e.target.classList.contains("folder-delete-btn")) {
        this.deleteFolder(e.target.dataset.folderId)
      }
    })

    return modal
  }

  async renderFolderList(folders) {
    let html = ""

    for (const folder of folders) {
      const chatCount = await window.folderStorage.getChatsInFolder(folder.id)

      html += `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="folder-info">
            <div class="folder-color-indicator" style="background-color: ${folder.color}"></div>
            <div class="folder-details">
              <span class="folder-name">${folder.name}</span>
              <span class="folder-count">${chatCount.length} chats</span>
            </div>
          </div>
          <div class="folder-actions">
            <button class="folder-edit-btn" data-folder-id="${folder.id}" title="Edit folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            ${
              folder.id !== "default"
                ? `
              <button class="folder-delete-btn" data-folder-id="${folder.id}" title="Delete folder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"/>
                </svg>
              </button>
            `
                : ""
            }
          </div>
        </div>
      `
    }

    return html
  }

  async createFolder() {
    const nameInput = document.getElementById("folder-name-input")
    const colorInput = document.getElementById("folder-color-input")

    const name = nameInput.value.trim()
    if (!name) {
      this.showNotification("Please enter a folder name", "error")
      return
    }

    try {
      await window.folderStorage.createFolder(name, colorInput.value)
      nameInput.value = ""
      colorInput.value = "#10a37f"

      // Refresh the folder list
      const folderList = document.getElementById("folder-list")
      const folders = await window.folderStorage.getFolders()
      folderList.innerHTML = await this.renderFolderList(folders)

      this.showNotification("Folder created successfully!", "success")
    } catch (error) {
      this.showNotification("Error creating folder", "error")
    }
  }

  async editFolder(folderId) {
    const folders = await window.folderStorage.getFolders()
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return

    const newName = prompt("Enter new folder name:", folder.name)
    if (newName && newName.trim() && newName.trim() !== folder.name) {
      try {
        await window.folderStorage.updateFolder(folderId, { name: newName.trim() })

        // Refresh the folder list
        const folderList = document.getElementById("folder-list")
        const updatedFolders = await window.folderStorage.getFolders()
        folderList.innerHTML = await this.renderFolderList(updatedFolders)

        this.showNotification("Folder updated successfully!", "success")
      } catch (error) {
        this.showNotification("Error updating folder", "error")
      }
    }
  }

  async deleteFolder(folderId) {
    if (!confirm("Are you sure you want to delete this folder? Chats will be moved to the General folder.")) {
      return
    }

    try {
      await window.folderStorage.deleteFolder(folderId)

      // Refresh the folder list
      const folderList = document.getElementById("folder-list")
      const folders = await window.folderStorage.getFolders()
      folderList.innerHTML = await this.renderFolderList(folders)

      this.showNotification("Folder deleted successfully!", "success")
    } catch (error) {
      this.showNotification("Error deleting folder", "error")
    }
  }

  async showFolderSelector(chatId) {
    if (document.getElementById("folder-selector-modal")) return

    const folders = await window.folderStorage.getFolders()
    const currentFolderId = await window.folderStorage.getChatFolder(chatId)

    const modal = document.createElement("div")
    modal.id = "folder-selector-modal"
    modal.className = "folder-modal-overlay"

    modal.innerHTML = `
      <div class="folder-selector-content">
        <div class="folder-selector-header">
          <h3>Move to Folder</h3>
          <button class="folder-modal-close">&times;</button>
        </div>
        <div class="folder-selector-list">
          ${folders
            .map(
              (folder) => `
            <button class="folder-selector-item ${folder.id === currentFolderId ? "selected" : ""}" 
                    data-folder-id="${folder.id}">
              <div class="folder-color-indicator" style="background-color: ${folder.color}"></div>
              <span class="folder-name">${folder.name}</span>
              ${folder.id === currentFolderId ? '<span class="checkmark">✓</span>' : ""}
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    `

    modal.addEventListener("click", async (e) => {
      if (e.target.classList.contains("folder-selector-item") || e.target.closest(".folder-selector-item")) {
        const item = e.target.closest(".folder-selector-item")
        const folderId = item.dataset.folderId

        try {
          await window.folderStorage.assignChatToFolder(chatId, folderId)
          this.showNotification("Chat moved to folder!", "success")
          modal.remove()
        } catch (error) {
          this.showNotification("Error moving chat", "error")
        }
      } else if (e.target.classList.contains("folder-modal-close") || e.target === modal) {
        modal.remove()
      }
    })

    document.body.appendChild(modal)
  }

  async toggleFolderPanel() {
    const existingPanel = document.getElementById("folder-panel")

    if (existingPanel) {
      existingPanel.remove()
      return
    }

    const panel = await this.createFolderPanel()
    document.body.appendChild(panel)
  }

  async createFolderPanel() {
    const folders = await window.folderStorage.getFolders()

    const panel = document.createElement("div")
    panel.id = "folder-panel"
    panel.className = "folder-panel"

    panel.innerHTML = `
      <div class="folder-panel-header">
        <h3>Folders</h3>
        <button class="folder-panel-close">&times;</button>
      </div>
      <div class="folder-panel-content">
        ${await this.renderFolderPanelContent(folders)}
      </div>
    `

    panel.querySelector(".folder-panel-close").addEventListener("click", () => panel.remove())

    return panel
  }

  async renderFolderPanelContent(folders) {
    let html = ""

    for (const folder of folders) {
      const chatIds = await window.folderStorage.getChatsInFolder(folder.id)

      html += `
        <div class="folder-panel-folder">
          <div class="folder-panel-folder-header">
            <div class="folder-color-indicator" style="background-color: ${folder.color}"></div>
            <span class="folder-name">${folder.name}</span>
            <span class="folder-count">(${chatIds.length})</span>
          </div>
          <div class="folder-panel-chats">
            ${chatIds
              .map((chatId) => {
                const chatTitle = this.getChatTitle(chatId) || "Unknown Chat"
                return `
                <div class="folder-panel-chat" data-chat-id="${chatId}">
                  <span class="chat-title">${chatTitle}</span>
                  <button class="chat-move-btn" data-chat-id="${chatId}" title="Move to another folder">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                </div>
              `
              })
              .join("")}
          </div>
        </div>
      `
    }

    return html
  }

  getChatTitle(chatId) {
    // Try to find the chat title from the sidebar
    const chatLink = document.querySelector(`a[href*="${chatId}"]`)
    if (chatLink) {
      return chatLink.textContent.trim()
    }
    return null
  }

  showNotification(message, type = "info") {
    const notification = document.createElement("div")
    notification.className = `folder-notification folder-notification-${type}`
    notification.textContent = message

    document.body.appendChild(notification)

    setTimeout(() => {
      notification.classList.add("show")
    }, 10)

    setTimeout(() => {
      notification.classList.remove("show")
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }

  setupMutationObserver() {
    if (this.observer) {
      this.observer.disconnect()
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldReinject = false
      let shouldReprocessChats = false

      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check for header changes
              if (
                node.querySelector &&
                (node.querySelector("header") ||
                  node.querySelector('[data-testid="chat-header"]') ||
                  node.matches("header"))
              ) {
                shouldReinject = true
              }

              // Check for new chat items
              if (
                node.querySelector &&
                (node.querySelector('[data-testid="conversation-turn"]') ||
                  node.matches('[data-testid="conversation-turn"]') ||
                  node.querySelector("li") ||
                  node.matches("li"))
              ) {
                shouldReprocessChats = true
              }

              // Check for theme changes
              if (node.classList && (node.classList.contains("dark") || node.classList.contains("light"))) {
                this.detectTheme()
              }
            }
          })
        }

        // Check for attribute changes that might indicate theme changes
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "class" || mutation.attributeName === "data-theme")
        ) {
          this.detectTheme()
        }
      })

      if (shouldReinject) {
        clearTimeout(this.reinjectTimeout)
        this.reinjectTimeout = setTimeout(() => {
          this.injectHeaderButton()
          this.injectPanelToggle()
        }, 500)
      }

      if (shouldReprocessChats) {
        clearTimeout(this.reprocessTimeout)
        this.reprocessTimeout = setTimeout(() => {
          this.observeChatMenus()
        }, 300)
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })
  }
}

// Initialize the extension
const extension = new ChatGPTFolderExtension()

// Start initialization
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => extension.init())
} else {
  extension.init()
}

// Handle navigation changes in SPA
let lastUrl = location.href
new MutationObserver(() => {
  const url = location.href
  if (url !== lastUrl) {
    lastUrl = url
    setTimeout(() => {
      extension.injectNativeUI()
    }, 1000)
  }
}).observe(document, { subtree: true, childList: true })
