// UI components and modal management
class FolderUI {
  constructor() {
    this.isModalOpen = false
    this.isPanelOpen = false
    this.currentChatId = null
  }

  // Create the main Add+ button
  createAddButton() {
    const button = document.createElement("button")
    button.id = "chatgpt-folder-add-btn"
    button.className = "chatgpt-folder-add-button"
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <span>Add+</span>
    `
    button.addEventListener("click", () => this.openFolderModal())
    return button
  }

  // Create the right panel toggle button
  createPanelToggle() {
    const toggle = document.createElement("button")
    toggle.id = "chatgpt-folder-panel-toggle"
    toggle.className = "chatgpt-folder-panel-toggle"
    toggle.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7h18M3 12h18M3 17h18"/>
      </svg>
    `
    toggle.addEventListener("click", () => this.togglePanel())
    return toggle
  }

  // Create folder management modal
  async createFolderModal() {
    const modal = document.createElement("div")
    modal.id = "chatgpt-folder-modal"
    modal.className = "chatgpt-folder-modal"

    const folders = await window.folderStorage.getFolders()

    modal.innerHTML = `
      <div class="chatgpt-folder-modal-content">
        <div class="chatgpt-folder-modal-header">
          <h3>Manage Folders</h3>
          <button class="chatgpt-folder-close-btn">&times;</button>
        </div>
        <div class="chatgpt-folder-modal-body">
          <div class="chatgpt-folder-create-section">
            <input type="text" id="new-folder-name" placeholder="Enter folder name..." maxlength="50">
            <input type="color" id="new-folder-color" value="#10a37f">
            <button id="create-folder-btn">Create Folder</button>
          </div>
          <div class="chatgpt-folder-list">
            <h4>Existing Folders</h4>
            <div id="folder-list-container">
              ${folders.map((folder) => this.createFolderItem(folder)).join("")}
            </div>
          </div>
        </div>
      </div>
    `

    // Add event listeners
    modal.querySelector(".chatgpt-folder-close-btn").addEventListener("click", () => this.closeFolderModal())
    modal.querySelector("#create-folder-btn").addEventListener("click", () => this.createNewFolder())
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.closeFolderModal()
    })

    return modal
  }

  createFolderItem(folder) {
    return `
      <div class="chatgpt-folder-item" data-folder-id="${folder.id}">
        <div class="chatgpt-folder-color" style="background-color: ${folder.color}"></div>
        <span class="chatgpt-folder-name">${folder.name}</span>
        <div class="chatgpt-folder-actions">
          <button class="chatgpt-folder-edit-btn" data-folder-id="${folder.id}">✏️</button>
          ${folder.id !== "default" ? `<button class="chatgpt-folder-delete-btn" data-folder-id="${folder.id}">🗑️</button>` : ""}
        </div>
      </div>
    `
  }

  // Create right side panel
  async createRightPanel() {
    const panel = document.createElement("div")
    panel.id = "chatgpt-folder-panel"
    panel.className = "chatgpt-folder-panel"

    const folders = await window.folderStorage.getFolders()
    const mappings = await window.folderStorage.getChatMappings()

    panel.innerHTML = `
      <div class="chatgpt-folder-panel-header">
        <h3>Folders</h3>
        <button class="chatgpt-folder-panel-close">&times;</button>
      </div>
      <div class="chatgpt-folder-panel-content">
        ${await this.createFolderPanelContent(folders, mappings)}
      </div>
    `

    panel.querySelector(".chatgpt-folder-panel-close").addEventListener("click", () => this.togglePanel())

    return panel
  }

  async createFolderPanelContent(folders, mappings) {
    let content = ""

    for (const folder of folders) {
      const chatIds = await window.folderStorage.getChatsInFolder(folder.id)
      const chatElements = chatIds
        .map((chatId) => {
          const chatElement = document.querySelector(`[data-testid="conversation-turn"]:has([href*="${chatId}"])`)
          const chatTitle = chatElement ? chatElement.textContent.trim() : "Unknown Chat"
          return `
          <div class="chatgpt-folder-chat-item" data-chat-id="${chatId}">
            <span class="chatgpt-folder-chat-title">${chatTitle}</span>
            <button class="chatgpt-folder-move-chat" data-chat-id="${chatId}">📁</button>
          </div>
        `
        })
        .join("")

      content += `
        <div class="chatgpt-folder-panel-folder" data-folder-id="${folder.id}">
          <div class="chatgpt-folder-panel-folder-header">
            <div class="chatgpt-folder-color" style="background-color: ${folder.color}"></div>
            <span class="chatgpt-folder-name">${folder.name}</span>
            <span class="chatgpt-folder-count">(${chatIds.length})</span>
          </div>
          <div class="chatgpt-folder-panel-chats">
            ${chatElements}
          </div>
        </div>
      `
    }

    return content
  }

  // Modal management
  async openFolderModal() {
    if (this.isModalOpen) return

    this.isModalOpen = true
    const modal = await this.createFolderModal()
    document.body.appendChild(modal)

    // Add event listeners for folder actions
    this.attachFolderEventListeners()
  }

  closeFolderModal() {
    const modal = document.getElementById("chatgpt-folder-modal")
    if (modal) {
      modal.remove()
      this.isModalOpen = false
    }
  }

  async togglePanel() {
    const existingPanel = document.getElementById("chatgpt-folder-panel")

    if (existingPanel) {
      existingPanel.remove()
      this.isPanelOpen = false
    } else {
      const panel = await this.createRightPanel()
      document.body.appendChild(panel)
      this.isPanelOpen = true

      // Add event listeners
      this.attachPanelEventListeners()
    }
  }

  // Event listeners
  attachFolderEventListeners() {
    const modal = document.getElementById("chatgpt-folder-modal")
    if (!modal) return

    // Create folder
    modal.addEventListener("click", async (e) => {
      if (e.target.classList.contains("chatgpt-folder-edit-btn")) {
        const folderId = e.target.dataset.folderId
        this.editFolder(folderId)
      } else if (e.target.classList.contains("chatgpt-folder-delete-btn")) {
        const folderId = e.target.dataset.folderId
        this.deleteFolder(folderId)
      }
    })
  }

  attachPanelEventListeners() {
    const panel = document.getElementById("chatgpt-folder-panel")
    if (!panel) return

    panel.addEventListener("click", (e) => {
      if (e.target.classList.contains("chatgpt-folder-move-chat")) {
        const chatId = e.target.dataset.chatId
        this.showChatMoveOptions(chatId)
      }
    })
  }

  // Folder operations
  async createNewFolder() {
    const nameInput = document.getElementById("new-folder-name")
    const colorInput = document.getElementById("new-folder-color")

    const name = nameInput.value.trim()
    const color = colorInput.value

    if (!name) {
      alert("Please enter a folder name")
      return
    }

    await window.folderStorage.createFolder(name, color)
    nameInput.value = ""
    colorInput.value = "#10a37f"

    // Refresh modal content
    this.closeFolderModal()
    this.openFolderModal()
  }

  async editFolder(folderId) {
    const folders = await window.folderStorage.getFolders()
    const folder = folders.find((f) => f.id === folderId)
    if (!folder) return

    const newName = prompt("Enter new folder name:", folder.name)
    if (newName && newName.trim()) {
      await window.folderStorage.updateFolder(folderId, { name: newName.trim() })
      this.closeFolderModal()
      this.openFolderModal()
    }
  }

  async deleteFolder(folderId) {
    if (confirm("Are you sure you want to delete this folder? Chats will be moved to General folder.")) {
      await window.folderStorage.deleteFolder(folderId)
      this.closeFolderModal()
      this.openFolderModal()
    }
  }

  async showChatMoveOptions(chatId) {
    const folders = await window.folderStorage.getFolders()
    const currentFolder = await window.folderStorage.getChatFolder(chatId)

    const options = folders
      .map(
        (folder) =>
          `<option value="${folder.id}" ${folder.id === currentFolder ? "selected" : ""}>${folder.name}</option>`,
      )
      .join("")

    const select = document.createElement("select")
    select.innerHTML = options
    select.className = "chatgpt-folder-select"

    const result = prompt("Select folder:", "")
    if (result !== null) {
      const selectedFolder = folders.find((f) => f.name === result)
      if (selectedFolder) {
        await window.folderStorage.assignChatToFolder(chatId, selectedFolder.id)
        this.togglePanel() // Refresh panel
        this.togglePanel()
      }
    }
  }

  // Inject chat menu options
  injectChatMenuOptions() {
    const chatItems = document.querySelectorAll('[data-testid="conversation-turn"]')

    chatItems.forEach((chatItem) => {
      if (chatItem.querySelector(".chatgpt-folder-menu-injected")) return

      const menuButton = chatItem.querySelector('button[aria-haspopup="menu"]')
      if (menuButton) {
        // Mark as injected
        chatItem.classList.add("chatgpt-folder-menu-injected")

        // Add click listener to inject our options
        menuButton.addEventListener("click", () => {
          setTimeout(() => this.injectMenuOptions(chatItem), 100)
        })
      }
    })
  }

  async injectMenuOptions(chatItem) {
    const menu = document.querySelector('[role="menu"]')
    if (!menu || menu.querySelector(".chatgpt-folder-menu-option")) return

    const chatId = this.extractChatId(chatItem)
    if (!chatId) return

    const folderOption = document.createElement("div")
    folderOption.className = "chatgpt-folder-menu-option"
    folderOption.innerHTML = `
      <button class="chatgpt-folder-menu-btn" data-chat-id="${chatId}">
        📁 Add to Folder
      </button>
    `

    folderOption.addEventListener("click", () => {
      this.showFolderSelectionForChat(chatId)
      menu.style.display = "none" // Close menu
    })

    menu.insertBefore(folderOption, menu.firstChild)
  }

  extractChatId(chatItem) {
    const link = chatItem.querySelector('a[href*="/c/"]')
    if (link) {
      const href = link.getAttribute("href")
      const match = href.match(/\/c\/([^/?]+)/)
      return match ? match[1] : null
    }
    return null
  }

  async showFolderSelectionForChat(chatId) {
    const folders = await window.folderStorage.getFolders()
    const currentFolder = await window.folderStorage.getChatFolder(chatId)

    const modal = document.createElement("div")
    modal.className = "chatgpt-folder-selection-modal"
    modal.innerHTML = `
      <div class="chatgpt-folder-selection-content">
        <h3>Select Folder</h3>
        <div class="chatgpt-folder-selection-list">
          ${folders
            .map(
              (folder) => `
            <div class="chatgpt-folder-selection-item ${folder.id === currentFolder ? "selected" : ""}" data-folder-id="${folder.id}">
              <div class="chatgpt-folder-color" style="background-color: ${folder.color}"></div>
              <span>${folder.name}</span>
              ${folder.id === currentFolder ? '<span class="checkmark">✓</span>' : ""}
            </div>
          `,
            )
            .join("")}
        </div>
        <button class="chatgpt-folder-selection-close">Cancel</button>
      </div>
    `

    modal.addEventListener("click", async (e) => {
      if (
        e.target.classList.contains("chatgpt-folder-selection-item") ||
        e.target.parentElement.classList.contains("chatgpt-folder-selection-item")
      ) {
        const item = e.target.classList.contains("chatgpt-folder-selection-item") ? e.target : e.target.parentElement
        const folderId = item.dataset.folderId
        await window.folderStorage.assignChatToFolder(chatId, folderId)
        modal.remove()
      } else if (e.target.classList.contains("chatgpt-folder-selection-close") || e.target === modal) {
        modal.remove()
      }
    })

    document.body.appendChild(modal)
  }
}

// Global UI instance
window.folderUI = new FolderUI()
