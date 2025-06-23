// Popup script for extension management
document.addEventListener("DOMContentLoaded", async () => {
  // Load stats
  await loadStats()

  // Add event listeners
  document.getElementById("open-manager").addEventListener("click", openManager)
  document.getElementById("open-panel").addEventListener("click", openPanel)
  document.getElementById("export-data").addEventListener("click", exportData)
})

async function loadStats() {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab.url.includes("chat.openai.com") && !tab.url.includes("chatgpt.com")) {
      document.querySelector(".stats").innerHTML =
        '<p style="text-align: center; color: #666;">Please navigate to ChatGPT to use this extension.</p>'
      return
    }

    // Execute script to get stats
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: getExtensionStats,
    })

    if (results && results[0] && results[0].result) {
      const stats = results[0].result
      document.getElementById("folder-count").textContent = stats.folderCount
      document.getElementById("chat-count").textContent = stats.chatCount
    }
  } catch (error) {
    console.error("Error loading stats:", error)
  }
}

function getExtensionStats() {
  // This function runs in the content script context
  return new Promise(async (resolve) => {
    if (window.folderStorage) {
      const folders = await window.folderStorage.getFolders()
      const mappings = await window.folderStorage.getChatMappings()

      resolve({
        folderCount: folders.length,
        chatCount: Object.keys(mappings).length,
      })
    } else {
      resolve({ folderCount: 0, chatCount: 0 })
    }
  })
}

async function openManager() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      if (window.folderUI) {
        window.folderUI.openFolderModal()
      }
    },
  })

  window.close()
}

async function openPanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: () => {
      if (window.folderUI) {
        window.folderUI.togglePanel()
      }
    },
  })

  window.close()
}

async function exportData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: exportExtensionData,
    })

    if (results && results[0] && results[0].result) {
      const data = results[0].result
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = `chatgpt-folders-${new Date().toISOString().split("T")[0]}.json`
      a.click()

      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error("Error exporting data:", error)
    alert("Error exporting data. Please try again.")
  }
}

function exportExtensionData() {
  return new Promise(async (resolve) => {
    if (window.folderStorage) {
      const folders = await window.folderStorage.getFolders()
      const mappings = await window.folderStorage.getChatMappings()

      resolve({
        folders,
        mappings,
        exportDate: new Date().toISOString(),
        version: "1.0.0",
      })
    } else {
      resolve(null)
    }
  })
}
