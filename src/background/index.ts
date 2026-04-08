// Background Service Worker
import { db } from '@/db/schema'
import { onMessage, sendToContentScript, MessageResponse } from '@/utils/message-bridge'

console.log('Facebook Auto Manager: Background service worker loaded')

// State management for persistence across navigations
interface ActionState {
    type: 'SEARCH' | 'SYNC' | 'IDLE'
    data?: any
    tabId?: number
    groupQueue?: string[] // For GROUP mode
    currentGroupIndex?: number
    matrixQueue?: Array<{ keyword: string, groupUrl?: string, isGeneral: boolean }> // For MATRIX mode
    currentMatrixIndex?: number
}

let currentState: ActionState = { type: 'IDLE' }
const publishingLocks = new Set<number>() // Lock by Post ID

// Initialize database
db.open().catch(err => {
    console.error('Failed to open database:', err)
})

// Listen for tab updates to resume actions
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (
        changeInfo.status === 'complete' &&
        tabId === currentState.tabId &&
        currentState.type !== 'IDLE'
    ) {
        console.log(`Tab ${tabId} updated. Resuming action: ${currentState.type}`)

        // Wait a bit for content script to be ready
        setTimeout(async () => {
            if (currentState.type === 'SEARCH') {
                await sendToContentScript(tabId, {
                    type: 'START_SEARCH',
                    data: currentState.data
                })
            } else if (currentState.type === 'SYNC') {
                await sendToContentScript(tabId, {
                    type: 'SYNC_FANPAGES'
                })
            }
        }, 3000)
    }
})

// Listen for messages from popup and content scripts
onMessage((message, sender, sendResponse) => {
    console.log('Background received message:', message.type)

    const handleAsync = async () => {
        let response: MessageResponse
        try {
            switch (message.type) {
                case 'GET_SEARCH_STATUS':
                    response = {
                        success: true,
                        data: {
                            isSearching: currentState.type === 'SEARCH',
                            mode: currentState.data?.mode,
                            currentIndex: currentState.currentGroupIndex || currentState.currentMatrixIndex || 0,
                            totalCount: currentState.groupQueue?.length || currentState.matrixQueue?.length || 0
                        }
                    }
                    break
                case 'START_SEARCH':
                    response = await handleStartSearch(message.data, sender.tab?.id)
                    break

                case 'STOP_SEARCH':
                    response = await handleStopSearch(sender.tab?.id)
                    break

                case 'SEARCH_PROGRESS':
                    // Forward progress to popup
                    chrome.runtime.sendMessage(message)
                    response = { success: true }
                    break

                case 'POST_COLLECTED':
                    response = await handlePostCollected(message.data)
                    break

                case 'SYNC_FANPAGES':
                    response = await handleSyncFanpages(sender.tab?.id)
                    break

                case 'FANPAGES_SYNCED':
                    response = await handleFanpagesSynced(message.data)
                    break

                case 'PUBLISH_POST':
                    response = await handlePublishPost(message.data, sender.tab?.id)
                    break

                case 'FETCH_IMAGE':
                    response = await handleFetchImage(message.data.url)
                    break

                default:
                    response = {
                        success: false,
                        error: `Unknown message type: ${message.type}`
                    }
            }
        } catch (err) {
            response = {
                success: false,
                error: err instanceof Error ? err.message : 'Async error in background script'
            }
        }

        sendResponse(response)
    }

    handleAsync()
    return true // Critical for async sendResponse
})

async function handleFetchImage(url: string): Promise<MessageResponse> {
    try {
        const res = await fetch(url)
        const blob = await res.blob()

        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                resolve({
                    success: true,
                    data: { base64: reader.result }
                })
            }
            reader.onerror = () => {
                resolve({
                    success: false,
                    error: 'Failed to convert image to base64'
                })
            }
            reader.readAsDataURL(blob)
        })
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch image'
        }
    }
}

// Helper to get a valid Facebook tab and ensure it's ready
async function getFacebookTab(createIfMissing = true): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' })

    // Find a tab that is NOT the extension popup/dashboard
    const fbTab = tabs.find(t => t.url && !t.url.startsWith('chrome-extension'))

    if (fbTab?.id) {
        // Check if content script is alive
        const ping = await pingTab(fbTab.id)
        if (ping.isAlive) {
            console.log('Found active Facebook tab:', fbTab.id)
            return fbTab.id
        }

        // If not alive, reload it
        console.log('Facebook tab found but not responding. Reloading...', fbTab.id)
        await chrome.tabs.reload(fbTab.id)
        // Wait for reload (content script to load)
        const result = await waitForTabReady(fbTab.id)
        return result.ready ? fbTab.id : undefined
    }

    if (createIfMissing) {
        console.log('No Facebook tab found. Creating new one...')
        const tab = await chrome.tabs.create({ url: 'https://www.facebook.com', active: false })
        if (tab.id) {
            const result = await waitForTabReady(tab.id)
            return result.ready ? tab.id : undefined
        }
    }

    return undefined
}

