// Facebook Scraper - Tự động tìm kiếm và crawl bài viết
import { Post } from '@/db/schema'
import { MessageResponse } from '@/utils/message-bridge'
import { FACEBOOK_SELECTORS, FB_URLS } from '@/config/facebook-selectors'

interface SearchConfig {
    keyword?: string
    maxPosts?: number
    scrollDelay?: number
    mode?: string
    groupUrl?: string
    filter?: any
}

class FacebookScraper {
    private isRunning = false
    private collectedPosts: Post[] = []
    private scannedPostIds: Set<string> = new Set() // NEW: Track every post seen to check relevance
    private scrollInterval: number | null = null
    private watchdogTimer: number | null = null
    private lastActivityTime: number = Date.now()
    private config: any = {}

    async startSearch(config: SearchConfig): Promise<MessageResponse> {
        if (this.isRunning) {
            return { success: false, error: 'Search is already running' }
        }

        this.isRunning = true
        this.collectedPosts = []
        this.scannedPostIds = new Set() // Reset scanned counter
        this.config = config

        try {
            // Only navigate to search page if in KEYWORD mode
            if (config.mode === 'KEYWORD' && config.keyword) {
                const searchUrl = FB_URLS.SEARCH(config.keyword)
                if (!window.location.href.includes('/search/posts')) {
                    console.log(`🌐 [SCRAPER] Navigating to search URL: ${searchUrl}`)
                    window.location.href = searchUrl
                    return { success: true, data: { status: 'navigating' } }
                }
            }

            console.log(`🚀 [SCRAPER] Starting search with config:`, config)
            this.lastActivityTime = Date.now()
            this.startWatchdog()

            // Start auto-scroll and collect posts
            await this.autoScrollAndCollect(config)

            this.stopWatchdog()
            return {
                success: true,
                data: {
                    posts: this.collectedPosts,
                    count: this.collectedPosts.length
                }
            }
        } catch (error) {
            this.isRunning = false
            this.stopWatchdog()
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    stopSearch(): void {
        this.isRunning = false
        if (this.scrollInterval) {
            clearInterval(this.scrollInterval)
            this.scrollInterval = null
        }
        this.stopWatchdog()
    }

    private startWatchdog(): void {
        this.stopWatchdog()
        this.lastActivityTime = Date.now()
        this.watchdogTimer = window.setInterval(() => {
            if (!this.isRunning) return

            const timeSinceLastActivity = Date.now() - this.lastActivityTime
            if (timeSinceLastActivity > 60000) { // 1 minute stall
                console.log(`🔄 [WATCHDOG] Stall detected! No activity for ${Math.floor(timeSinceLastActivity / 1000)}s. Reloading...`)
                this.stopWatchdog()
                window.location.reload()
            }
        }, 10000) // Check every 10s
    }

    private stopWatchdog(): void {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer)
            this.watchdogTimer = null
        }
    }

    private updateActivity(): void {
        this.lastActivityTime = Date.now()
    }

