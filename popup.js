class ChatGPTOrganizer {
  constructor() {
    this.folders = []
    this.chats = []
    this.currentEditingFolder = null
    this.selectedColor = "#3b82f6"
    this.isDarkMode = false

    this.init()
  }

  async init() {
    await this.loadData()
    this.setupEventListeners()
    this.render()
    this.updateStats()
    this.loadTheme()

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.folders || changes.chats) {
        this.loadData().then(() => {
          this.render()
          this.updateStats()
        })
      }
    })
  }

  async loadData() {
    try {
      const result = await chrome.storage.local.get(["folders", "chats", "darkMode"])
      this.folders = result.folders || []
      this.chats = result.chats || []
      this.isDarkMode = result.darkMode || false
      console.log("Loaded data:", { folders: this.folders.length, chats: this.chats.length })
    } catch (error) {
      console.error("Error loading data:", error)
    }
  }

  async saveData() {
    try {
      await chrome.storage.local.set({
        folders: this.folders,
        chats: this.chats,
        darkMode: this.isDarkMode,
      })
      console.log("Saved data:", { folders: this.folders.length, chats: this.chats.length })
    } catch (error) {
      console.error("Error saving data:", error)
    }
  }

  setupEventListeners() {
    // Create folder button
    document.getElementById("createFolderBtn").addEventListener("click", () => {
      this.openFolderModal()
    })

    // Modal events
    document.getElementById("closeModal").addEventListener("click", () => {
      this.closeFolderModal()
    })

    document.getElementById("cancelBtn").addEventListener("click", () => {
      this.closeFolderModal()
    })

    document.getElementById("saveBtn").addEventListener("click", () => {
      this.saveFolderModal()
    })

    // Color picker
    document.querySelectorAll(".color-option").forEach((option) => {
      option.addEventListener("click", (e) => {
        this.selectColor(e.target.dataset.color)
      })
    })

    // Search functionality
    const searchInput = document.getElementById("searchInput")
    const clearSearch = document.getElementById("clearSearch")

    searchInput.addEventListener("input", (e) => {
      this.handleSearch(e.target.value)
      clearSearch.style.display = e.target.value ? "flex" : "none"
    })

    clearSearch.addEventListener("click", () => {
      searchInput.value = ""
      this.handleSearch("")
      clearSearch.style.display = "none"
      searchInput.focus()
    })

    // Dark mode toggle
    document.getElementById("darkModeToggle").addEventListener("click", () => {
      this.toggleDarkMode()
    })

    // Export/Import
    document.getElementById("exportBtn").addEventListener("click", () => {
      this.exportData()
    })

    document.getElementById("importBtn").addEventListener("click", () => {
      document.getElementById("importFile").click()
    })

    document.getElementById("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) {
        this.importData(e.target.files[0])
      }
    })

    // Modal backdrop click
    document.getElementById("folderModal").addEventListener("click", (e) => {
      if (e.target.id === "folderModal") {
        this.closeFolderModal()
      }
    })

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeFolderModal()
      }
      if (e.key === "Enter" && document.getElementById("folderModal").style.display === "flex") {
        this.saveFolderModal()
      }
    })

    // Folder name input enter key
    document.getElementById("folderName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.saveFolderModal()
      }
    })
  }

  openFolderModal(folder = null) {
    this.currentEditingFolder = folder
    const modal = document.getElementById("folderModal")
    const title = document.getElementById("modalTitle")
    const nameInput = document.getElementById("folderName")

    if (folder) {
      title.textContent = "Edit Folder"
      nameInput.value = folder.name
      this.selectColor(folder.color)
    } else {
      title.textContent = "Create New Folder"
      nameInput.value = ""
      this.selectColor("#3b82f6")
    }

    modal.style.display = "flex"
    setTimeout(() => nameInput.focus(), 100)
  }

  closeFolderModal() {
    document.getElementById("folderModal").style.display = "none"
    this.currentEditingFolder = null
  }

  selectColor(color) {
    this.selectedColor = color
    document.querySelectorAll(".color-option").forEach((option) => {
      option.classList.toggle("selected", option.dataset.color === color)
    })
  }

  async saveFolderModal() {
    const nameInput = document.getElementById("folderName")
    const name = nameInput.value.trim()

    if (!name) {
      nameInput.focus()
      this.showError("Please enter a folder name")
      return
    }

    // Check for duplicate names (excluding current folder being edited)
    const existingFolder = this.folders.find(
      (f) =>
        f.name.toLowerCase() === name.toLowerCase() &&
        (!this.currentEditingFolder || f.id !== this.currentEditingFolder.id),
    )

    if (existingFolder) {
      nameInput.focus()
      this.showError("A folder with this name already exists")
      return
    }

    try {
      if (this.currentEditingFolder) {
        // Edit existing folder
        const folderIndex = this.folders.findIndex((f) => f.id === this.currentEditingFolder.id)
        if (folderIndex !== -1) {
          this.folders[folderIndex] = {
            ...this.folders[folderIndex],
            name,
            color: this.selectedColor,
            updatedAt: new Date().toISOString(),
          }
        }
      } else {
        // Create new folder
        const newFolder = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name,
          color: this.selectedColor,
          chatIds: [],
          isPinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        this.folders.push(newFolder)
      }

      await this.saveData()
      this.render()
      this.updateStats()
      this.closeFolderModal()
      this.showSuccess(this.currentEditingFolder ? "Folder updated!" : "Folder created!")
    } catch (error) {
      console.error("Error saving folder:", error)
      this.showError("Error saving folder")
    }
  }

  async deleteFolder(folderId) {
    const folder = this.folders.find((f) => f.id === folderId)
    if (!folder) return

    const chatCount = this.chats.filter((chat) => chat.folderId === folderId).length
    const message =
      chatCount > 0
        ? `Delete "${folder.name}"? ${chatCount} chat${chatCount !== 1 ? "s" : ""} will be moved back to unorganized.`
        : `Delete "${folder.name}"?`

    if (!confirm(message)) {
      return
    }

    try {
      const folderIndex = this.folders.findIndex((f) => f.id === folderId)
      if (folderIndex !== -1) {
        // Remove folder assignments from chats
        this.chats.forEach((chat) => {
          if (chat.folderId === folderId) {
            chat.folderId = null
          }
        })

        this.folders.splice(folderIndex, 1)
        await this.saveData()
        this.render()
        this.updateStats()
        this.showSuccess("Folder deleted!")
      }
    } catch (error) {
      console.error("Error deleting folder:", error)
      this.showError("Error deleting folder")
    }
  }

  async toggleFolderPin(folderId) {
    try {
      const folder = this.folders.find((f) => f.id === folderId)
      if (folder) {
        folder.isPinned = !folder.isPinned
        folder.updatedAt = new Date().toISOString()
        await this.saveData()
        this.render()
      }
    } catch (error) {
      console.error("Error toggling pin:", error)
    }
  }

  handleSearch(query) {
    const foldersContent = document.getElementById("foldersContent")
    const folders = foldersContent.querySelectorAll(".folder-item")

    if (!query) {
      folders.forEach((folder) => {
        folder.style.display = "block"
        const chats = folder.querySelectorAll(".chat-item")
        chats.forEach((chat) => (chat.style.display = "flex"))
      })
      return
    }

    const searchTerm = query.toLowerCase()

    folders.forEach((folder) => {
      const folderName = folder.querySelector(".folder-name").textContent.toLowerCase()
      const chats = folder.querySelectorAll(".chat-item")
      let hasVisibleChats = false

      // Check chats first
      chats.forEach((chat) => {
        const chatTitle = chat.querySelector(".chat-title").textContent.toLowerCase()
        const isVisible = chatTitle.includes(searchTerm)
        chat.style.display = isVisible ? "flex" : "none"
        if (isVisible) hasVisibleChats = true
      })

      // Show folder if name matches or has visible chats
      const showFolder = folderName.includes(searchTerm) || hasVisibleChats
      folder.style.display = showFolder ? "block" : "none"

      // Expand folder if it has matches
      if (showFolder && hasVisibleChats) {
        const content = folder.querySelector(".folder-content")
        const toggle = folder.querySelector(".folder-toggle")
        if (content && toggle) {
          content.classList.add("expanded")
          toggle.classList.add("expanded")
        }
      }
    })
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode
    this.saveData()
    this.loadTheme()
  }

  loadTheme() {
    document.body.setAttribute("data-theme", this.isDarkMode ? "dark" : "light")
  }

  exportData() {
    const data = {
      folders: this.folders,
      chats: this.chats,
      exportDate: new Date().toISOString(),
      version: "1.0.0",
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `chatgpt-organizer-${new Date().toISOString().split("T")[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    this.showSuccess("Data exported successfully!")
  }

  async importData(file) {
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.folders || !Array.isArray(data.folders)) {
        this.showError("Invalid file format. Please select a valid export file.")
        return
      }

      if (confirm("This will replace your current folders and organization. Continue?")) {
        this.folders = data.folders
        this.chats = data.chats || []
        await this.saveData()
        this.render()
        this.updateStats()
        this.showSuccess("Data imported successfully!")
      }
    } catch (error) {
      console.error("Import error:", error)
      this.showError("Error importing file. Please check the file format.")
    }

    // Reset file input
    document.getElementById("importFile").value = ""
  }

  toggleFolder(folderId) {
    const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`)
    if (!folderElement) return

    const content = folderElement.querySelector(".folder-content")
    const toggle = folderElement.querySelector(".folder-toggle")

    if (content && toggle) {
      content.classList.toggle("expanded")
      toggle.classList.toggle("expanded")
    }
  }

  async removeChatFromFolder(chatId) {
    try {
      const chat = this.chats.find((c) => c.id === chatId)
      if (chat) {
        const folder = this.folders.find((f) => f.id === chat.folderId)
        if (folder) {
          folder.chatIds = folder.chatIds.filter((id) => id !== chatId)
        }
        chat.folderId = null
        await this.saveData()
        this.render()
        this.updateStats()
        this.showSuccess("Chat removed from folder!")
      }
    } catch (error) {
      console.error("Error removing chat:", error)
      this.showError("Error removing chat from folder")
    }
  }

  render() {
    const foldersContent = document.getElementById("foldersContent")
    const emptyState = document.getElementById("emptyState")

    if (this.folders.length === 0) {
      foldersContent.innerHTML = ""
      emptyState.style.display = "flex"
      return
    }

    emptyState.style.display = "none"

    // Sort folders: pinned first, then by name
    const sortedFolders = [...this.folders].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return a.name.localeCompare(b.name)
    })

    foldersContent.innerHTML = sortedFolders
      .map((folder) => {
        const folderChats = this.chats.filter((chat) => chat.folderId === folder.id)

        return `
          <div class="folder-item" data-folder-id="${folder.id}">
            <div class="folder-header" onclick="organizer.toggleFolder('${folder.id}')">
              <div class="folder-color" style="background-color: ${folder.color}"></div>
              <div class="folder-info">
                <div class="folder-name">
                  ${folder.isPinned ? "📌 " : ""}${this.escapeHtml(folder.name)}
                </div>
                <div class="folder-count">${folderChats.length} chat${folderChats.length !== 1 ? "s" : ""}</div>
              </div>
              <div class="folder-actions" onclick="event.stopPropagation()">
                <button class="folder-action-btn" onclick="organizer.toggleFolderPin('${folder.id}')" title="${folder.isPinned ? "Unpin" : "Pin"} folder">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 17V3"/>
                    <path d="M5 7L19 7"/>
                    <path d="M19 7V13C19 14.1046 18.1046 15 17 15H7C5.89543 15 5 14.1046 5 13V7"/>
                  </svg>
                </button>
                <button class="folder-action-btn" onclick="organizer.openFolderModal(organizer.folders.find(f => f.id === '${folder.id}'))" title="Edit folder">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4C2.89543 4 2 4.89543 2 6V18C2 19.1046 2.89543 20 4 20H16C17.1046 20 18 19.1046 18 18V11"/>
                    <path d="M18.5 2.5C19.3284 1.67157 20.6716 1.67157 21.5 2.5C22.3284 3.32843 22.3284 4.67157 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z"/>
                  </svg>
                </button>
                <button class="folder-action-btn delete" onclick="organizer.deleteFolder('${folder.id}')" title="Delete folder">
                  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6H5H21"/>
                    <path d="M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6"/>
                    <path d="M19 6V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V6"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
              <button class="folder-toggle">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,18 15,12 9,6"/>
                </svg>
              </button>
            </div>
            <div class="folder-content">
              <div class="chat-list">
                ${
                  folderChats.length === 0
                    ? '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">No chats in this folder</div>'
                    : folderChats
                        .map(
                          (chat) => `
                        <div class="chat-item" data-chat-id="${chat.id}">
                          <div class="chat-title" title="${this.escapeHtml(chat.title)}">${this.escapeHtml(chat.title)}</div>
                          <div class="chat-actions">
                            <button class="folder-action-btn" onclick="organizer.removeChatFromFolder('${chat.id}')" title="Remove from folder">
                              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      `,
                        )
                        .join("")
                }
              </div>
            </div>
          </div>
        `
      })
      .join("")
  }

  updateStats() {
    document.getElementById("folderCount").textContent = this.folders.length
    document.getElementById("chatCount").textContent = this.chats.filter((chat) => chat.folderId).length
  }

  escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  showSuccess(message) {
    this.showToast(message, "success")
  }

  showError(message) {
    this.showToast(message, "error")
  }

  showToast(message, type = "success") {
    // Remove existing toasts
    document.querySelectorAll(".toast").forEach((t) => t.remove())

    const toast = document.createElement("div")
    toast.className = `toast toast-${type}`
    toast.textContent = message

    document.body.appendChild(toast)

    setTimeout(() => toast.classList.add("show"), 100)
    setTimeout(() => {
      toast.classList.remove("show")
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // Method to be called from content script
  async updateChatsFromPage(chats) {
    // Merge with existing chats, preserving folder assignments
    const existingChatMap = new Map(this.chats.map((chat) => [chat.id, chat]))

    this.chats = chats.map((chat) => {
      const existing = existingChatMap.get(chat.id)
      return existing ? { ...chat, folderId: existing.folderId } : chat
    })

    await this.saveData()
    this.render()
    this.updateStats()
  }
}

// Initialize the organizer when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  window.organizer = new ChatGPTOrganizer()
})

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHATS_UPDATED" && window.organizer) {
    window.organizer.updateChatsFromPage(message.chats)
  }
})
