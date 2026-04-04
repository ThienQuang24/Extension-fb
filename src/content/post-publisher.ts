// Post Publisher - Tự động đăng bài lên fanpage
import { Post } from '@/db/schema'
import { MessageResponse } from '@/utils/message-bridge'
import { FACEBOOK_SELECTORS } from '@/config/facebook-selectors'

interface PublishConfig {
    post: Post
    fanpageUrl: string
    fbPageId: string
}

// Status types for Polling
export interface PublishStatus {
    status: 'idle' | 'processing' | 'success' | 'failed'
    data?: { publishedUrl?: string }
    error?: string
    timestamp: number
}

class PostPublisher {
    private isPublishing = false
    private static isGlobalLocked = false // Strict guard against parallel execution
    private publishTimeout: number | null = null
    public readonly pageLoadId = Math.random().toString(36).substring(2, 15)

    // Polling State
    private currentStatus: PublishStatus = { status: 'idle', timestamp: Date.now() }

    // Persistent state keys
    private readonly STATE_KEY = 'fb_publish_state'
    private readonly STEP_KEY = 'fb_publish_step'
    private readonly TARGET_ID_KEY = 'fb_publish_target_id'

    constructor() {
        this.checkResume()
    }

    // Resume logic for page reloads (Legacy/Backup)
    private checkResume() {
        const step = sessionStorage.getItem(this.STEP_KEY)
        if (step) {
            console.log(`🔄 [RESUME] Found existing step: ${step}`)
        }
    }

    // Getter for polling
    public getPublishStatus(): PublishStatus {
        return this.currentStatus
    }

    // New Non-blocking Start Method
    public async startPublish(config: PublishConfig): Promise<{ success: boolean, message: string }> {
        if (this.isPublishing || PostPublisher.isGlobalLocked) {
            return { success: false, message: 'Already publishing' }
        }

        this.isPublishing = true
        PostPublisher.isGlobalLocked = true
        this.currentStatus = { status: 'processing', timestamp: Date.now() }

        // Start async process WITHOUT awaiting it here (Fire and Forget)
        this.processPublish(config).catch(err => {
            console.error('Unhandled publish error:', err)
            this.currentStatus = {
                status: 'failed',
                error: err.message,
                timestamp: Date.now()
            }
            this.isPublishing = false
            PostPublisher.isGlobalLocked = false
        })

        return { success: true, message: 'Started' }
    }

    // Internal processing logic (Moved from publishPost)
    private async processPublish(config: PublishConfig): Promise<void> {
        // Auto-reset after 60 seconds (Increased for safety)
        this.publishTimeout = window.setTimeout(() => {
            console.warn('Publishing timeout - auto resetting flag')
            if (this.currentStatus.status === 'processing') {
                this.currentStatus = { status: 'failed', error: 'Timeout', timestamp: Date.now() }
            }
            this.isPublishing = false
            this.publishTimeout = null
            PostPublisher.isGlobalLocked = false
        }, 60000)

        try {
            // --- 100% SILENT API STRATEGY ---
            const tokens = await this.getFBTokens()
            if (tokens) {
                // Check if we should use Reels flow (if video exists)
                if (config.post.videos && config.post.videos.length > 0) {
                    console.log('📹 [PUBLISH] Video detected. Using Reels DOM flow.')
                    const reelsResult = await this.publishReels(config)
                    if (reelsResult.success) {
                        this.currentStatus = {
                            status: 'success',
                            data: { publishedUrl: reelsResult.publishedUrl },
                            timestamp: Date.now()
                        }
                    } else {
                        this.currentStatus = {
                            status: 'failed',
                            error: `Reels Error: ${reelsResult.error}`,
                            timestamp: Date.now()
                        }
                    }
                } else {
                    const apiResult = await this.publishViaGraphQL(config, tokens)
                    if (apiResult.success) {
                        console.log('✨ [PUBLISH] API Published successfully. Completely silent.')

                        this.currentStatus = {
                            status: 'success',
                            data: { publishedUrl: apiResult.publishedUrl },
                            timestamp: Date.now()
                        }
                    } else {
                        console.error(`❌ [PUBLISH] API Posting failed: ${apiResult.error}`)
                        this.currentStatus = {
                            status: 'failed',
                            error: `Facebook API: ${apiResult.error}`,
                            timestamp: Date.now()
                        }
                    }
                }
            } else {
                // --- TOKEN EXTRACTION FAILED ---

                // Let's keep the nav logic for safety
                const targetId = this.extractIdFromUrl(config.fanpageUrl)
                if (targetId) sessionStorage.setItem(this.TARGET_ID_KEY, targetId)

                if (!this.isTargetPage(config.fanpageUrl)) {
                    console.log(`🗺️ Navigating to: ${config.fanpageUrl}`)
                    window.location.href = config.fanpageUrl
                    // Status stays 'processing' until reload... 
                    return
                }

                this.currentStatus = {
                    status: 'failed',
                    error: 'Không tìm thấy Token bảo mật. Vui lòng F5 trang.',
                    timestamp: Date.now()
                }
            }
        } catch (error) {
            this.currentStatus = {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown Error',
                timestamp: Date.now()
            }
        } finally {
            this.isPublishing = false
            PostPublisher.isGlobalLocked = false
            if (this.publishTimeout) {
                clearTimeout(this.publishTimeout)
            }
            sessionStorage.removeItem(this.STEP_KEY)
        }
    }