// Wait for tab to be ready (ping successful AND fresh page if oldId provided)
async function waitForTabReady(tabId: number, timeoutMs = 20000, oldPageLoadId?: string): Promise<{ ready: boolean, pageLoadId?: string }> {
    const startTime = Date.now()
    let attemptCount = 0

    console.log(`⏳ Waiting for tab ${tabId} to be ready... (Old ID: ${oldPageLoadId || 'none'})`)

    while (Date.now() - startTime < timeoutMs) {
        attemptCount++
        const { isAlive, pageLoadId } = await pingTab(tabId)

        if (isAlive) {
            // If we are waiting for a NEW page, check if ID changed
            if (oldPageLoadId && pageLoadId === oldPageLoadId) {
                console.log(`⏳ Ping ${attemptCount} success but ID is still ${pageLoadId} (Old page). Waiting...`)
            } else {
                console.log(`✅ Tab ${tabId} is ready after ${attemptCount} attempts. New ID: ${pageLoadId}`)
                return { ready: true, pageLoadId }
            }
        } else {
            console.log(`❌ Ping ${attemptCount} failed for tab ${tabId}`)
        }

        // Wait 1s before next ping
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    console.error(`⏰ TIMEOUT: Tab ${tabId} did not become ready or refresh IDs within ${timeoutMs}ms`)
    return { ready: false }
}

// Ping a tab to see if content script is listening
async function pingTab(tabId: number): Promise<{ isAlive: boolean, pageLoadId?: string }> {
    try {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log(`🔇 Ping failed for tab ${tabId}: ${chrome.runtime.lastError.message}`)
                    resolve({ isAlive: false })
                } else if (!response) {
                    console.log(`🔇 Ping failed for tab ${tabId}: No response`)
                    resolve({ isAlive: false })
                } else {
                    console.log(`🟢 Ping success for tab ${tabId}, pageLoadId: ${response.data?.pageLoadId}`)
                    resolve({ isAlive: true, pageLoadId: response.data?.pageLoadId })
                }
            })
        })
    } catch (e) {
        console.error(`❗ Ping error for tab ${tabId}:`, e)
        return { isAlive: false }
    }
}

