// Post Publisher - Tự động đăng bài lên fanpage
import { Post } from '@/db/schema'
import { MessageResponse } from '@/utils/message-bridge'
import { FACEBOOK_SELECTORS } from '@/config/facebook-selectors'
import { RequestPublisher } from './request-publisher'
import { FanpageService } from './fanpage-service'

interface PublishConfig {
    post: Post
    fanpageUrl: string
    fbPageId: string
    publisherId?: 'PERSONAL' | string
    targetType: 'FANPAGE' | 'GROUP'
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
    public readonly STATE_KEY = 'fb_publish_state'
    public readonly STEP_KEY = 'fb_publish_step'
    public readonly TARGET_ID_KEY = 'fb_publish_target_id'
    public readonly PENDING_CONFIG_KEY = 'fb_publish_pending_config'

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

    public setStatus(status: PublishStatus['status'], error?: string) {
        this.currentStatus = {
            status,
            error,
            timestamp: Date.now()
        }
    }

    public setGlobalLock(locked: boolean) {
        PostPublisher.isGlobalLocked = locked;
        this.isPublishing = locked;
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
        // We keep the configuration for now as a safety net against mid-post reloads.
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

            // Re-verify identity one last time before DOM/API
            const finalActorId = tokens?.actorId || this.getCurrentProfileId()
            const expectedId = config.publisherId === 'PERSONAL' ? '' : config.publisherId

            // If expectedId is established and doesn't match finalActorId (lenient check)
            if (expectedId && expectedId !== 'PAGE' && finalActorId && finalActorId !== expectedId) {
                console.warn(`🆔 [PUBLISH] Identity Mismatch at step 3! Expected: ${expectedId}, Actual: ${finalActorId}`)
                this.updateDebugOverlay('⚠️ Nhầm định danh. Đang thử đồng bộ lại...')
                await this.wait(3000)
            }

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
                    // Path: Feed Post (Image/Text)
                    let publishedViaAPI = false;

                    // 1. Try API First for GROUPS or FANPAGES
                    if (config.targetType === 'GROUP') {
                        try {
                            this.updateDebugOverlay('📡 Đang đăng bài qua API Facebook Nhóm...')
                            const apiResult = await RequestPublisher.publishGroupGraphQL(config, tokens);
                            if (apiResult.success) {
                                console.log('✅ [PUBLISH] Successfully published via GraphQL API.');
                                this.updateDebugOverlay('🎉 Đăng bài thành công (API)!')
                                this.currentStatus = {
                                    status: 'success',
                                    data: { publishedUrl: apiResult.publishedUrl },
                                    timestamp: Date.now()
                                }
                                publishedViaAPI = true;
                            } else {
                                console.warn('⚠️ [PUBLISH] GraphQL API (Group) failed:', apiResult.error);
                                this.updateDebugOverlay(`⚠️ API thất bại: ${apiResult.error}. Đang chuyển sang dự phòng...`)
                                await this.wait(2000)
                            }
                        } catch (err) {
                            console.error('❌ [PUBLISH] Group API exception:', err);
                        }
                    } else if (config.targetType === 'FANPAGE') {
                        try {
                            this.updateDebugOverlay('📡 Đang đăng bài qua API Facebook Fanpage...')
                            const apiResult = await FanpageService.publishToPage(config.fbPageId, config.post.content || '', config.post.images || []);
                            if (apiResult.success) {
                                console.log('✅ [PUBLISH] Successfully published Fanpage via GraphQL API.');
                                this.updateDebugOverlay('🎉 Đăng bài thành công (API)!')
                                this.currentStatus = {
                                    status: 'success',
                                    data: { publishedUrl: apiResult.publishedUrl },
                                    timestamp: Date.now()
                                }
                                publishedViaAPI = true;
                            } else {
                                console.warn('⚠️ [PUBLISH] GraphQL API (Fanpage) failed:', apiResult.error);
                                this.updateDebugOverlay(`⚠️ API thất bại: ${apiResult.error}. Đang chuyển sang dự phòng...`)
                                await this.wait(2000)
                            }
                        } catch (err) {
                            console.error('❌ [PUBLISH] Fanpage API exception:', err);
                        }
                    }

                    // 2. Fallback to DOM if API not used or failed
                    if (!publishedViaAPI) {
                        this.updateDebugOverlay('🖼️ Đang soạn thảo bài đăng (Dự phòng)...')
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
                
                // FINAL CLEANUP of storage on terminal states
                if (this.currentStatus.status === 'success' || this.currentStatus.status === 'failed') {
                    localStorage.removeItem(this.PENDING_CONFIG_KEY);
                }

                this.isPublishing = false
                PostPublisher.isGlobalLocked = false
                if (this.publishTimeout) {
                    clearTimeout(this.publishTimeout)
                    this.publishTimeout = null
                }
            } else {
                console.log('🔄 [PUBLISH] Navigating... Flags preserved for next page load.')
                // When redirecting, we want the background to know it should keep polling
                this.currentStatus = { status: 'failed', error: 'REDIRECTING', timestamp: Date.now() };
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

            // Identify if we are posting to a Page or a Group
            const isTargetPage = config.targetType === 'FANPAGE'
            const isPersonalGroupPost = config.targetType === 'GROUP' && config.publisherId === 'PERSONAL'

            for (let retry = 0; retry < 10; retry++) {
                const currentId = this.getCurrentProfileId()
                const hasComposer = this.checkComposerVisible()

                this.updateDebugOverlay(`⏳ Xác thực tư cách (${retry + 1}/10)...\n👤 ID hiện tại: ${currentId || '?'}\n🎯 Mục tiêu: ${isTargetPage ? 'Fanpage' : 'Group'}`)

                // CRITICAL SUCCESS CONDITION: If we are already the correct identity, WE STOP HERE.
                // This prevents the extension from being fooled by "Switch" buttons in sidebars.
                if (targetId && currentId === targetId) {
                    console.log('✅ [PUBLISH] Active identity matches target! Skipping switch check.')
                    return false
                }

                // SHORTCUT: If we see the composer and the URL already contains the target ID, 
                // we treat it as success. This was the "Old Logic" that worked reliably.
                if (hasComposer && currentUrl.includes(targetId || '')) {
                    console.log('✨ [PUBLISH] Shortcut: Composer visible on target URL. Proceeding bypass.')
                    return false
                }

                // PATH A: PERSONAL GROUP POSTING (Lenient)
                if (isPersonalGroupPost) {
                    if (hasComposer) {
                        console.log('✨ [PUBLISH] Group Post (Personal): Composer is visible. Proceeding.')
                        return false
                    }
                    // Continue to check for banners ONLY if no composer is found
                }

                // PATH B: FANPAGE OR PAGE-IN-GROUP POSTING (Strict)
                const switchBtn = this.findVisibleElementByText(FACEBOOK_SELECTORS.SWITCH_PROFILE_BUTTON)
                const bannerSwitch = document.querySelector('div[aria-label="Chuyển ngay"], div[aria-label="Switch Now"]') as HTMLElement

                const hasSwitchBanner = this.isElementVisible(switchBtn as HTMLElement) || this.isElementVisible(bannerSwitch)

                if (hasSwitchBanner) {
                    // FOR PERSONAL GROUP POSTS: We ignore the switch banner (usually asking to switch to a Page)
                    if (isPersonalGroupPost) {
                        console.log('🙈 [PUBLISH] Group Post (Personal): Switch banner detected but ignoring to stay as personal.')
                    } else {
                        // FOR PAGES: WE MUST SWITCH
                        const btn = (switchBtn || bannerSwitch) as HTMLElement
                        console.log(`🎭 [PUBLISH] Switch Banner visible for Page Post. Clicking...`)
                        this.updateDebugOverlay(`🎭 Phát hiện cần đổi Profile. Đang nhấn chuyển...`)

                        localStorage.setItem(this.PENDING_CONFIG_KEY, JSON.stringify(config))
                        this.currentStatus = { status: 'processing', timestamp: Date.now() }
                        this.isRedirecting = true

                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        await this.wait(1000)

                        if (typeof btn.click === 'function') {
                            btn.click()
                        }
                        const events = ['mousedown', 'mouseup', 'click']
                        for (const evName of events) {
                            btn.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, view: window }))
                        }

                        await this.wait(5000)
                        return true
                    }
                }