    // Kept for API mode internal use
    private extractIdFromUrl(url: string): string | null {
        try {
            const urlObj = new URL(url)
            return urlObj.searchParams.get('id') || null
        } catch {
            const match = url.match(/[?&]id=(\d+)/) || url.match(/profile\.php\?id=(\d+)/)
            return match ? match[1] : null
        }
    }

    private getCurrentProfileId(): string | null {
        try {
            const scripts = document.querySelectorAll('script')
            for (const script of Array.from(scripts)) {
                const content = script.textContent || ''
                const m = content.match(/"actorID":"(\d+)"/) || content.match(/"pageID":"(\d+)"/)
                if (m) {
                    return m[1]
                }
            }
            const metaId = document.querySelector('meta[property="al:android:url"]')?.getAttribute('content')?.match(/page\/(\d+)/)?.[1]
            if (metaId) return metaId
        } catch (e) {
            console.warn('Error detecting current profile ID:', e)
        }
        return null
    }

    private isTargetPage(targetUrl: string): boolean {
        const currentUrl = window.location.href
        if (currentUrl.includes(targetUrl)) return true

        const targetId = this.extractIdFromUrl(targetUrl) || sessionStorage.getItem(this.TARGET_ID_KEY)
        const currentProfileId = this.getCurrentProfileId()

        if (targetId && currentProfileId && targetId === currentProfileId) {
            if (targetId) sessionStorage.setItem(this.TARGET_ID_KEY, targetId)
            return true
        }
        return false
    }

