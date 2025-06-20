// Background script for ChatGPT Organizer
class ChatGPTOrganizerBackground {
  constructor() {
    this.init()
  }

  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === "install") {
        this.handleInstall()
      } else if (details.reason === "update") {
        this.handleUpdate(details.previousVersion)
      }
    })

    // Handle messages from content script and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse)
      return true // Keep message channel open for async responses
    })

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && this.isChatGPTUrl(tab.url)) {
        this.ensureContentScriptInjected(tabId)
      }
    })
  }

  async handleInstall() {
    // Initialize default data
    const defaultData = {
      folders: [],
      chats: [],
      darkMode: false,
      version: "1.0.0",
    }

    try {
      await chrome.storage.local.set(defaultData)
      console.log("ChatGPT Organizer installed successfully")
    } catch (error) {
      console.error("Error during installation:", error)
    }
  }

  async handleUpdate(previousVersion) {
    try {
      // Handle version-specific updates
      const result = await chrome.storage.local.get(["version"])
      const currentVersion = result.version || "1.0.0"

      if (this.compareVersions(currentVersion, "1.0.0") < 0) {
        // Migration logic for future versions
        await this.migrateToV1()
      }

      // Update version
      await chrome.storage.local.set({ version: "1.0.0" })
      console.log(`ChatGPT Organizer updated from ${previousVersion} to 1.0.0`)
    } catch (error) {
      console.error("Error during update:", error)
    }
  }

  async migrateToV1() {
    // Future migration logic
    console.log("Migrating to version 1.0.0")
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "GET_STORAGE_DATA":
        this.getStorageData(sendResponse)
        break
      case "SET_STORAGE_DATA":
        this.setStorageData(message.data, sendResponse)
        break
      case "SYNC_FOLDERS":
        this.syncFolders(message.folders, sendResponse)
        break
      default:
        sendResponse({ error: "Unknown message type" })
    }
  }

  async getStorageData(sendResponse) {
    try {
      const result = await chrome.storage.local.get(["folders", "chats", "darkMode"])
      sendResponse({ success: true, data: result })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  async setStorageData(data, sendResponse) {
    try {
      await chrome.storage.local.set(data)
      sendResponse({ success: true })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  async syncFolders(folders, sendResponse) {
    try {
      await chrome.storage.local.set({ folders })

      // Notify all ChatGPT tabs about the folder update
      const tabs = await chrome.tabs.query({
        url: ["https://chat.openai.com/*", "https://chatgpt.com/*"],
      })

      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "FOLDERS_UPDATED",
            folders: folders,
          })
        } catch (error) {
          // Tab might not have content script loaded
          console.log(`Could not send message to tab ${tab.id}:`, error.message)
        }
      }

      sendResponse({ success: true })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }

  isChatGPTUrl(url) {
    if (!url) return false
    return url.includes("chat.openai.com") || url.includes("chatgpt.com")
  }

  async ensureContentScriptInjected(tabId) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { type: "PING" })
    } catch (error) {
      // Content script not loaded, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"],
        })

        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ["content.css"],
        })
      } catch (injectionError) {
        console.error("Error injecting content script:", injectionError)
      }
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split(".").map(Number)
    const v2parts = version2.split(".").map(Number)

    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0
      const v2part = v2parts[i] || 0

      if (v1part < v2part) return -1
      if (v1part > v2part) return 1
    }

    return 0
  }
}

// Initialize background script
new ChatGPTOrganizerBackground()