async function handleStartSearch(data: any, senderTabId?: number): Promise<MessageResponse> {
    try {
        const tabId = await getFacebookTab()
        if (!tabId) {
            return { success: false, error: 'Could not find or create Facebook tab' }
        }

        // Handle MATRIX mode
        if (data.mode === 'MATRIX' && data.keywords && data.keywords.length > 0 && data.groupUrls && data.groupUrls.length > 0) {
            console.log(`🎯 [MATRIX SEARCH] Creating search matrix: ${data.keywords.length} keywords × ${data.groupUrls.length} groups`)

            // Generate matrix queue: keywords × (general search + each group)
            const matrixQueue: Array<{ keyword: string, groupUrl?: string, isGeneral: boolean }> = []

            for (const keyword of data.keywords) {
                // Add general search for this keyword if enabled
                if (data.includeGeneralSearch) {
                    matrixQueue.push({
                        keyword: keyword,
                        groupUrl: undefined,
                        isGeneral: true
                    })
                }

                // Add keyword search in each group
                for (const groupUrl of data.groupUrls) {
                    matrixQueue.push({
                        keyword: keyword,
                        groupUrl: groupUrl,
                        isGeneral: false
                    })
                }
            }

            console.log(`🎯 [MATRIX SEARCH] Generated ${matrixQueue.length} searches`)

            // Set state with matrix queue
            currentState = {
                type: 'SEARCH',
                data: data,
                tabId: tabId,
                matrixQueue: matrixQueue,
                currentMatrixIndex: 0
            }

            // Activate tab
            await chrome.tabs.update(tabId, { active: true })

            // Start processing first search
            await processNextMatrixSearch(tabId)

            return { success: true }
        }

        // Handle GROUP mode differently
        if (data.mode === 'GROUP' && data.groupUrls && data.groupUrls.length > 0) {
            console.log(`🚀 [GROUP SEARCH] Starting queue with ${data.groupUrls.length} groups`)

            // Set state with group queue
            currentState = {
                type: 'SEARCH',
                data: data,
                tabId: tabId,
                groupQueue: data.groupUrls,
                currentGroupIndex: 0
            }

            // Activate tab
            await chrome.tabs.update(tabId, { active: true })

            // Start processing first group
            await processNextGroup(tabId)

            return { success: true }
        } else {
            // KEYWORD mode (legacy)
            currentState = {
                type: 'SEARCH',
                data: data,
                tabId: tabId
            }

            // ALWAYS update tab URL to ensure content script starts on fresh search results
            if (data.keyword) {
                console.log(`🚀 [SEARCH] Navigating tab ${tabId} to search for: ${data.keyword}`)
                const currentPing = await pingTab(tabId)
                const targetUrl = `https://www.facebook.com/search/posts?q=${encodeURIComponent(data.keyword)}`
                await chrome.tabs.update(tabId, { url: targetUrl, active: true })
                await waitForTabReady(tabId, 20000, currentPing.pageLoadId)
            } else {
                await chrome.tabs.update(tabId, { active: true })
            }

            const response = await sendToContentScript(tabId, {
                type: 'START_SEARCH',
                data
            })

            return response
        }
    } catch (error) {
        currentState = { type: 'IDLE' }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

async function processNextGroup(tabId: number): Promise<void> {
    if (!currentState.groupQueue || currentState.currentGroupIndex === undefined) {
        console.log('❌ [GROUP SEARCH] Invalid state')
        currentState = { type: 'IDLE' }
        return
    }

    const currentIndex = currentState.currentGroupIndex
    const groupUrl = currentState.groupQueue[currentIndex]

    if (!groupUrl) {
        console.log('✅ [GROUP SEARCH] All groups processed!')
        currentState = { type: 'IDLE' }
        return
    }

    console.log(`📍 [GROUP SEARCH] Processing group ${currentIndex + 1}/${currentState.groupQueue.length}: ${groupUrl}`)

    // Get current page load ID to wait for new page
    const currentPing = await pingTab(tabId)
    
    // Navigate to group
    await chrome.tabs.update(tabId, { url: groupUrl })

    // Wait for page to load
    await waitForTabReady(tabId, 20000, currentPing.pageLoadId)

    // Start scraping this group
    const response = await sendToContentScript(tabId, {
        type: 'START_SEARCH',
        data: {
            keyword: '', // No keyword for group mode
            maxPosts: currentState.data.maxPosts || 5000,
            mode: 'GROUP',
            groupUrl: groupUrl
        }
    })

    if (!response.success) {
        console.error(`❌ [GROUP SEARCH] Failed to start scraping group: ${response.error}`)
    }

    // The scraper will run until user stops or completes
    // We listen for STOP_SEARCH or completion signals
}

async function processNextMatrixSearch(tabId: number): Promise<void> {
    if (!currentState.matrixQueue || currentState.currentMatrixIndex === undefined) {
        console.log('❌ [MATRIX SEARCH] Invalid state')
        currentState = { type: 'IDLE' }
        return
    }

    const currentIndex = currentState.currentMatrixIndex
    const searchItem = currentState.matrixQueue[currentIndex]

    if (!searchItem) {
        console.log('✅ [MATRIX SEARCH] All searches completed!')
        currentState = { type: 'IDLE' }
        return
    }

    console.log(`🎯 [MATRIX SEARCH] Search ${currentIndex + 1}/${currentState.matrixQueue.length}: "${searchItem.keyword}" ${searchItem.isGeneral ? '(general)' : 'in group'}`)

    // Navigate to appropriate page
    let targetUrl: string
    if (searchItem.isGeneral) {
        // General Facebook search
        targetUrl = `https://www.facebook.com/search/posts?q=${encodeURIComponent(searchItem.keyword)}`
    } else {
        // Group search - navigate to group first
        targetUrl = searchItem.groupUrl!
    }

    // Get current page load ID to wait for new page
    const currentPing = await pingTab(tabId)

    await chrome.tabs.update(tabId, { url: targetUrl })

    // Wait for page to load
    await waitForTabReady(tabId, 20000, currentPing.pageLoadId)

    // Start scraping with the keyword
    const response = await sendToContentScript(tabId, {
        type: 'START_SEARCH',
        data: {
            keyword: searchItem.keyword,
            maxPosts: currentState.data.maxPosts || 5000,
            mode: searchItem.isGeneral ? 'KEYWORD' : 'MATRIX_GROUP',
            groupUrl: searchItem.groupUrl,
            isGeneralSearch: searchItem.isGeneral
        }
    })

    if (!response.success) {
        console.error(`❌ [MATRIX SEARCH] Failed to start search: ${response.error}`)
    }

    // The scraper will run until user stops or completes
    // We listen for STOP_SEARCH or SEARCH_COMPLETE signals
}

// Listen for scraper completion to move to next group
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SEARCH_COMPLETE' && currentState.type === 'SEARCH') {
        // Handle GROUP queue
        if (currentState.groupQueue) {
            console.log('🏁 [GROUP SEARCH] Current group finished, moving to next...')

            // Move to next group
            currentState.currentGroupIndex = (currentState.currentGroupIndex || 0) + 1

            if (currentState.tabId) {
                // Check if we have more groups
                if (currentState.currentGroupIndex >= currentState.groupQueue.length) {
                    console.log('✅ [GROUP SEARCH] All groups completed!')
                    currentState = { type: 'IDLE' }

                    // Notify popup that search is complete
                    chrome.runtime.sendMessage({ type: 'SEARCH_COMPLETE' })
                } else {
                    // Process next group
                    processNextGroup(currentState.tabId).catch(err => {
                        console.error('Error processing next group:', err)
                        currentState = { type: 'IDLE' }
                        chrome.runtime.sendMessage({ type: 'SEARCH_COMPLETE' })
                    })
                }
            }
        }

        // Handle MATRIX queue
        if (currentState.matrixQueue) {
            console.log('🏁 [MATRIX SEARCH] Current search finished, moving to next...')

            // Move to next search
            currentState.currentMatrixIndex = (currentState.currentMatrixIndex || 0) + 1

            if (currentState.tabId) {
                // Check if we have more searches
                if (currentState.currentMatrixIndex >= currentState.matrixQueue.length) {
                    console.log('✅ [MATRIX SEARCH] All searches completed!')
                    currentState = { type: 'IDLE' }

                    // Notify popup that search is complete
                    chrome.runtime.sendMessage({ type: 'SEARCH_COMPLETE' })
                } else {
                    // Process next search
                    processNextMatrixSearch(currentState.tabId).catch(err => {
                        console.error('Error processing next matrix search:', err)
                        currentState = { type: 'IDLE' }
                        chrome.runtime.sendMessage({ type: 'SEARCH_COMPLETE' })
                    })
                }
            }
        }
    }
})

