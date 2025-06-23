// Enhanced storage management with better error handling
class FolderStorage {
  constructor() {
    this.STORAGE_KEYS = {
      FOLDERS: "chatgpt_folders_v2",
      CHAT_MAPPINGS: "chatgpt_chat_mappings_v2",
      SETTINGS: "chatgpt_folder_settings_v2",
    }
    this.cache = {
      folders: null,
      mappings: null,
      lastUpdate: 0,
    }
    this.CACHE_DURATION = 5000 // 5 seconds
  }

  // Initialize with better error handling
  async init() {
    try {
      const folders = await this.getFolders()
      if (!folders || folders.length === 0) {
        await this.setFolders([
          {
            id: "default",
            name: "General",
            color: "#10a37f",
            createdAt: Date.now(),
            isDefault: true,
          },
        ])
      }
      console.log("Folder storage initialized successfully")
    } catch (error) {
      console.error("Failed to initialize folder storage:", error)
      // Fallback to basic functionality
      this.cache.folders = [
        { id: "default", name: "General", color: "#10a37f", createdAt: Date.now(), isDefault: true },
      ]
    }
  }

  // Enhanced folder operations with caching
  async getFolders() {
    try {
      // Check cache first
      if (this.cache.folders && Date.now() - this.cache.lastUpdate < this.CACHE_DURATION) {
        return this.cache.folders
      }

      const result = await chrome.storage.local.get(this.STORAGE_KEYS.FOLDERS)
      const folders = result[this.STORAGE_KEYS.FOLDERS] || []

      // Update cache
      this.cache.folders = folders
      this.cache.lastUpdate = Date.now()

      return folders
    } catch (error) {
      console.error("Error getting folders:", error)
      return this.cache.folders || []
    }
  }

  async setFolders(folders) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.FOLDERS]: folders,
      })

      // Update cache
      this.cache.folders = folders
      this.cache.lastUpdate = Date.now()

      return true
    } catch (error) {
      console.error("Error setting folders:", error)
      return false
    }
  }

  async createFolder(name, color = "#10a37f") {
    try {
      const folders = await this.getFolders()

      // Check for duplicate names
      if (folders.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("Folder with this name already exists")
      }

      const newFolder = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: name.trim(),
        color,
        createdAt: Date.now(),
        isDefault: false,
      }

      folders.push(newFolder)
      await this.setFolders(folders)
      return newFolder
    } catch (error) {
      console.error("Error creating folder:", error)
      throw error
    }
  }

  async updateFolder(folderId, updates) {
    try {
      const folders = await this.getFolders()
      const folderIndex = folders.findIndex((f) => f.id === folderId)

      if (folderIndex === -1) {
        throw new Error("Folder not found")
      }

      // Prevent updating default folder name
      if (folders[folderIndex].isDefault && updates.name) {
        throw new Error("Cannot rename default folder")
      }

      folders[folderIndex] = {
        ...folders[folderIndex],
        ...updates,
        updatedAt: Date.now(),
      }

      await this.setFolders(folders)
      return folders[folderIndex]
    } catch (error) {
      console.error("Error updating folder:", error)
      throw error
    }
  }

  async deleteFolder(folderId) {
    try {
      const folders = await this.getFolders()
      const folder = folders.find((f) => f.id === folderId)

      if (!folder) {
        throw new Error("Folder not found")
      }

      if (folder.isDefault) {
        throw new Error("Cannot delete default folder")
      }

      const filteredFolders = folders.filter((f) => f.id !== folderId)
      await this.setFolders(filteredFolders)

      // Move chats from deleted folder to default
      const mappings = await this.getChatMappings()
      let updated = false

      Object.keys(mappings).forEach((chatId) => {
        if (mappings[chatId] === folderId) {
          mappings[chatId] = "default"
          updated = true
        }
      })

      if (updated) {
        await this.setChatMappings(mappings)
      }

      return true
    } catch (error) {
      console.error("Error deleting folder:", error)
      throw error
    }
  }

  // Enhanced chat mapping operations
  async getChatMappings() {
    try {
      // Check cache first
      if (this.cache.mappings && Date.now() - this.cache.lastUpdate < this.CACHE_DURATION) {
        return this.cache.mappings
      }

      const result = await chrome.storage.local.get(this.STORAGE_KEYS.CHAT_MAPPINGS)
      const mappings = result[this.STORAGE_KEYS.CHAT_MAPPINGS] || {}

      // Update cache
      this.cache.mappings = mappings

      return mappings
    } catch (error) {
      console.error("Error getting chat mappings:", error)
      return this.cache.mappings || {}
    }
  }

  async setChatMappings(mappings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CHAT_MAPPINGS]: mappings,
      })

      // Update cache
      this.cache.mappings = mappings

      return true
    } catch (error) {
      console.error("Error setting chat mappings:", error)
      return false
    }
  }

  async assignChatToFolder(chatId, folderId) {
    try {
      if (!chatId || !folderId) {
        throw new Error("Invalid chat ID or folder ID")
      }

      // Verify folder exists
      const folders = await this.getFolders()
      if (!folders.some((f) => f.id === folderId)) {
        throw new Error("Target folder does not exist")
      }

      const mappings = await this.getChatMappings()
      mappings[chatId] = folderId
      await this.setChatMappings(mappings)

      return true
    } catch (error) {
      console.error("Error assigning chat to folder:", error)
      throw error
    }
  }

  async getChatFolder(chatId) {
    try {
      const mappings = await this.getChatMappings()
      return mappings[chatId] || "default"
    } catch (error) {
      console.error("Error getting chat folder:", error)
      return "default"
    }
  }

  async getChatsInFolder(folderId) {
    try {
      const mappings = await this.getChatMappings()
      return Object.keys(mappings).filter((chatId) => mappings[chatId] === folderId)
    } catch (error) {
      console.error("Error getting chats in folder:", error)
      return []
    }
  }

  // Utility methods
  async exportData() {
    try {
      const folders = await this.getFolders()
      const mappings = await this.getChatMappings()

      return {
        folders,
        mappings,
        exportDate: new Date().toISOString(),
        version: "2.0.0",
      }
    } catch (error) {
      console.error("Error exporting data:", error)
      throw error
    }
  }

  async importData(data) {
    try {
      if (!data || !data.folders || !data.mappings) {
        throw new Error("Invalid import data format")
      }

      await this.setFolders(data.folders)
      await this.setChatMappings(data.mappings)

      return true
    } catch (error) {
      console.error("Error importing data:", error)
      throw error
    }
  }

  // Clear cache when needed
  clearCache() {
    this.cache = {
      folders: null,
      mappings: null,
      lastUpdate: 0,
    }
  }
}

// Global storage instance
window.folderStorage = new FolderStorage()