    private async getFBTokens(): Promise<{ fb_dtsg: string, actorId: string } | null> {
        try {
            let fb_dtsg = ''
            let actorId = ''

            const scripts = Array.from(document.querySelectorAll('script'))
            for (const script of scripts) {
                const content = script.textContent || ''

                // Try to find fb_dtsg (Matches FAP patterns)
                if (!fb_dtsg) {
                    const dtsgMatch = content.match(/\["DTSGInitialData",\[\],\{"token":"(.*?)"\}/) ||
                        content.match(/"token":"(.*?)"/) ||
                        content.match(/\["DTSGInitData",\[\],\{"token":"(.*?)"\}/) ||
                        content.match(/DTSGInitData",\[\],(\{.*?\})/)

                    if (dtsgMatch) {
                        if (dtsgMatch[1].startsWith('{')) {
                            try { fb_dtsg = JSON.parse(dtsgMatch[1]).token } catch (e) { }
                        } else {
                            fb_dtsg = dtsgMatch[1]
                        }
                    }
                }

                // Try to find actorID/UserID/AccountID
                if (!actorId) {
                    const actorMatch = content.match(/"actorID":"(\d+)"/) ||
                        content.match(/"USER_ID":"(\d+)"/) ||
                        content.match(/"ACCOUNT_ID":"(\d+)"/) ||
                        content.match(/"actor_id":"(\d+)"/)
                    if (actorMatch) actorId = actorMatch[1]
                }
            }

            // Fallback for fb_dtsg if not found in scripts
            if (!fb_dtsg) {
                const inputDtsg = document.querySelector('input[name="fb_dtsg"]') as HTMLInputElement
                if (inputDtsg) fb_dtsg = inputDtsg.value
            }

            if (fb_dtsg && actorId) {
                console.log(`🔑 [API] Found tokens: actorId=${actorId}`)
                return { fb_dtsg, actorId }
            }
        } catch (e) {
            console.error('❌ [API] Error extracting tokens:', e)
        }
        return null
    }

    private async publishViaGraphQL(config: PublishConfig, tokens: { fb_dtsg: string, actorId: string }): Promise<{ success: boolean, publishedUrl?: string, error?: string }> {
        try {
            console.log('🚀 [GraphQL] Starting API Publish...')

            // Generate robust Variables per recent successful analysis
            const doc_id = '26495084353424946' // Verified working ID
            const client_mutation_id = crypto.randomUUID()
            const source_data = {
                source: "NEWS_FEED" // Verified
            }

            // Construct Verified Payload
            const variables = {
                input: {
                    composer_entry_point: "inline_composer",
                    composer_source_surface: "newsfeed", // Verified
                    idempotence_token: client_mutation_id,
                    source: "feed_inline_composer",
                    attachments: [],
                    audience: {
                        privacy: {
                            base_state: "EVERYONE", // Public
                            tag_expansion_state: "UNSPECIFIED"
                        }
                    },
                    message: {
                        ranges: [],
                        text: config.post.content
                    },
                    with_tags_ids: [],
                    inline_activities: [],
                    explicit_place_id: "0",
                    text_format_preset_id: "0",
                    logging: {
                        composer_session_id: client_mutation_id
                    },
                    tracking: [
                        null
                    ],
                    actor_id: tokens.actorId,
                    client_mutation_id: client_mutation_id
                }
            }

            // Also support Page target ID if we are on a fanpage
            const targetId = config.fbPageId || this.extractIdFromUrl(config.fanpageUrl)

            // REMOVED: Legacy to_id logic. Verified payload uses 'privacy' and 'actor_id' instead.
            // Page ID is already handled by actor_id in variables definition.

            // Log payload for debugging
            console.log('📦 [GraphQL] Payload:', JSON.stringify(variables));

            const params = new URLSearchParams()
            params.append('fb_dtsg', tokens.fb_dtsg)
            params.append('fb_api_caller_class', 'RelayModern')
            params.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation')
            params.append('variables', JSON.stringify(variables))
            params.append('doc_id', doc_id)

            // Add jazoest heuristic (common in FB requests)
            const jazoest = '2' + Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('')
            params.append('jazoest', jazoest)

            const response = await fetch('https://www.facebook.com/api/graphql/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            })

            const text = await response.text()
            console.log('📥 [API] GraphQL Response received:', text.substring(0, 500) + (text.length > 500 ? '...' : ''))

            // Parse response more aggressively
            let hasSuccess = false
            let hasError = false
            let errorDetails = ''

            // Response is often newline-delimited JSON
            const lines = text.split('\n').filter(l => l.trim() && l.includes('{'))
            for (const line of lines) {
                try {
                    const data = JSON.parse(line)

                    // Check for explicit success with URL
                    if (data.data?.story_create?.story?.url) {
                        const url = data.data.story_create.story.url
                        console.log('✅ [API] Post created successfully via GraphQL:', url)
                        return { success: true, publishedUrl: url }
                    }

                    // Check for story_create without URL (still success)
                    if (data.data?.story_create?.story) {
                        console.log('✅ [API] Post created successfully (no URL in response)')
                        hasSuccess = true
                    }

                    // Check for errors
                    if (data.errors && data.errors.length > 0) {
                        hasError = true
                        errorDetails = data.errors.map((e: any) => e.message).join('; ')
                        console.error('❌ [API] GraphQL returned errors:', data.errors)
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }

            // If we found success marker but no explicit error
            if (hasSuccess && !hasError) {
                console.log('✅ [API] Post created successfully (verified via story_create presence)')
                return { success: true }
            }

            // Fallback heuristic: Check for story_create keyword in text
            if (text.includes('story_create') && !text.includes('"errors"')) {
                console.log('✅ [API] Detected story_create in response (Heuristic Success)')
                return { success: true }
            }

            // If we have explicit errors, report them
            if (hasError) {
                return {
                    success: false,
                    error: `Facebook API Error: ${errorDetails}`
                }
            }

            // Generic failure with actual response preview for debugging
            const preview = text.substring(0, 200).replace(/\n/g, ' ')
            return {
                success: false,
                error: `Không thể xác nhận bài đăng. Response: ${preview}${text.length > 200 ? '...' : ''}`
            }
        } catch (e) {
            console.error('💥 [API] Exception during GraphQL publish:', e)
            return {
                success: false,
                error: `Lỗi kết nối API: ${e instanceof Error ? e.message : 'Unknown error'}`
            }
        }
    }

    private async publishReels(config: PublishConfig): Promise<{ success: boolean, publishedUrl?: string, error?: string }> {
        try {
            console.log('🚀 [Reels] Starting DOM-based Reels Publish...')

            // 1. Open Composer
            let openBtn = this.findVisibleElementByText(['Bạn đang nghĩ gì', "What's on your mind"])
            if (!openBtn) {
                const triggers = FACEBOOK_SELECTORS.CREATE_POST_BUTTONS
                for (const sel of triggers) {
                    const el = document.querySelector(sel) as HTMLElement
                    if (el && el.offsetParent !== null) { openBtn = el; break; }
                }
            }

            if (!openBtn) throw new Error('Could not find composer trigger')
            openBtn.click()
            await this.wait(4000)

            // 2. Type Caption (if any)
            if (config.post.content) {
                const editor = document.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement
                if (editor) {
                    editor.focus()
                    document.execCommand('insertText', false, config.post.content)
                    await this.wait(1000)
                }
            }

            // 3. Upload Video
            const videoUrl = config.post.videos[0]
            const uploadSuccess = await this.injectVideoFile(videoUrl)
            if (!uploadSuccess) throw new Error('Video injection failed')

            // 4. Wait for processing & "Tiếp" button
            console.log('⏳ [Reels] Waiting for video processing...')
            let nextBtn: HTMLElement | null = null
            for (let i = 0; i < 40; i++) {
                await this.wait(3000)
                nextBtn = this.findVisibleElementByText(['Tiếp', 'Next'])
                if (nextBtn) {
                    console.log('✅ [Reels] Video ready for next step')
                    break
                }
            }
            if (!nextBtn) throw new Error('Timeout waiting for video processing')

            // 5. Click "Tiếp" (1st)
            nextBtn.click()
            await this.wait(5000)

            // 6. Reels Title (Optional - current FB UI usually combines caption and title in editor)
            const titleInput = document.querySelector(FACEBOOK_SELECTORS.REELS.TITLE_INPUT) as HTMLInputElement
            if (titleInput) {
                titleInput.focus()
                document.execCommand('insertText', false, config.post.content.substring(0, 100))
                await this.wait(1000)
            }

            // 7. Click "Tiếp" (2nd) - if it appears again
            const nextBtn2 = this.findVisibleElementByText(['Tiếp', 'Next'])
            if (nextBtn2) {
                nextBtn2.click()
                await this.wait(4000)
            }

            // 8. Click "Đăng"
            const publishBtn = this.findVisibleElementByText(['Đăng', 'Publish', 'Chia sẻ', 'Share'])
            if (!publishBtn) throw new Error('Could not find Publish button')
            publishBtn.click()
            await this.wait(8000)

            // 9. Handle WhatsApp popup & verification
            for (let i = 0; i < 5; i++) {
                const dismissBtn = this.findVisibleElementByText(['Lúc khác', 'Not now'])
                if (dismissBtn) {
                    dismissBtn.click()
                    await this.wait(2000)
                }
                const dialogs = document.querySelectorAll('[role="dialog"]')
                if (dialogs.length === 0) return { success: true }
                await this.wait(2000)
            }

            return { success: true }
        } catch (e) {
            console.error('💥 [Reels] Exception:', e)
            return { success: false, error: e instanceof Error ? e.message : 'Unknown' }
        }
    }

    private async injectVideoFile(videoUrl: string): Promise<boolean> {
        try {
            console.log(`📥 [Reels] Injecting video: ${videoUrl}`)
            const response = await fetch(videoUrl)
            const blob = await response.blob()
            const filename = videoUrl.split('/').pop() || 'video.mp4'
            const file = new File([blob], filename, { type: blob.type || 'video/mp4' })

            const inputs = document.querySelectorAll('input[type="file"]')
            let targetInput: HTMLInputElement | null = null

            for (const inp of Array.from(inputs) as HTMLInputElement[]) {
                const accept = inp.getAttribute('accept') || ''
                if (accept.includes('video')) {
                    targetInput = inp
                    break
                }
            }
            if (!targetInput && inputs.length > 0) targetInput = inputs[0] as HTMLInputElement
            if (!targetInput) return false

            const origAccept = targetInput.getAttribute('accept') || ''
            if (!origAccept.includes('video')) {
                targetInput.setAttribute('accept', origAccept + ',video/*,video/mp4')
            }

            const dt = new DataTransfer()
            dt.items.add(file)
            targetInput.files = dt.files
            targetInput.dispatchEvent(new Event('change', { bubbles: true }))
            targetInput.dispatchEvent(new Event('input', { bubbles: true }))

            return true
        } catch (e) {
            console.error('❌ [Reels] File injection error:', e)
            return false
        }
    }

    private findVisibleElementByText(texts: string[]): HTMLElement | null {
        const dialogs = document.querySelectorAll('[role="dialog"]')
        const root = dialogs.length > 0 ? dialogs[0] : document.body

        const candidates = root.querySelectorAll('span, div, button, [role="button"]')
        for (const el of Array.from(candidates) as HTMLElement[]) {
            if (el.offsetParent === null) continue
            const t = el.innerText?.trim()
            if (texts.some(txt => t === txt || t.includes(txt))) {
                return el
            }
        }
        return null
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export const postPublisher = new PostPublisher()