async function handleStopSearch(senderTabId?: number): Promise<MessageResponse> {
    console.log('⏹️ [SEARCH] Stop requested')
    currentState = { type: 'IDLE' }

    // Notify popup that search stopped
    chrome.runtime.sendMessage({ type: 'SEARCH_STOPPED' })

    const tabId = await getFacebookTab(false)
    if (!tabId) {
        return { success: false, error: 'No active Facebook tab' }
    }

    return sendToContentScript(tabId, { type: 'STOP_SEARCH' })
}

async function handlePostCollected(posts: any[]): Promise<MessageResponse> {
    try {
        const STORAGE_LIMIT = 5000
        const processedPosts: any[] = []

        for (const post of posts) {
            // Check if UID already exists (includes deleted posts)
            const existingUID = await db.postUIDs
                .where('fbPostId')
                .equals(post.fbPostId)
                .first()

            if (existingUID) {
                console.log(`⏭️ [STORAGE] Skipping duplicate post UID: ${post.fbPostId} (already in database or previously crawled)`)
                continue // Skip duplicate
            }

            // Track UID forever
            await db.postUIDs.add({
                fbPostId: post.fbPostId,
                crawledAt: new Date()
            })

            console.log(`💾 [STORAGE] Saving new post: ${post.fbPostId} by ${post.authorName}`)
            processedPosts.push(post)
        }

        if (processedPosts.length === 0) {
            return {
                success: true,
                data: { count: 0, message: 'No new posts (all duplicates)' }
            }
        }

        // Save new posts to database
        await db.posts.bulkAdd(processedPosts)

        // Enforce storage limit
        const totalPosts = await db.posts.count()
        if (totalPosts > STORAGE_LIMIT) {
            const excess = totalPosts - STORAGE_LIMIT

            // Get oldest posts (by crawledAt)
            const oldestPosts = await db.posts
                .orderBy('crawledAt')
                .limit(excess)
                .toArray()

            // Delete old posts (but UIDs remain in postUIDs table)
            const oldIds = oldestPosts.map(p => p.id!)
            await db.posts.bulkDelete(oldIds)

            console.log(`Storage limit enforced: Deleted ${excess} oldest posts (keeping UIDs)`)
        }

        return {
            success: true,
            data: {
                count: processedPosts.length,
                totalStored: await db.posts.count()
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save posts'
        }
    }
}

async function handleSyncFanpages(senderTabId?: number): Promise<MessageResponse> {
    const tabId = await getFacebookTab()
    if (!tabId) {
        return { success: false, error: 'Could not find or create Facebook tab' }
    }

    // Set state
    currentState = {
        type: 'SYNC',
        tabId: tabId
    }

    // Get data from content script
    const response = await sendToContentScript(tabId, { type: 'SYNC_FANPAGES' })

    // If success, save to DB
    if (response.success && Array.isArray(response.data)) {
        console.log(`Received ${response.data.length} fanpages from content script. Saving to DB...`)
        const saveResult = await handleFanpagesSynced(response.data)
        if (!saveResult.success) {
            console.error('Failed to save fanpages:', saveResult.error)
            return saveResult
        }
        console.log('Fanpages saved successfully.')
    }

    return response
}

async function handleFanpagesSynced(fanpages: any[]): Promise<MessageResponse> {
    // Sync complete, clear state
    currentState = { type: 'IDLE' }

    try {
        // Save fanpages to database
        for (const fanpage of fanpages) {
            // Check if fanpage already exists
            const existing = await db.fanpages
                .where('fbPageId')
                .equals(fanpage.fbPageId)
                .first()

            if (existing) {
                // Update
                await db.fanpages.update(existing.id!, {
                    name: fanpage.name,
                    url: fanpage.url,
                    syncedAt: new Date()
                })
            } else {
                // Insert
                await db.fanpages.add(fanpage)
            }
        }

        return {
            success: true,
            data: { count: fanpages.length }
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save fanpages'
        }
    }
}

async function handlePublishPost(data: any, senderTabId?: number): Promise<MessageResponse> {
    if (publishingLocks.has(data.postId)) {
        console.warn(`⚠️ [PUBLISH] Post ${data.postId} is already being published. Blocking duplicate request.`)
        return { success: false, error: 'Publishing already in progress' }
    }

    publishingLocks.add(data.postId)
    console.log('📤 [PUBLISH] Starting polling process for:', data)

    const tabId = await getFacebookTab()
    if (!tabId) {
        console.error('❌ [PUBLISH] Could not find or create Facebook tab')
        publishingLocks.delete(data.postId)
        return { success: false, error: 'Could not find or create Facebook tab' }
    }

    currentState = { type: 'IDLE' }

    try {
        // Get post/fanpage data
        const post = await db.posts.get(data.postId)
        const fanpage = await db.fanpages.get(data.fanpageId)

        if (!post || !fanpage) {
            publishingLocks.delete(data.postId)
            return { success: false, error: 'Post or fanpage not found' }
        }

        // 1. Send START command (Fire and Forget)
        console.log(`🚀 [PUBLISH] Sending Start Signal to tab ${tabId}...`)
        const startResponse = await sendToContentScript(tabId, {
            type: 'PUBLISH_POST',
            data: {
                post,
                fanpageUrl: fanpage.url,
                fbPageId: fanpage.fbPageId
            }
        })

        if (!startResponse.success) {
            console.error('❌ [PUBLISH] Start signal failed:', startResponse.error)
            publishingLocks.delete(data.postId)
            return startResponse
        }

        // 2. Start Polling Loop
        console.log('⏳ [PUBLISH] Process started. Entering polling loop...')
        const POLLING_INTERVAL = 2000
        const MAX_POLLING_TIME = 90000 // 90 seconds timeout
        const startTime = Date.now()
        let currentPageLoadId: string | undefined

        // Get initial page ID for reload detection
        const initialPing = await pingTab(tabId)
        currentPageLoadId = initialPing.pageLoadId

        while (Date.now() - startTime < MAX_POLLING_TIME) {
            await new Promise(r => setTimeout(r, POLLING_INTERVAL))

            // Check if tab is alive/reloaded
            const ping = await pingTab(tabId)

            // If page reloaded (ID changed), wait for it to be ready
            if (ping.isAlive && ping.pageLoadId !== currentPageLoadId) {
                console.log('🔄 [PUBLISH] Page reload detected during polling. Waiting for readiness...')
                const readyState = await waitForTabReady(tabId, 20000, currentPageLoadId)
                if (readyState.ready) {
                    currentPageLoadId = readyState.pageLoadId
                    console.log('✅ [PUBLISH] Tab reloaded and ready. Resuming poll...')
                    // Note: Ideally, we should re-send commands if state was lost, 
                    // but for now we assume content script might have persisted state or failed.
                    // The content script persistence logic handles this via sessionStorage.
                }
            }

            // Ask for status
            const statusResponse = await sendToContentScript(tabId, { type: 'GET_PUBLISH_STATUS' })

            if (statusResponse.success && statusResponse.data) {
                const status = statusResponse.data
                console.log(`📋 [PUBLISH] Poll Status: ${status.status}`)

                if (status.status === 'success') {
                    console.log('🎉 [PUBLISH] Success detected via polling!')

                    // Cleanup Function
                    await handlePublishSuccess(post, fanpage, status.data?.publishedUrl)
                    publishingLocks.delete(data.postId)
                    return { success: true, data: { publishedUrl: status.data?.publishedUrl } }
                }

                if (status.status === 'failed') {
                    console.error('❌ [PUBLISH] Failure detected via polling:', status.error)
                    publishingLocks.delete(data.postId)
                    return { success: false, error: status.error }
                }

                // If 'processing' or 'idle', continue loop
            } else {
                console.warn('⚠️ [PUBLISH] Poll request failed (content script might be busy/reloading)')
            }
        }

        publishingLocks.delete(data.postId)
        return { success: false, error: 'Publishing timed out (90s)' }

    } catch (error) {
        publishingLocks.delete(data.postId)
        console.error('💥 [PUBLISH] Exception in polling loop:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown polling error'
        }
    }
}

async function handlePublishSuccess(post: any, fanpage: any, publishedUrl?: string) {
    await db.posts.update(post.id!, {
        published: true,
        publishedAt: new Date()
    })

    await db.fanpages.update(fanpage.id!, {
        lastPostAt: new Date(),
        totalPosts: fanpage.totalPosts + 1
    })

    if (publishedUrl) {
        const schedule = await db.schedules
            .where('postId').equals(post.id!)
            .filter(s => s.fanpageId === fanpage.id! && s.status !== 'failed')
            .last()

        if (schedule) {
            await db.schedules.update(schedule.id!, {
                publishedUrl: publishedUrl
            })
        }
    }
}

// Global lock to prevent concurrent publishing
let isCurrentlyPublishing = false

// Handle scheduled posts via alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'check_scheduled_posts') {
        await checkScheduledPosts()
    }
})

