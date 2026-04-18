// Content Script Entry Point
import { scraper } from './facebook-scraper'
import { fanpageDetector } from './fanpage-detector'
import { postPublisher } from './post-publisher'
import { FanpageService } from './fanpage-service'
import { onMessage, MessageResponse } from '@/utils/message-bridge'

// Export onExecute for CRXJS loader
export function onExecute() {
    console.log('Facebook Auto Manager: Content script loaded')

    // Listen for messages from popup/background
    onMessage((message, sender, sendResponse) => {
        console.log('Content script received message:', message.type)

        // Return true if we will send response asynchronously
        const handleAsync = async () => {
            let response: MessageResponse

            try {
                switch (message.type) {
                    case 'PING':
                        response = {
                            success: true,
                            data: { pageLoadId: postPublisher.pageLoadId }
                        }
                        break

                    case 'START_SEARCH':
                        response = await scraper.startSearch(message.data)
                        break

                    case 'STOP_SEARCH':
                        scraper.stopSearch()
                        response = { success: true }
                        break

                    case 'COLLECT_POSTS':
                        response = {
                            success: true,
                            data: scraper.getCurrentPosts()
                        }
                        break

                    case 'SYNC_FANPAGES':
                        response = await fanpageDetector.detectFanpages()
                        break
                    
                    case 'SYNC_GROUPS':
                        response = await scraper.syncJoinedGroups()
                        break

                    case 'SYNC_GROUPS_AS_ACTOR':
                        response = await scraper.syncJoinedGroups(message.data.actorId)
                        break

                    case 'PUBLISH_POST':
                        response = await postPublisher.startPublish(message.data)
                        break

                    case 'PUBLISH_FANPAGE_API':
                        response = await FanpageService.publishToPage(
                            message.data.actorId, 
                            message.data.content, 
                            message.data.imageUrls
                        )
                        break

                    case 'GET_PUBLISH_STATUS':
                        response = {
                            success: true,
                            data: postPublisher.getPublishStatus()
                        }
                        break

                    case 'NAVIGATE_TO':
                        window.location.href = message.data.url
                        response = { success: true }
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
                    error: err instanceof Error ? err.message : 'Async error in content script'
                }
            }

            sendResponse(response)
        }

        handleAsync()
        return true // Critical for async sendResponse
    })
}

// REMOVED duplicate onExecute() call for CRXJS loader compatibility
// The loader will call onExecute if defined, or the script will run if not.
onExecute()
