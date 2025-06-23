// Storage management for folders and chat mappings
class FolderStorage {
  constructor() {
    this.STORAGE_KEYS = {
      FOLDERS: "chatgpt_folders",
      CHAT_MAPPINGS: "chatgpt_chat_mappings",
      SETTINGS: "chatgpt_folder_settings",
    }
  }

  // Initialize default data
  async init() {
    const folders = await this.getFolders()
    if (!folders || folders.length === 0) {
      await this.setFolders([{ id: "default", name: "General", color: "#10a37f", createdAt: Date.now() }])
    }
  }

  // Folder operations
  async getFolders() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.FOLDERS)
      return result[this.STORAGE_KEYS.FOLDERS] || []
    } catch (error) {
      console.error("Error getting folders:", error)
      return []
    }
  }

  async setFolders(folders) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.FOLDERS]: folders,
      })
      return true
    } catch (error) {
      console.error("Error setting folders:", error)
      return false
    }
  }

  async createFolder(name, color = "#10a37f") {
    const folders = await this.getFolders()
    const newFolder = {
      id: Date.now().toString(),
      name,
      color,
      createdAt: Date.now(),
    }
    folders.push(newFolder)
    await this.setFolders(folders)
    return newFolder
  }

  async updateFolder(folderId, updates) {
    const folders = await this.getFolders()
    const folderIndex = folders.findIndex((f) => f.id === folderId)
    if (folderIndex !== -1) {
      folders[folderIndex] = { ...folders[folderIndex], ...updates }
      await this.setFolders(folders)
      return folders[folderIndex]
    }
    return null
  }

  async deleteFolder(folderId) {
    const folders = await this.getFolders()
    const filteredFolders = folders.filter((f) => f.id !== folderId)
    await this.setFolders(filteredFolders)

    // Move chats from deleted folder to default
    const mappings = await this.getChatMappings()
    Object.keys(mappings).forEach((chatId) => {
      if (mappings[chatId] === folderId) {
        mappings[chatId] = "default"
      }
    })
    await this.setChatMappings(mappings)
  }

  // Chat mapping operations
  async getChatMappings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.CHAT_MAPPINGS)
      return result[this.STORAGE_KEYS.CHAT_MAPPINGS] || {}
    } catch (error) {
      console.error("Error getting chat mappings:", error)
      return {}
    }
  }

  async setChatMappings(mappings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CHAT_MAPPINGS]: mappings,
      })
      return true
    } catch (error) {
      console.error("Error setting chat mappings:", error)
      return false
    }
  }

  async assignChatToFolder(chatId, folderId) {
    const mappings = await this.getChatMappings()
    mappings[chatId] = folderId
    await this.setChatMappings(mappings)
  }

  async getChatFolder(chatId) {
    const mappings = await this.getChatMappings()
    return mappings[chatId] || "default"
  }

  async getChatsInFolder(folderId) {
    const mappings = await this.getChatMappings()
    return Object.keys(mappings).filter((chatId) => mappings[chatId] === folderId)
  }
}

// Global storage instance
window.folderStorage = new FolderStorage()
