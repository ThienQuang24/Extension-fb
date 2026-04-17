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
    private isRedirecting = false 
    private static isGlobalLocked = false 
    private publishTimeout: number | null = null
    private debugOverlay: HTMLElement | null = null
    public readonly pageLoadId = Math.random().toString(36).substring(2, 15)

    // Polling State
    private currentStatus: PublishStatus = { status: 'idle', timestamp: Date.now() }

    // Persistent state keys
    private readonly STATE_KEY = 'fb_publish_state'
    private readonly STEP_KEY = 'fb_publish_step'
    private readonly TARGET_ID_KEY = 'fb_publish_target_id'
    private readonly PENDING_CONFIG_KEY = 'fb_publish_pending_config'

    constructor() { }

    // Resume logic for page reloads (Legacy/Backup)
    public init() {
        const pendingConfig = localStorage.getItem(this.PENDING_CONFIG_KEY)
        if (pendingConfig) {
            console.log('🔄 [RESUME] Found pending publish configuration in LocalStorage. Restarting...')
            
            // Show overlay IMMEDIATELY
            this.showDebugOverlay('📡 Đang đồng bộ tác vụ với hệ thống trung tâm...')
            
            try {
                const config = JSON.parse(pendingConfig) as PublishConfig
                
                // DO NOT remove immediately. 
                // Facebook reloads multiple times during profile switch.
                // We only remove it once processPublish successfully confirms the target identity.
                
                setTimeout(() => {
                    this.updateDebugOverlay('🚀 Đang kích hoạt lại tiến trình...')
                    this.startPublish(config).catch(err => {
                        console.error('❌ [RESUME] Failed to auto-restart publish:', err)
                        // If it fails with "Already publishing", that's fine (means another instance started)
                    })
                }, 4000)
            } catch (e) {
                console.error('❌ [RESUME] Error parsing pending config:', e)
                localStorage.removeItem(this.PENDING_CONFIG_KEY)
            }
        }
    }

    // Getter for polling
    public getPublishStatus(): PublishStatus {
        return this.currentStatus
    }

    // New Non-blocking Start Method
    public async startPublish(config: PublishConfig): Promise<{ success: boolean, error?: string, message?: string }> {
        if (this.isPublishing || PostPublisher.isGlobalLocked) {
            return { success: false, error: 'Tiến trình đang chạy. Vui lòng chờ.' }
        }

        this.showDebugOverlay('🚀 Bắt đầu tiến trình...')
        
        this.isPublishing = true
        this.isRedirecting = false
        PostPublisher.isGlobalLocked = true
        this.currentStatus = { status: 'processing', timestamp: Date.now() }

        // Start async process WITHOUT awaiting it here (Fire and Forget)
        this.processPublish(config).catch(err => {
            console.error('Unhandled publish error:', err)
            this.updateDebugOverlay(`💥 Lỗi nghiêm trọng: ${err.message || 'Unknown'}`)
            this.currentStatus = {
                status: 'failed',
                error: err.message || 'Unknown Error',
                timestamp: Date.now()
            }
            this.isPublishing = false
            PostPublisher.isGlobalLocked = false
        })

        return { success: true, message: 'Đã bắt đầu tiến trình đăng bài' }
    }

    // Internal processing logic (Moved from publishPost)
    private async processPublish(config: PublishConfig): Promise<void> {
        this.showDebugOverlay('🔍 Đang kiểm tra vị trí...')
        
        // --- 1. NAVIGATION CHECK (CRITICAL) ---
        // Ensure we are on the target Fanpage/Group before doing anything
        if (!this.isTargetPage(config.fanpageUrl)) {
            const msg = `🗺️ Chuyển hướng đến Fanpage: ${config.fanpageUrl}`
            console.log(msg)
            this.updateDebugOverlay(msg)
            
            const targetId = this.extractIdFromUrl(config.fanpageUrl)
            if (targetId) localStorage.setItem(this.TARGET_ID_KEY, targetId)
            
            // Save config to local storage for resume after reload
            localStorage.setItem(this.PENDING_CONFIG_KEY, JSON.stringify(config))
            
            // Redirect
            this.isRedirecting = true
            window.location.href = config.fanpageUrl
            return 
        }

        // --- 2. PROFILE SWITCH CHECK ---
        const currentActor = this.getCurrentProfileId()
        this.updateDebugOverlay(`🎭 Kiểm tra quyền Quản trị (Tư cách: ${currentActor || '?'})...`)
        
        // Sometimes we are on the right URL but in the wrong profile context
        if (await this.checkAndSwitchProfile(config)) {
            const msg = '⏳ Phát hiện cần đổi Profile. Đang nhấn chuyển...'
            console.log(msg)
            this.updateDebugOverlay(msg)
            return // Exit and let checkResume handle the reload
        }

        // --- SUCCESS: TARGET IDENTITY CONFIRMED ---
        // Now it is safe to remove the pending configuration
        localStorage.removeItem(this.PENDING_CONFIG_KEY)
        this.updateDebugOverlay(`✅ Tư cách: ${currentActor} (Sẵn sàng)`)

        // Auto-reset after 180 seconds
        this.publishTimeout = window.setTimeout(() => {
            console.warn('Publishing timeout - auto resetting flag')
            if (this.currentStatus.status === 'processing') {
                this.updateDebugOverlay('❌ Hết thời gian chờ (180s)')
                this.currentStatus = { status: 'failed', error: 'Timeout (180s)', timestamp: Date.now() }
            }
            this.isPublishing = false
            this.publishTimeout = null
            PostPublisher.isGlobalLocked = false
        }, 180000)

        try {
            this.updateDebugOverlay('🔗 Đang lấy mã bảo mật FB (Token)...')
            const tokens = await this.getFBTokens()
            if (tokens) {
                // Check if we should use Reels flow (if video exists)
                if (config.post.videos && config.post.videos.length > 0) {
                    this.updateDebugOverlay('📹 Đang xử lý đăng Video/Reels...')
                    const reelsResult = await this.publishReels(config)
                    if (reelsResult.success) {
                        this.updateDebugOverlay('🎉 Đăng bài thành công!')
                        this.currentStatus = {
                            status: 'success',
                            data: { publishedUrl: reelsResult.publishedUrl },
                            timestamp: Date.now()
                        }
                    } else {
                        this.updateDebugOverlay(`❌ Thất bại: ${reelsResult.error}`)
                        this.currentStatus = {
                            status: 'failed',
                            error: `Reels Error: ${reelsResult.error}`,
                            timestamp: Date.now()
                        }
                    }
                } else {
                    this.updateDebugOverlay('🖼️ Đang soạn thảo bài đăng...')
                    const feedResult = await this.publishFeedDOM(config)
                    if (feedResult.success) {
                        this.updateDebugOverlay('🎉 Đăng bài thành công!')
                        this.currentStatus = {
                            status: 'success',
                            data: { publishedUrl: feedResult.publishedUrl },
                            timestamp: Date.now()
                        }
                    } else {
                        this.updateDebugOverlay(`❌ Thất bại: ${feedResult.error}`)
                        this.currentStatus = {
                            status: 'failed',
                            error: `Lỗi đăng bài DOM: ${feedResult.error}`,
                            timestamp: Date.now()
                        }
                    }
                }
            } else {
                this.updateDebugOverlay('⚠️ Không lấy được Token (fb_dtsg). Thử cách đăng DOM dự phòng...')
                const feedResult = await this.publishFeedDOM(config)
                if (feedResult.success) {
                    this.updateDebugOverlay('🎉 Đăng bài thành công (DOM)')
                    this.currentStatus = { status: 'success', timestamp: Date.now() }
                } else {
                    this.updateDebugOverlay(`❌ Thất bại: ${feedResult.error}`)
                    this.currentStatus = {
                        status: 'failed',
                        error: 'Không tìm thấy Token và lỗi đăng bài DOM.',
                        timestamp: Date.now()
                    }
                }
            }
        } catch (error) {
            this.currentStatus = {
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown Error',
                timestamp: Date.now()
            }
        } finally {
            // CRITICAL: Only reset flags if we are NOT in the middle of a redirect
            // If we are redirecting, the next page load should handle the cleanup
            if (!this.isRedirecting) {
                console.log('🧹 [PUBLISH] Final cleanup: Resetting flags.')
                this.isPublishing = false
                PostPublisher.isGlobalLocked = false
                if (this.publishTimeout) {
                    clearTimeout(this.publishTimeout)
                    this.publishTimeout = null
                }
            } else {
                console.log('🔄 [PUBLISH] Navigating... Flags preserved for next page load.')
            }
            sessionStorage.removeItem(this.STEP_KEY)
            
            // Auto hide overlay after success/fail
            setTimeout(() => this.removeDebugOverlay(), 5000)
        }
    }

    private async checkAndSwitchProfile(config: PublishConfig): Promise<boolean> {
        try {
            const targetId = this.extractIdFromUrl(config.fanpageUrl) || config.fbPageId
            const currentUrl = window.location.href

            // Loop to wait for the page identity/switch button to load
            for (let retry = 0; retry < 10; retry++) {
                const currentId = this.getCurrentProfileId()
                
                // Show current status for better user debugging
                this.updateDebugOverlay(`⏳ Chờ xác thực tư cách...\n🔎 ID hiện tại: ${currentId || 'Không tìm thấy'}\n🎯 ID mục tiêu: ${targetId}`)

                // SHORTCUT: If we are on the target URL and the "Bạn đang nghĩ gì?" composer is visible,
                // we treat this as a success even if ID detection is being slow.
                const hasComposer = !!Array.from(document.querySelectorAll('div[role="button"]')).find(el => {
                    const txt = (el as HTMLElement).innerText || '';
                    return txt.toLowerCase().includes('nghĩ gì') || txt.toLowerCase().includes('mind');
                }) || !!document.querySelector('div[aria-label*="nghĩ gì"], div[aria-label*="mind"]');

                if (hasComposer && currentUrl.includes(targetId || '')) {
                     console.log('✨ [PUBLISH] Composer visible on target URL. Proceeding bypass.')
                     localStorage.removeItem(this.PENDING_CONFIG_KEY)
                     return false
                }

                // CRITICAL PRIORITY: Check for the "Switch Profile" banner first
                // If this exists, we ARE NOT in the right profile, regardless of what ID we detected
                const switchBtn = this.findVisibleElementByText(FACEBOOK_SELECTORS.SWITCH_PROFILE_BUTTON)
                const bannerSwitch = document.querySelector('div[aria-label="Chuyển ngay"], div[aria-label="Switch Now"]') as HTMLElement
                
                // Better visibility check
                const isBannerVisible = (el: HTMLElement | null) => {
                    if (!el) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
                }

                const hasSwitchBanner = isBannerVisible(switchBtn as HTMLElement) || isBannerVisible(bannerSwitch)
                
                console.log(`🆔 [PUBLISH] Identity Scan (${retry + 1}/10): Target=${targetId}, CurrentActor=${currentId}, HasBanner=${hasSwitchBanner}`)

                // If Banner exists, we MUST switch
                if (hasSwitchBanner) {
                    const btn = (switchBtn || bannerSwitch) as HTMLElement
                    
                    console.log(`🎭 [PUBLISH] Switch Banner visible. Clicking...`)
                    this.updateDebugOverlay(`🎭 Thấy nút Chuyển ngay. Đang nhấn chuyển...`)
                    
                    localStorage.setItem(this.PENDING_CONFIG_KEY, JSON.stringify(config))
                    this.currentStatus = { status: 'processing', timestamp: Date.now() }
                    
                    this.isRedirecting = true
                    
                    // Robust Click
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    await this.wait(1000)
                    
                    const events = ['mousedown', 'mouseup', 'click']
                    for (const evName of events) {
                        btn.dispatchEvent(new MouseEvent(evName, {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }))
                    }
                    
                    await this.wait(8000) // Wait longer for the reload to trigger
                    return true
                }

                // If no banner, check if our CurrentActor matches target
                if (targetId && currentId && targetId === currentId) {
                    console.log('✅ [PUBLISH] Actor ID matches! Proceeding.')
                    // Always clear the pending flag once ID is confirmed
                    localStorage.removeItem(this.PENDING_CONFIG_KEY)
                    return false
                }

                this.updateDebugOverlay(`⏳ Chờ định danh... (${retry + 1}/10)`)
                await this.wait(5000)
            }
        } catch (e) {
            console.warn('⚠️ [PUBLISH] Error during profile switch detection:', e)
        }
        return false
    }

    private extractIdFromBanner(banner: HTMLElement | null): string | null {
        if (!banner) return null
        // Sometimes the ID is in the data attributes or surrounding text
        const text = banner.innerText || banner.parentElement?.innerText || ''
        const match = text.match(/id=(\d+)/) || text.match(/profile\/(\d+)/)
        return match ? match[1] : null
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
            // Source 1: JavaScript source objects (STRICTLY ActorID/UserID)
            const scripts = Array.from(document.querySelectorAll('script'))
            for (const script of scripts) {
                const content = script.textContent || ''
                // Priority patterns for identity
                const m = content.match(/"actorID":"(\d+)"/) || 
                          content.match(/"userID":"(\d+)"/) ||
                          content.match(/"AccountID":"(\d+)"/) ||
                          content.match(/"identifier":"(\d+)"/) ||
                          content.match(/,"id":"(\d+)"/)
                          
                if (m) return m[1]
            }

            // Source 2: DTSG Initial Data (Very reliable actor source)
            for (const script of scripts) {
                const content = script.textContent || ''
                const dtsgMatch = content.match(/"USER_ID":"(\d+)"/) || 
                                 content.match(/"actor_id":"(\d+)"/) ||
                                 content.match(/"user_id":"(\d+)"/)
                if (dtsgMatch) return dtsgMatch[1]
            }

            // Source 3: Cookies (Ultimate Fallback)
            const cUser = document.cookie.split('; ').find(row => row.trim().startsWith('c_user='))?.split('=')[1]
            if (cUser) return cUser

        } catch (e) {
            console.warn('Error detecting current profile ID:', e)
        }
        return null
    }

    private isTargetPage(targetUrl: string): boolean {
        const currentUrl = window.location.href
        
        // 1. Exact URL match (with query params)
        if (currentUrl.includes(targetUrl)) return true

        // 2. ID-based match (Critical for profile.php?id=...)
        const targetId = this.extractIdFromUrl(targetUrl) || sessionStorage.getItem(this.TARGET_ID_KEY)
        const currentProfileId = this.getCurrentProfileId()
        
        if (targetId) {
            console.log(`🆔 [PUBLISH] ID Check: Target=${targetId}, CurrentActor=${currentProfileId}`)
            if (currentProfileId === targetId) {
                sessionStorage.setItem(this.TARGET_ID_KEY, targetId)
                return true
            }
            // If we have a target ID but the current profile ID doesn't match, 
            // and the URL doesn't contain the target ID, it's NOT the target page.
            if (!currentUrl.includes(targetId)) return false
        }

        // 3. Lenient URL check (for username-based URLs or groups)
        const cleanTarget = targetUrl.split('?')[0].replace(/\/$/, '')
        const cleanCurrent = currentUrl.split('?')[0].replace(/\/$/, '')

        if (cleanTarget.length > 20 && (cleanCurrent.includes(cleanTarget) || cleanTarget.includes(cleanCurrent))) {
            console.log('✅ [PUBLISH] URL matched (lenient check)')
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

    private async publishFeedDOM(config: PublishConfig): Promise<{ success: boolean, publishedUrl?: string, error?: string }> {
        try {
            console.log('🚀 [Feed DOM] Starting DOM-based Feed Publish...')

            // 1. Open Composer
            let openBtn: HTMLElement | null = null;
            const openTriggers = ['bạn đang nghĩ gì', "what's on your mind", "tạo bài viết", "create post"];
            
            // Loop 10 times x 5 seconds = 50 seconds total wait for UI
            for (let retry = 0; retry < 10; retry++) {
                // Preferred clickable elements
                const clickableCands = document.querySelectorAll('div[role="button"], a[role="link"], div.x1i10hfl');
                for (const el of Array.from(clickableCands) as HTMLElement[]) {
                    if (el.offsetParent === null) continue;
                    const txt = el.innerText?.toLowerCase().trim() || '';
                    if (openTriggers.some(t => txt.includes(t))) {
                        openBtn = el;
                        break;
                    }
                }

                if (!openBtn) {
                    openBtn = this.findVisibleElementByText(['Bạn đang nghĩ gì', "What's on your mind", "Tạo bài viết", "Create post"]);
                }

                if (!openBtn) {
                    const triggers = FACEBOOK_SELECTORS.CREATE_POST_BUTTONS;
                    for (const sel of triggers) {
                        const el = document.querySelector(sel) as HTMLElement;
                        if (el && el.offsetParent !== null) { openBtn = el; break; }
                    }
                }

                if (openBtn) break;
                
                if (openBtn) break;
                
                const msg = `⏳ Tìm nút "Bạn đang nghĩ gì?"... (${retry + 1}/10)`
                console.log(msg);
                this.updateDebugOverlay(msg)
                await this.wait(5000);
            }

            if (!openBtn) throw new Error('Không tìm thấy nút tạo bài viết (Hệ thống đã chờ 50 giây)')
            this.updateDebugOverlay('🖱️ Đã tìm thấy nút. Đang mở khung soạn thảo...')
            openBtn.click()
            await this.wait(4000)

            // 2. Type Caption (if any)
            if (config.post.content) {
                this.updateDebugOverlay('⌨️ Đang nhập nội dung bài viết...')
                let editor: HTMLElement | null = null;
                const dialogs = document.querySelectorAll('[role="dialog"]');
                
                // Khảo sát mọi ô thoại từ lớp trên cùng xuống dưới cùng để tìm editor hợp lệ
                for (let i = dialogs.length - 1; i >= 0; i--) {
                    const r = dialogs[i] as HTMLElement;
                    editor = r.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement
                          || r.querySelector('div[contenteditable="true"]') as HTMLElement
                          || r.querySelector('[data-lexical-editor="true"]') as HTMLElement
                          || r.querySelector('p.xdj266r') as HTMLElement;
                    if (editor) break;
                }

                if (editor) {
                    editor.click();
                    editor.focus();
                    
                    // Cách 1: Sử dụng PasteEvent (Tương thích tốt với Lexical)
                    const dataTransfer = new DataTransfer()
                    dataTransfer.setData('text/plain', config.post.content)
                    const pasteEvent = new ClipboardEvent('paste', {
                        clipboardData: dataTransfer,
                        bubbles: true,
                        cancelable: true
                    })
                    editor.dispatchEvent(pasteEvent)
                    await this.wait(500)
                    
                    // Cách 2: Fallback to execCommand + InputEvent (Kích hoạt bộ đánh giá React)
                    if (!editor.innerText || !editor.innerText.trim()) {
                         document.execCommand('insertText', false, config.post.content);
                         editor.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    await this.wait(2000)
                } else {
                    console.warn("⚠️ [Feed DOM] Không tìm thấy khung soạn thảo nội dung trong cửa sổ popup.");
                }
            }

            // 3. Upload Images
            if (config.post.images && config.post.images.length > 0) {
                const checkDialogs = document.querySelectorAll('[role="dialog"]');
                if (checkDialogs.length === 0) {
                    throw new Error('Cửa sổ tạo bài viết chưa bật lên được, không thể tải ảnh!');
                }
                const addPhotoBtn = this.findVisibleElementByText(['Ảnh/video', 'Photo/Video', 'Photo/video', 'Ảnh', 'Photo'])
                if (addPhotoBtn) {
                    addPhotoBtn.click()
                    await this.wait(2000)
                }
                const uploadSuccess = await this.injectImageFiles(config.post.images)
                if (!uploadSuccess) throw new Error('Không thể tải ảnh lên')
                console.log('⏳ [Feed DOM] Đang đợi xử lý ảnh...')
                await this.wait(6000)
            }

            // 4. Kiểm tra nút "Tiếp" (trường hợp đăng trên Page cần 2 bước)
            let nextBtn: HTMLElement | null = null;
            const nextBtnSelectors = ['div[aria-label="Tiếp"]', 'div[aria-label="Next"]'];
            for (const sel of nextBtnSelectors) {
                const el = document.querySelector(sel) as HTMLElement;
                if (el) { nextBtn = el; break; }
            }
            if (!nextBtn) {
                 const buttons = document.querySelectorAll('div[role="button"]');
                 for (const btn of Array.from(buttons) as HTMLElement[]) {
                     const t = (btn.innerText || btn.textContent)?.toLowerCase().trim() || '';
                     if (t === 'tiếp' || t === 'next') {
                         nextBtn = btn;
                         break;
                     }
                 }
            }
            if (nextBtn) {
                console.log('⏳ [Feed DOM] Tìm thấy nút Tiếp, đang click...');
                nextBtn.click();
                await this.wait(4000); // Chờ modal thứ 2 hiện ra
            }

            // 5. Click "Đăng"
            let publishBtn: HTMLElement | null = null;
            
            // 4.1 Thử tìm qua aria-label trước vì chính xác nhất
            const btnSelectors = [
                'div[aria-label="Đăng"]', 'div[aria-label="Publish"]', 'div[aria-label="Post"]',
                'div[aria-label="Chia sẻ"]', 'div[aria-label="Share"]'
            ];
            for (const sel of btnSelectors) {
                const el = document.querySelector(sel) as HTMLElement;
                if (el) { publishBtn = el; break; }
            }

            // 4.2 Nếu không tìm thấy, tìm qua text hiển thị
            if (!publishBtn) {
                publishBtn = this.findVisibleElementByText(['Đăng', 'Publish', 'Chia sẻ', 'Share', 'Post']);
                // Loại trừ các trường hợp tìm nhầm (chứa từ khóa gây nhiễu)
                if (publishBtn && publishBtn.innerText) {
                    const txt = publishBtn.innerText.toLowerCase();
                    if (txt.includes('đăng ký') || txt.includes('đăng xuất') || txt.includes('đăng nhập')) {
                        publishBtn = null;
                    }
                }
            }

            // 4.3 Fallback cuối cùng vét cạn các phần tử có role="button"
            if (!publishBtn) {
                const buttons = document.querySelectorAll('div[role="button"]');
                for (const btn of Array.from(buttons) as HTMLElement[]) {
                    const t = (btn.innerText || btn.textContent)?.toLowerCase().trim() || '';
                    if (['đăng', 'post', 'publish', 'chia sẻ', 'chia sẻ ngay', 'share'].includes(t)) {
                        publishBtn = btn;
                        break;
                    }
                }
            }

            if (!publishBtn) throw new Error('Không tìm thấy nút Đăng bài (Đã thử mọi selector)')
            
            this.updateDebugOverlay('🚀 Nhấn nút "Đăng". Chờ FB xử lý...')
            publishBtn.click()
            
            console.log('⏳ [Feed DOM] Đang xuất bản...')
            await this.wait(12000)

            // 5. Handle success
            const dialogs = document.querySelectorAll('[role="dialog"]')
            if (dialogs.length === 0) {
                return { success: true }
            }

            const dismissBtn = this.findVisibleElementByText(['Lúc khác', 'Not now'])
            if (dismissBtn) {
                dismissBtn.click()
                await this.wait(2000)
            }

            return { success: true }
        } catch (e) {
            console.error('💥 [Feed DOM] Exception:', e)
            return { success: false, error: e instanceof Error ? e.message : 'Unknown' }
        }
    }

    private async showDebugOverlay(initialMsg: string) {
        if (this.debugOverlay) return
        
        // Wait for document.body to be ready (Max 10 seconds)
        for (let i = 0; i < 20; i++) {
            if (document.body) break;
            await this.wait(500);
        }

        if (!document.body) {
            console.error('❌ [PUBLISH] CRITICAL: document.body not found after 10s. Cannot show overlay.')
            return
        }

        this.debugOverlay = document.createElement('div')
        this.debugOverlay.id = 'fb-auto-status-overlay'
        Object.assign(this.debugOverlay.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '320px',
            padding: '15px',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: '#ffffff',
            borderRadius: '12px',
            zIndex: '999999', // Extra high z-index
            fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            fontSize: '14px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            borderLeft: '5px solid #0084ff',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        })
        
        this.debugOverlay.innerHTML = `
            <div style="font-weight: bold; border-bottom: 1px solid #444; padding-bottom: 5px; color: #0084ff; display: flex; justify-content: space-between;">
                <span>🤖 Facebook Auto Manager</span>
                <span style="font-size: 10px; color: #888;">${this.pageLoadId}</span>
            </div>
            <div id="fb-auto-status-msg" style="line-height: 1.4;">${initialMsg}</div>
            <div style="font-size: 11px; color: #aaa; margin-top: 5px;">
                Vui lòng không đóng hoặc chuyển tab
            </div>
        `
        document.body.appendChild(this.debugOverlay)
    }

    private updateDebugOverlay(msg: string) {
        if (!this.debugOverlay) {
            this.showDebugOverlay(msg);
            return;
        }
        const msgEl = document.getElementById('fb-auto-status-msg')
        if (msgEl) {
            msgEl.innerText = msg
            console.log(`📢 [OVERLAY] ${msg}`)
        }
    }

    private removeDebugOverlay() {
        if (this.debugOverlay) {
            this.debugOverlay.remove()
            this.debugOverlay = null
        }
    }

    private async injectImageFiles(imageUrls: string[]): Promise<boolean> {
        try {
            console.log(`📥 [Feed] Tiêm ${imageUrls.length} ảnh`)
            const dataTransfer = new DataTransfer()

            for (const url of imageUrls) {
                const response = await fetch(url)
                const blob = await response.blob()
                const filename = url.split('/').pop()?.split('?')[0] || 'image.jpg'
                const file = new File([blob], filename, { type: blob.type || 'image/jpeg' })
                dataTransfer.items.add(file)
            }

            const inputs = document.querySelectorAll('input[type="file"]')
            let targetInput: HTMLInputElement | null = null

            // Quét ngược từ dưới lên trên vì popup tạo bài viết luôn sinh ra input ảnh mới gắn vào cuối DOM.
            // Nếu quét từ trên xuống sẽ lấy nhầm input thay ảnh bìa của trang.
            for (const inp of Array.from(inputs).reverse() as HTMLInputElement[]) {
                const accept = inp.getAttribute('accept') || ''
                if (accept.includes('image')) {
                    targetInput = inp
                    break
                }
            }
            if (!targetInput && inputs.length > 0) {
                targetInput = inputs[inputs.length - 1] as HTMLInputElement
            }
            if (!targetInput) return false

            const origAccept = targetInput.getAttribute('accept') || ''
            if (!origAccept.includes('image')) {
                targetInput.setAttribute('accept', origAccept + ',image/*,image/jpeg,image/png')
            }

            targetInput.files = dataTransfer.files
            targetInput.dispatchEvent(new Event('change', { bubbles: true }))
            targetInput.dispatchEvent(new Event('input', { bubbles: true }))
            return true
        } catch (e) {
            console.error('❌ [Feed] File injection error:', e)
            return false
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
        try {
            const dialogs = document.querySelectorAll('[role="dialog"]')
            const root = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body
            if (!root) return null;

            const candidates = root.querySelectorAll('span, div, button, [role="button"]')
            // Lật ngược thứ tự để ưu tiên click vào phần tử con (sâu nhất) trước, tránh click nhầm vào các thẻ div bao bọc khổng lồ bên ngoài.
            for (const el of Array.from(candidates).reverse() as HTMLElement[]) {
                if (el.offsetParent === null) continue;
                let t = el.innerText?.trim() || '';
                let tLower = t.toLowerCase();
                if (texts.some(txt => {
                    let txtLower = txt.toLowerCase();
                    return tLower === txtLower || tLower.includes(txtLower);
                })) {
                    // Trả về chính nó nếu nó là button, hoặc tìm cha gần nhất là button/link
                    const interactive = el.closest('button, [role="button"], a');
                    return (interactive as HTMLElement) || el;
                }
            }
        } catch (e) { console.warn('findVisibleElementByText error:', e) }
        return null;
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export const postPublisher = new PostPublisher()

// Bootstrap with safety
try {
    postPublisher.init();
} catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown Fatal Error';
    console.error('💥 FATALLY FAILED TO INIT POST PUBLISHER:', e);
    if (sessionStorage.getItem('fb_publish_pending_config')) {
        alert('Extension Error: ' + errorMsg);
    }
}
