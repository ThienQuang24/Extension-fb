// Message types for communication between popup, content script, and background
export type MessageType =
    | 'START_SEARCH'
    | 'STOP_SEARCH'
    | 'COLLECT_POSTS'
    | 'GET_POST_DETAIL'
    | 'SYNC_FANPAGES'
    | 'PUBLISH_POST'
    | 'NAVIGATE_TO'
    | 'SEARCH_PROGRESS'
    | 'SEARCH_COMPLETE'
    | 'POST_COLLECTED'
    | 'FANPAGES_SYNCED'
    | 'PUBLISH_FAILED'
    | 'PING'
    | 'FETCH_IMAGE'
    | 'GET_PUBLISH_STATUS'
    | 'GET_SEARCH_STATUS'
    | 'SYNC_GROUPS'
    | 'GROUPS_SYNCED'
    | 'SYNC_FANPAGE_GROUPS'
    | 'SYNC_GROUPS_AS_ACTOR'
    | 'PUBLISH_FANPAGE_API'
    | 'FB_LEARNED_TEMPLATE'

export interface Message<T = any> {
    type: MessageType
    data?: T
    tabId?: number
}

export interface MessageResponse<T = any> {
    success: boolean
    data?: T
    error?: string
}

// Send message to background
export async function sendToBackground<T = any>(
    message: Message
): Promise<MessageResponse<T>> {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            resolve(response || { success: false, error: 'No response' })
        })
    })
}

// Send message to content script
export async function sendToContentScript<T = any>(
    tabId: number,
    message: Message
): Promise<MessageResponse<T>> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            resolve(response || { success: false, error: 'No response' })
        })
    })
}

// Send message to popup (from background)
export function sendToPopup(message: Message): void {
    chrome.runtime.sendMessage(message)
}

// Listen for messages
export function onMessage(
    callback: (
        message: Message,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void
    ) => void | boolean | Promise<void>
): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const result = callback(message, sender, sendResponse)
        if (result === true) return true
        return false
    })
}