                // FALLBACK: If composer is visible, we might be okay even if ID detection failed
                if (hasComposer) {
                    console.log('✅ [PUBLISH] Composer visible. Proceeding as fallback.')
                    localStorage.removeItem(this.PENDING_CONFIG_KEY)
                    return false
                }

                await this.wait(1500)
            }

            return false
        } catch (error) {
            console.error('❌ [PUBLISH] Identity check error:', error)
            return false
        }
    }

    private checkComposerVisible(): boolean {
        const composerBtns = Array.from(document.querySelectorAll('div[role="button"]'))
        const hasTextMatch = composerBtns.find(el => {
            const txt = (el as HTMLElement).innerText || '';
            return txt.toLowerCase().includes('nghĩ gì') || txt.toLowerCase().includes('mind');
        })
        const hasAriaMatch = !!document.querySelector('div[aria-label*="nghĩ gì"], div[aria-label*="mind"]');
        return !!hasTextMatch || hasAriaMatch
    }

    private isElementVisible(el: HTMLElement | null): boolean {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
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

    public getCurrentProfileId(): string | null {
        try {
            // Source 1: JavaScript source objects (STRICTLY ActorID/UserID)
            const scripts = Array.from(document.querySelectorAll('script'))
            for (const script of scripts) {
                const content = script.textContent || ''
                // Priority patterns for identity
                const m = content.match(/"pageID":"(\d+)"/) ||
                    content.match(/"actorID":"(\d+)"/) ||
                    content.match(/"userID":"(\d+)"/) ||
                    content.match(/"AccountID":"(\d+)"/) ||
                    content.match(/"identifier":"(\d+)"/) ||
                    content.match(/"profile_id":"(\d+)"/) ||
                    content.match(/"target_id":"(\d+)"/) ||
                    content.match(/"xhpc_actorid":"(\d+)"/) ||
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

        // 1. Exact URL match (lenient towards parameters)
        const cleanTarget = targetUrl.split('?')[0].replace(/\/$/, '')
        const cleanCurrent = currentUrl.split('?')[0].replace(/\/$/, '')

        if (cleanCurrent.includes(cleanTarget)) return true

        // 2. ID-based match (Critical for profile.php?id=...)
        const targetId = this.extractIdFromUrl(targetUrl) || sessionStorage.getItem(this.TARGET_ID_KEY)

        if (targetId) {
            // If the URL actually contains the ID, consider it matched
            if (currentUrl.includes(targetId)) {
                return true
            }

            // Identity check
            const currentActorId = this.getCurrentProfileId()
            if (currentActorId === targetId) {
                sessionStorage.setItem(this.TARGET_ID_KEY, targetId)
                return true
            }
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
            const openTriggers = [
                'bạn đang nghĩ gì', "what's on your mind", 
                "tạo bài viết", "create post", 
                "viết nội dung", "write some",
                "hãy viết gì đó", "share something"
            ];

            // Loop 12 times x 5 seconds = 60 seconds total wait for UI
            for (let retry = 0; retry < 12; retry++) {
                // Preferred clickable elements (Specific FB composer triggers)
                const clickableCands = document.querySelectorAll('div[role="button"], a[role="link"], div.x1i10hfl, div[aria-label]');
                for (const el of Array.from(clickableCands) as HTMLElement[]) {
                    if (el.offsetParent === null) continue;
                    const txt = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
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

                const msg = `⏳ Tìm nút "Bạn đang nghĩ gì?"... (${retry + 1}/10)`
                console.log(msg);
                this.updateDebugOverlay(msg)
                await this.wait(5000);
            }

            if (!openBtn) throw new Error('Không tìm thấy nút tạo bài viết (Hệ thống đã chờ 50 giây)')
            this.updateDebugOverlay('🖱️ Đã tìm thấy nút. Đang mở khung soạn thảo...')
            openBtn.click()
            await this.wait(6000)

            // 2. Declare and Find Editor
            let editor: HTMLElement | null = null;
            const findEditor = () => {
                const dialogs = document.querySelectorAll('[role="dialog"]');
                for (let i = dialogs.length - 1; i >= 0; i--) {
                    const r = dialogs[i] as HTMLElement;
                    const found = r.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement
                        || r.querySelector('div[contenteditable="true"]') as HTMLElement
                        || r.querySelector('[data-lexical-editor="true"]') as HTMLElement
                        || r.querySelector('p.xdj266r') as HTMLElement;
                    if (found) return found;
                }
                return null;
            };

            // 3. UPLOAD IMAGES FIRST (CRITICAL: Stabilizes the composer state)
            if (config.post.images && config.post.images.length > 0) {
                this.updateDebugOverlay('📸 Đang chuẩn bị tải ảnh...')
                const addPhotoBtn = this.findVisibleElementByText(['Ảnh/video', 'Photo/Video', 'Photo/video', 'Ảnh', 'Photo'])
                if (addPhotoBtn) {
                    addPhotoBtn.click()
                    await this.wait(3000)
                }
                const uploadSuccess = await this.injectImageFiles(config.post.images)
                if (!uploadSuccess) throw new Error('Không thể tải ảnh lên')

                this.updateDebugOverlay('⏳ Đang đợi Facebook xử lý ảnh...')
                let imagesReady = false
                const targetCount = config.post.images.length

                for (let i = 0; i < 15; i++) {
                    await this.wait(2000)
                    const removeSelectors = [
                        'div[aria-label="Gỡ"]', 'div[aria-label="Remove"]',
                        'div[aria-label^="Gỡ"]', 'div[aria-label*="Remove"]',
                        'div[aria-label="Xóa"]', 'div[aria-label*="photo"]', 'div[aria-label*="ảnh"]'
                    ]
                    const removeBtns = document.querySelectorAll(removeSelectors.join(','))

                    if (removeBtns.length >= targetCount) {
                        imagesReady = true
                        break
                    }
                    this.updateDebugOverlay(`⏳ Đang tải ảnh... (${removeBtns.length}/${targetCount})`)
                }

                if (!imagesReady) {
                    throw new Error(`Facebook chưa nhận diện được đủ ${targetCount} ảnh sau 30 giây.`)
                }

                this.updateDebugOverlay('✅ Ảnh đã sẵn sàng!')
                await this.wait(2000)
            }

            // 4. TYPE CAPTION SECOND (Now that images are attached and state is stable)
            if (config.post.content) {
                this.updateDebugOverlay('⌨️ Đang nhập nội dung bài viết...')
                editor = findEditor();
                if (editor) {
                    await this.setEditorText(editor, config.post.content)
                    await this.wait(3000)
                }
            }

            // 5. Check "Next" button (Page mode)
            let nextBtn: HTMLElement | null = null;
            const nextBtnSelectors = ['div[aria-label="Tiếp"]', 'div[aria-label="Next"]'];
            for (const sel of nextBtnSelectors) {
                const el = document.querySelector(sel) as HTMLElement;
                if (el) { nextBtn = el; break; }
            }
            if (nextBtn) {
                nextBtn.click();
                await this.wait(4000);
            }

            // 6. FINAL BUTTON CLICK (Strict verification with User-provided classes)
            let publishBtn: HTMLElement | null = null;

            // Priority 1: User-provided exact class pattern + aria-label
            const specificSelector = 'div[aria-label="Đăng"].x1i10hfl, div[aria-label="Publish"].x1i10hfl, div[aria-label="Post"].x1i10hfl';
            const specificBtns = document.querySelectorAll(specificSelector);
            for (const el of Array.from(specificBtns) as HTMLElement[]) {
                if (this.isElementVisible(el)) {
                    publishBtn = el;
                    break;
                }
            }

            // Priority 2: General aria-labels
            if (!publishBtn) {
                const btnSelectors = ['div[aria-label="Đăng"]', 'div[aria-label="Publish"]', 'div[aria-label="Post"]', 'div[aria-label="Chia sẻ"]', 'div[aria-label="Share"]'];
                for (const sel of btnSelectors) {
                    const el = document.querySelector(sel) as HTMLElement;
                    if (el && this.isElementVisible(el)) { publishBtn = el; break; }
                }
            }

            // Priority 3: Text match
            if (!publishBtn) {
                publishBtn = this.findVisibleElementByText(['Đăng', 'Publish', 'Chia sẻ', 'Share', 'Post']);
            }

            if (!publishBtn) throw new Error('Không tìm thấy nút Đăng bài')

            this.updateDebugOverlay('🚀 Đang kiểm tra nút "Đăng"...')
            let isBtnEnabled = false
            for (let i = 0; i < 15; i++) {
                const isDisabled = publishBtn.getAttribute('aria-disabled') === 'true' || (publishBtn as any).disabled === true
                if (!isDisabled) {
                    isBtnEnabled = true
                    break
                }
                this.updateDebugOverlay(`⏳ Chờ nút Đăng sẵn sàng... (${i + 1}/15)`)
                await this.wait(2000)
            }

            this.updateDebugOverlay('🚀 Tiến hành nhấn nút Đăng...')

            // Multi-event click sequence with Focus, KeyEvents and Retry
            const clickTheButton = async () => {
                if (!publishBtn) return;
                try {
                    publishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await this.wait(500);
                    publishBtn.focus()
                    
                    // Sequence 1: Mouse events
                    const clickEvents = ['mousedown', 'mouseup', 'click']
                    for (const evName of clickEvents) {
                        publishBtn.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, view: window }))
                        await this.wait(100)
                    }
                    
                    // Sequence 2: Keyboard 'Enter' (Fallback)
                    publishBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
                    publishBtn.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

                    // Sequence 3: Direct click
                    if (typeof publishBtn.click === 'function') publishBtn.click()
                } catch (e) { console.warn('Click error:', e) }
            }

            // Initial click
            await clickTheButton();

            console.log('⏳ [Feed DOM] Đang kiểm tra trạng thái bài đăng...')
            this.updateDebugOverlay('⏳ Đang đợi Facebook xác nhận...')

            let isPostSuccessful = false;
            // Wait up to 20 seconds for the button to disappear
            for (let i = 0; i < 10; i++) {
                await this.wait(2000)
                
                // CRITICAL SUCCESS CHECK: Is the button we just clicked still in the DOM and visible?
                // If it's gone or frozen-out, the post was likely submitted.
                const isButtonStillThere = document.body.contains(publishBtn) && (publishBtn.offsetParent !== null);
                const dialogs = document.querySelectorAll('[role="dialog"]');
                
                if (!isButtonStillThere || dialogs.length === 0) {
                    isPostSuccessful = true;
                    break;
                }

                // If button is still there, check if we need to click again (every 6 seconds / 3 checks)
                if (i > 0 && i % 3 === 0) {
                    console.log('🔄 [Feed DOM] Post button still visible. Retrying click...')
                    this.updateDebugOverlay('🔄 Vẫn thấy nút Đăng. Đang nhấn lại...')
                    await clickTheButton();
                }
            }

            if (!isPostSuccessful) {
                throw new Error('Đã nhấn nút Đăng nhưng khung soạn thảo không đóng lại. Vui lòng kiểm tra xem bài viết có bị Facebook chặn hay không.')
            }

            // 7. Handle Post-Publishing Popups (WhatsApp, Admin Approval, etc.)
            this.updateDebugOverlay('🎉 Đăng bài thành công!')
            await this.wait(3000)
            const dismissBtn = this.findVisibleElementByText(['Lúc khác', 'Not now', 'Đóng', 'Close', 'Ok', 'Xong'])
            if (dismissBtn) {
                dismissBtn.click()
                await this.wait(1000)
            }

            return { success: true }
        } catch (e) {
            console.error('💥 [Feed DOM] Exception:', e)
            return { success: false, error: e instanceof Error ? e.message : 'Unknown' }
        }
    }

    public async showDebugOverlay(initialMsg: string) {
        if (this.debugOverlay) return

        // Wait for document.body to be ready (Max 10 seconds)
        for (let i = 0; i < 20; i++) {
            if (document.body) break;
            await this.wait(500);
        }

        if (!document.body) return

        // Inject Styles for Pulse and Spinner
        if (!document.getElementById('fb-auto-overlay-styles')) {
            const style = document.createElement('style')
            style.id = 'fb-auto-overlay-styles'
            style.textContent = `
                @keyframes fb-pulse {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    50% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0.8; }
                }
                .fb-pulse-dot {
                    width: 8px; height: 8px;
                    background: #10b981;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 8px;
                    box-shadow: 0 0 8px #10b981;
                    animation: fb-pulse 2s infinite ease-in-out;
                }
                .fb-premium-glass {
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    background-color: rgba(15, 23, 42, 0.85);
                    border: 1px solid rgba(255, 255, 255, 0.125);
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
                }
            `
            document.head.appendChild(style)
        }

        this.debugOverlay = document.createElement('div')
        this.debugOverlay.id = 'fb-auto-status-overlay'
        this.debugOverlay.className = 'fb-premium-glass'
        Object.assign(this.debugOverlay.style, {
            position: 'fixed',
            bottom: '24px',
            left: '24px', // CHANGED TO LEFT
            width: '340px',
            padding: '18px',
            color: '#f8fafc',
            borderRadius: '16px',
            zIndex: '2147483647', // Max possible z-index
            fontFamily: 'Outfit, Inter, system-ui, sans-serif',
            fontSize: '14px',
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        })

        this.debugOverlay.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 2px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="fb-pulse-dot"></div>
                    <span style="font-weight: 700; background: linear-gradient(90deg, #60a5fa, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">FACEBOOK AUTO</span>
                </div>
                <span style="font-size: 10px; color: rgba(255,255,255,0.4); font-family: monospace;">ID: ${this.pageLoadId}</span>
            </div>
            <div id="fb-auto-status-msg" style="line-height: 1.5; font-weight: 500; color: #e2e8f0;">${initialMsg}</div>
            <div style="font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 4px;">
                <span>⚡</span> Đang tối ưu hóa tác vụ...
            </div>
        `
        document.body.appendChild(this.debugOverlay)
    }

    public updateDebugOverlay(msg: string) {
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

    public removeDebugOverlay() {
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

    private async setEditorText(editor: HTMLElement, text: string): Promise<void> {
        const isActuallyEmpty = () => {
            const raw = (editor.innerText || editor.textContent || '').trim();
            if (raw.length >= 2) return false;
            // Lexical check
            return editor.querySelectorAll('span, p, br, div[data-text]').length === 0;
        };

        try {
            console.log('📝 [Editor] Starting text input sequence...')
            editor.click()
            editor.focus()
            await this.wait(500)

            // Method 1: execCommand (Replacing selection)
            document.execCommand('selectAll', false)
            document.execCommand('insertText', false, text)
            editor.dispatchEvent(new Event('input', { bubbles: true }))

            await this.wait(800) // Wait for Lexical to sync
            if (!isActuallyEmpty()) {
                console.log('✅ [Editor] Method 1 (execCommand) Succeeded.')
                return
            }

            // Method 2: Clipboard Paste
            console.log('🔄 [Editor] Method 1 failed or delay too long. Trying Method 2 (Paste)...')
            const dataTransfer = new DataTransfer()
            dataTransfer.setData('text/plain', text)
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dataTransfer,
                bubbles: true,
                cancelable: true
            })
            editor.dispatchEvent(pasteEvent)

            await this.wait(800)
            if (!isActuallyEmpty()) {
                console.log('✅ [Editor] Method 2 (Paste) Succeeded.')
                return
            }

            // Method 3: Direct Property Assignment (Last Resort)
            console.log('⚠️ [Editor] Methods 1 & 2 failed. Using method 3 (Direct)...')
            // Clear manually to prevent duplication if somehow it was hidden
            editor.innerHTML = ''
            const p = document.createElement('p')
            p.className = 'xdj266r' // FB common paragraph class
            p.innerHTML = `<span data-text="true">${text}</span>`
            editor.appendChild(p)

            editor.dispatchEvent(new Event('input', { bubbles: true }))
            editor.dispatchEvent(new Event('change', { bubbles: true }))

            console.log('📝 [Editor] Text set attempt finished.')
        } catch (e) {
            console.error('Error setting editor text:', e)
        }
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