    private async autoScrollAndCollect(config: SearchConfig): Promise<void> {
        const maxPosts = config.maxPosts || 5000
        const baseDelay = config.scrollDelay || 2000
        const MAX_RETRIES = 50

        let previousHeight = 0
        let sameHeightCount = 0
        let noNewPostCount = 0

        console.log(`🚀 [SCRAPER] Starting scroll loop. Target: ${maxPosts} posts.`)

        while (this.isRunning && this.collectedPosts.length < maxPosts) {
            try {
                await this.dismissErrorDialogs()
                await this.expandContent()

                const currentHeight = document.body.scrollHeight
                window.scrollTo(0, currentHeight)
                this.updateActivity() // Update activity on scroll

                const jitter = Math.random() * 800 + 800
                await this.wait(baseDelay + jitter)

                if (currentHeight === previousHeight) {
                    sameHeightCount++
                    if (sameHeightCount > 2) {
                        window.scrollTo(0, currentHeight - 700)
                        await this.wait(1000)
                        window.scrollTo(0, document.body.scrollHeight)
                    }
                    if (sameHeightCount >= MAX_RETRIES) {
                        console.log(`🏁 [SCRAPER] Reached end of page or stuck (Height: ${currentHeight}px). Ending.`)
                        break
                    }
                } else {
                    sameHeightCount = 0
                }
                previousHeight = document.body.scrollHeight

                const bodyText = document.body.innerText || ''
                if (FACEBOOK_SELECTORS.END_MARKERS.some(marker => bodyText.includes(marker)) || 
                    bodyText.includes('Kết quả từ bên ngoài nhóm') || 
                    bodyText.includes('Results from outside the group')) {
                    console.log(`🏁 [SCRAPER] Found end marker or non-group results. Ending.`)
                    break
                }

                // NEW: Relevance threshold check
                // If we scanned more than 20 posts and found 0 matches, skip this group
                if (this.scannedPostIds.size >= 20 && this.collectedPosts.length === 0) {
                    console.log(`🏁 [SCRAPER] Relevance threshold reached (Scanned ${this.scannedPostIds.size} posts with 0 matches). Skipping group.`)
                    break
                }

                const prevCount = this.collectedPosts.length
                this.collectVisiblePosts(config.keyword || '')
                const newCount = this.collectedPosts.length

                if (newCount > prevCount) {
                    this.updateActivity() // Update activity when new posts are found
                    noNewPostCount = 0
                    console.log(`✅ [SCRAPER] Collected ${newCount} posts (+${newCount - prevCount})`)
                } else {
                    noNewPostCount++
                    if (noNewPostCount > 20) {
                        console.log(`🏁 [SCRAPER] No new posts after 20 scrolls. Ending.`)
                        break
                    }
                }

                this.sendProgress()

                // Small delay to prevent CPU spiking
                await this.wait(500)
            } catch (error) {
                console.error('⚠️ [SCRAPER] Error in scroll loop cycle:', error)
                await this.wait(2000) // Cooling off period on error
            }
        }

        console.log(`🏁 [SCRAPER] Search ended. Total collected: ${this.collectedPosts.length}`)
        this.stopSearch()

        chrome.runtime.sendMessage({
            type: 'SEARCH_COMPLETE',
            data: { count: this.collectedPosts.length }
        })
    }