// Check for scheduled posts every minute
chrome.alarms.create('check_scheduled_posts', {
    periodInMinutes: 1
})

async function checkScheduledPosts() {
    // Skip if already publishing
    if (isCurrentlyPublishing) {
        console.log('Already publishing a post, skipping this check cycle')
        return
    }

    try {
        const now = new Date()

        // Get pending schedules that are due, sorted by scheduled time (oldest first)
        const dueSchedules = await db.schedules
            .where('status')
            .equals('pending')
            .and(schedule => schedule.scheduledAt <= now)
            .sortBy('scheduledAt')

        if (dueSchedules.length === 0) {
            return
        }

        // Process ONLY the first due schedule
        const schedule = dueSchedules[0]

        console.log(`Publishing post ${schedule.postId} to fanpage ${schedule.fanpageId} (${dueSchedules.length - 1} more in queue)`)

        // Set global lock
        isCurrentlyPublishing = true

        // Update status to processing
        await db.schedules.update(schedule.id!, { status: 'processing' })

        // Publish post - Let handlePublishPost manage tab creation/readiness
        const response = await handlePublishPost({
            postId: schedule.postId,
            fanpageId: schedule.fanpageId
        })

        // Update schedule status
        if (response.success) {
            await db.schedules.update(schedule.id!, {
                status: 'success',
                publishedAt: new Date()
            })
            console.log(`✅ Post ${schedule.postId} published successfully`)
        } else {
            await db.schedules.update(schedule.id!, {
                status: 'failed',
                error: response.error
            })
            console.error(`❌ Post ${schedule.postId} failed:`, response.error)
        }
    } catch (error) {
        console.error('Error checking scheduled posts:', error)
    } finally {
        // Always clear lock, even if error occurred
        isCurrentlyPublishing = false
    }
}

// Initialize alarms on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed')
    chrome.alarms.create('check_scheduled_posts', {
        periodInMinutes: 1
    })
})