    private async dismissErrorDialogs(): Promise<void> {
        try {
            const dialogs = document.querySelectorAll('div[role="dialog"]')
            for (const dialog of dialogs) {
                const dialogElement = dialog as HTMLElement
                const titleText = dialogElement.innerText || ''
                if (titleText.includes('Truy vấn tìm kiếm bằng đồ thị không hợp lệ') ||
                    titleText.includes('Invalid Graph Search Query') ||
                    titleText.includes('GraphSearchQuery')) {
                    const buttons = dialogElement.querySelectorAll('div[role="button"], button')
                    for (const btn of buttons) {
                        const btnText = (btn as HTMLElement).innerText || ''
                        if (btnText.toLowerCase().includes('ok')) {
                            (btn as HTMLElement).click()
                            await this.wait(1000)
                            break
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error dismissing dialogs:', e)
        }
    }

    private async expandContent(): Promise<void> {
        try {
            const specificSelectors = ['div[role="button"]', 'span[role="button"]', 'a[role="button"]', 'a[href="#"]']
            const allCandidates = Array.from(document.querySelectorAll(specificSelectors.join(', ')))
            const seeMoreButtons = allCandidates.filter(el => {
                const text = (el as HTMLElement).innerText?.trim().toLowerCase() || ''
                return text === 'xem thêm' || text === 'see more'
            })

            for (const btn of seeMoreButtons) {
                const rect = btn.getBoundingClientRect()
                if (rect.top > 80 && rect.bottom < window.innerHeight && rect.width > 0 && rect.height > 0) {
                    (btn as HTMLElement).click()
                    await this.wait(500)
                    const dialog = document.querySelector('div[role="dialog"]')
                    if (dialog) {
                        const closeBtn = dialog.querySelector('div[aria-label="Đóng"], div[aria-label="Close"]') as HTMLElement
                        if (closeBtn) {
                            closeBtn.click()
                        } else {
                            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
                        }
                        await this.wait(300)
                    }
                }
            }
        } catch (error) {
            console.error('Error expanding content:', error)
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private collectVisiblePosts(keyword: string): void {
        let postCards = Array.from(document.querySelectorAll(`div[role="${FACEBOOK_SELECTORS.POST_CONTAINER_ROLE}"]`))

        if (postCards.length === 0) {
            if (FACEBOOK_SELECTORS.POST_SEARCH_RESULT_SELECTOR) {
                const searchResults = document.querySelectorAll(FACEBOOK_SELECTORS.POST_SEARCH_RESULT_SELECTOR)
                searchResults.forEach(item => {
                    if (item instanceof HTMLElement) postCards.push(item)
                })
            }
            if (postCards.length === 0) {
                const listItems = document.querySelectorAll(`div[role="${FACEBOOK_SELECTORS.POST_FEED_ROLE}"] > div`)
                listItems.forEach(item => postCards.push(item as HTMLElement))
            }
        }

        postCards = postCards.filter(card => {
            const innerText = (card as HTMLElement).innerText || ''
            return FACEBOOK_SELECTORS.POST_ACTION_MENU_LABEL.some(label => innerText.includes(label)) ||
                card.querySelector('a[role="link"]')
        })

        postCards.forEach((cardElement) => {
            const card = cardElement as HTMLElement
            try {
                if (card.closest('div[aria-label="Bình luận"]') || card.closest('div[aria-label="Comments"]') || card.closest('ul')) return
                if (!card.innerText || card.innerText.length < 30) return

                const postId = this.extractPostId(card)
                if (!postId) return
                
                // Track every unique post we encounter for relevance checking
                if (!this.scannedPostIds.has(postId)) {
                    this.scannedPostIds.add(postId)
                    // console.log(`👁️ [SCRAPER] Scanned post #${this.scannedPostIds.size}: ${postId}`)
                }

                if (this.collectedPosts.some(p => p.fbPostId === postId)) return

                const post = this.extractPostData(card, keyword)
                if (post && post.content && post.authorName !== 'Unknown') {
                    const isDuplicateContent = this.collectedPosts.some(p =>
                        p.content === post.content ||
                        (p.content.includes(post.content.substring(0, 50)) && p.authorName === post.authorName)
                    )
                    if (!isDuplicateContent) {
                        console.log(`✨ [SCRAPER] New post found: ${post.fbPostId} by ${post.authorName}`)
                        this.collectedPosts.push(post)
                        chrome.runtime.sendMessage({ type: 'POST_COLLECTED', data: [post] })
                    }
                }
            } catch (error) {
                console.error('Error collecting post:', error)
            }
        })
    }

    private extractPostId(element: HTMLElement): string | null {
        try {
            const links = element.querySelectorAll('a')
            for (const link of links) {
                const href = link.href || ''
                if (href.includes('/posts/') || href.includes('/permalink/') || href.includes('/watch') || href.includes('/videos/') || href.includes('multi_permalinks=')) {
                    const match = href.match(/\/posts\/(\w+)/) ||
                        href.match(/\/permalink\/(\d+)/) ||
                        href.match(/\/videos\/(\d+)/) ||
                        href.match(/multi_permalinks=(\d+)/)
                    if (match) return match[1]
                    return 'url_' + this.generateHash(href)
                }
            }

            const dataFt = element.getAttribute('data-ft')
            if (dataFt) {
                try {
                    const ft = JSON.parse(dataFt)
                    if (ft.mf_story_key) return ft.mf_story_key
                } catch (e) { }
            }

            const author = element.querySelector(FACEBOOK_SELECTORS.POST_AUTHOR_LINK)?.textContent || ''
            const content = element.innerText || ''
            if (content && content.length > 50) {
                return 'hash_' + this.generateHash(author + content.substring(0, 100))
            }
        } catch (e) {
            console.error('Error extracting post ID:', e)
        }
        return null
    }

    private extractPostData(element: HTMLElement, keyword: string): Post | null {
        try {
            const authorLink = element.querySelector(FACEBOOK_SELECTORS.POST_AUTHOR_LINK) as HTMLAnchorElement
            let rawAuthorName = authorLink?.innerText || 'Unknown'

            // Fallback for complex headers (e.g. Author Name > Group Name)
            if (rawAuthorName === 'Unknown' || rawAuthorName.includes(' > ')) {
                const header = element.querySelector('h2, h3')
                if (header) {
                    const firstLink = header.querySelector('a')
                    if (firstLink) rawAuthorName = firstLink.innerText
                }
            }

            if (rawAuthorName === 'Unknown' || !rawAuthorName) {
                console.log(`⚠️ [SCRAPER] Skipped post: Could not identify author name`)
                return null
            }

            const authorName = this.cleanContent(rawAuthorName)
            const authorUrl = authorLink?.href || ''

            const contentDivs = element.querySelectorAll(FACEBOOK_SELECTORS.POST_CONTENT)
            let content = ''
            if (contentDivs.length > 0) {
                contentDivs.forEach(div => {
                    const text = (div as HTMLElement).innerText
                    if (text && text.length > 2) content += text + '\n'
                })
            } else {
                const autoDivs = element.querySelectorAll('div[dir="auto"]')
                autoDivs.forEach(div => {
                    if (div.textContent !== rawAuthorName) content += (div as HTMLElement).innerText + '\n'
                })
            }
            content = this.cleanContent(content)

            const imgElements = element.querySelectorAll(FACEBOOK_SELECTORS.POST_IMAGES)
            const validImages: string[] = []
            imgElements.forEach(element => {
                const img = element as HTMLImageElement
                if (img.src && !img.src.includes('emoji') && (img.width > 100 || img.height > 100)) {
                    validImages.push(img.src)
                }
            })

            const videoElements = element.querySelectorAll(FACEBOOK_SELECTORS.POST_VIDEO)
            const validVideos: string[] = []
            videoElements.forEach(element => {
                const video = element as HTMLVideoElement
                if (video.src) {
                    validVideos.push(video.src)
                } else {
                    // Sometimes video src is nested in a blob or another attribute
                    const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src')
                    if (src) validVideos.push(src)
                }
            })

            if (content.length < 20 && validImages.length === 0 && validVideos.length === 0) {
                console.log(`⚠️ [SCRAPER] Skipped post: Content too short (${content.length} chars) and no media`)
                return null
            }

            const lowerContent = content.toLowerCase()
            const commentPhrases = ['ib', 'inbox', 'quan tâm', 'chấm', 'hóng', 'up', 'ké', 'lương bèo', 'tuyển ké']
            if (commentPhrases.some(phrase => lowerContent.startsWith(phrase) && content.length < 50)) {
                console.log(`⚠️ [SCRAPER] Skipped post: Appears to be a short comment/spam`)
                return null
            }

            if (this.config && this.config.filter) {
                const filter = this.config.filter
                if (filter.excludeKeywords && filter.excludeKeywords.length > 0) {
                    for (const badWord of filter.excludeKeywords) {
                        if (badWord && lowerContent.includes(badWord.toLowerCase().trim())) {
                            console.log(`⚠️ [SCRAPER] Skipped post: Contains excluded keyword "${badWord}"`)
                            return null
                        }
                    }
                }

                if (filter.includeKeywords && filter.includeKeywords.length > 0) {
                    const hasInclude = filter.includeKeywords.some((word: string) => word && lowerContent.includes(word.toLowerCase().trim()))
                    if (!hasInclude) {
                        console.log(`⚠️ [SCRAPER] Skipped post: Does not contain any include keywords`)
                        return null
                    }
                }
            }

            // RELAXED: Keyword enforcement is skipped for search results as they are already relevant
            const isSearchPage = window.location.href.includes('/search/posts')
            if (keyword && keyword.trim().length > 0 && !isSearchPage) {
                if (!lowerContent.includes(keyword.toLowerCase().trim())) {
                    console.log(`⚠️ [SCRAPER] Skipped post: Does not contain search keyword "${keyword}" (non-search page)`)
                    return null
                }
            }

            content = content.replace(/Xem thêm/gi, '').replace(/See more/gi, '')
            content = content.replace(/\.\.\.\s*\.\.\./g, '...')

            let postUrl = ''
            const links = element.querySelectorAll('a')
            for (const link of links) {
                const href = link.href || ''
                if (href.includes('/posts/') || href.includes('/permalink/')) {
                    postUrl = href
                    break
                }
            }
            if (!postUrl && authorUrl) postUrl = authorUrl

            return {
                fbPostId: this.extractPostId(element) || this.generateHash(content),
                authorName,
                authorUrl,
                content: content.trim(),
                images: validImages,
                videos: validVideos,
                timestamp: new Date(),
                postUrl,
                keywordUsed: keyword,
                crawledAt: new Date(),
                published: false
            }
        } catch (error) {
            console.error('Error extracting post data:', error)
            return null
        }
    }

    private cleanContent(text: string): string {
        if (!text) return ''
        return text
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/Xem thêm/g, '')
            .replace(/See more/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.!?;:])/g, '$1')
            .replace(/([,.!?;:])\s*([,.!?;:])/g, '$1$2')
            .trim()
    }

    private generateHash(text: string): string {
        let hash = 0
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        return Math.abs(hash).toString(36)
    }

    private sendProgress(): void {
        chrome.runtime.sendMessage({
            type: 'SEARCH_PROGRESS',
            data: {
                count: this.collectedPosts.length,
                isRunning: this.isRunning
            }
        })
    }

    async syncJoinedGroups(): Promise<MessageResponse> {
        if (this.isRunning) return { success: false, error: 'Scraper is busy' }
        
        const syncUrl = 'https://www.facebook.com/groups/joins'
        if (!window.location.href.includes('/groups/joins')) {
            console.log(`🌐 [SCRAPER] Navigating to groups sync URL: ${syncUrl}`)
            window.location.href = syncUrl
            return { success: true, data: { status: 'navigating' } }
        }

        try {
            console.log('🚀 [SCRAPER] Syncing joined groups...')
            
            // Wait for initial groups to load
            await this.wait(3000)
            
            const uniqueGroups = new Map<string, {name: string, url: string}>()
            let lastGroupCount = 0
            let sameCountRetries = 0
            const MAX_SCROLLS = 30 // Increased limit to find more groups
            
            for (let i = 0; i < MAX_SCROLLS; i++) {
                const groupLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'))
                
                groupLinks.forEach(link => {
                    const anchor = link as HTMLAnchorElement
                    const href = anchor.href
                    
                    // Group URL pattern: facebook.com/groups/{id}/
                    const match = href.match(/\/groups\/(\d+)/)
                    if (match) {
                        const id = match[1]
                        const name = anchor.innerText.trim()
                        if (name && name.length > 2 && !uniqueGroups.has(id)) {
                            uniqueGroups.set(id, { name, url: href.split('?')[0] })
                        }
                    }
                })

                console.log(`📊 [SCRAPER] Found ${uniqueGroups.size} groups so far...`)
                
                if (uniqueGroups.size === lastGroupCount) {
                    sameCountRetries++
                    if (sameCountRetries >= 3) {
                        console.log('🏁 [SCRAPER] No more new groups found. Ending scroll.')
                        break
                    }
                } else {
                    sameCountRetries = 0
                }
                
                lastGroupCount = uniqueGroups.size
                
                // Scroll to bottom
                window.scrollTo(0, document.body.scrollHeight)
                await this.wait(2000)
            }

            const groups = Array.from(uniqueGroups.entries()).map(([id, info]) => ({
                fbGroupId: id,
                name: info.name,
                url: info.url,
                enabled: true,
                syncedAt: new Date()
            }))

            console.log(`✅ [SCRAPER] Found ${groups.length} groups.`)
            
            // Inform background script immediately
            chrome.runtime.sendMessage({
                type: 'GROUPS_SYNCED',
                data: { groups }
            })

            return {
                success: true,
                data: { groups }
            }
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Sync failed' }
        }
    }

    getCurrentPosts(): Post[] {
        return this.collectedPosts
    }
}

export const scraper = new FacebookScraper()
