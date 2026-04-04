// Fanpage Detector - Phát hiện và lấy danh sách fanpage
import { Fanpage } from '@/db/schema'
import { MessageResponse } from '@/utils/message-bridge'
import { FACEBOOK_SELECTORS, FB_URLS } from '@/config/facebook-selectors'

class FanpageDetector {
    async detectFanpages(): Promise<MessageResponse<Fanpage[]>> {
        try {
            console.log('[Fanpage Detector] Starting sync. Current URL:', window.location.href)

            // 1. Navigate if not on correct page
            if (!window.location.href.includes('/pages/')) {
                console.log('[Fanpage Detector] Navigating to /pages/...')
                window.location.href = FB_URLS.FANPAGES
                return {
                    success: true,
                    data: [],
                    error: 'Navigating... Please click Sync again when page loads.'
                }
            }

            // 2. Expand List (Scroll + Click See More)
            console.log('[Fanpage Detector] Already on /pages/. Starting expansion...')
            await this.autoScrollAndExpand()

            // 3. Extract final list
            const fanpages = this.extractFanpageList()
            console.log(`[Fanpage Detector] Final count: ${fanpages.length} pages.`)

            return {
                success: true,
                data: fanpages
            }
        } catch (error) {
            console.error('[Fanpage Detector] Fatal error:', error)
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        }
    }

    private async autoScrollAndExpand(): Promise<void> {
        const MAX_ATTEMPTS = 50
        const SCROLL_DELAY = 1500
        let lastLinkCount = 0
        let sameCountStreak = 0

        console.log('[Fanpage Detector] Beginning auto-scroll and expansion...')

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight)
            await this.wait(500)

            // Find and click "See More" / "Xem thêm"
            const seeMoreBtns = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], a[role="button"]'))
                .filter(el => {
                    const text = (el as HTMLElement).innerText?.trim().toLowerCase() || ''
                    return text === 'xem thêm' || text === 'see more'
                }) as HTMLElement[]

            if (seeMoreBtns.length > 0) {
                console.log(`[Fanpage Detector] Found ${seeMoreBtns.length} "See More" buttons. Clicking...`)
                seeMoreBtns.forEach(btn => btn.click())
                await this.wait(SCROLL_DELAY)
            } else {
                await this.wait(500)
            }

            // Check if more links loaded
            const currentLinkCount = document.querySelectorAll('a[href]').length
            if (currentLinkCount === lastLinkCount) {
                sameCountStreak++
                if (sameCountStreak >= 5) {
                    console.log('[Fanpage Detector] Link count stabilized. Ending expansion.')
                    break
                }
            } else {
                sameCountStreak = 0
                console.log(`[Fanpage Detector] Expansion in progress... (${currentLinkCount} links)`)
            }
            lastLinkCount = currentLinkCount
            
            await this.wait(500)
        }
    }

    private extractFanpageList(): Fanpage[] {
        const fanpages: Fanpage[] = []
        console.log('--- [Fanpage Detector] START DEEP SCAN ---')

        // NUCLEAR OPTION: Get ALL links, no filtering by role/container yet
        const allLinks = Array.from(document.querySelectorAll('a[href]'))
        console.log(`[Fanpage Detector] Found total ${allLinks.length} links on page`)

        const candidates = new Map<string, { name: string, url: string, avatar: string, debug: string }>()

        allLinks.forEach((link, index) => {
            const el = link as HTMLAnchorElement
            const href = el.href

            // 1. FAST FILTER: Skip obvious noise
            if (href.includes('/ad_center/') ||
                href.includes('/inbox/') ||
                href.includes('/settings/') ||
                href.includes('/groups/') ||
                href.includes('/marketplace/') ||
                href.includes('/friends/') ||
                href.includes('/watch/') ||
                href.includes('/notifications/') ||
                href.includes('/messages/') ||
                href.includes('/l.php') || // External links
                href.includes('help.facebook.com')) return

            // 2. ID EXTRACTION
            let pageId = ''
            const urlObj = new URL(href)

            // Priority 1: id query param (profile.php?id=...)
            if (urlObj.searchParams.has('id')) {
                pageId = urlObj.searchParams.get('id') || ''
            }
            // Priority 2: page_id query param
            else if (urlObj.searchParams.has('page_id')) {
                pageId = urlObj.searchParams.get('page_id') || ''
            }
            // Priority 3: Path segment (numeric only)
            // e.g. facebook.com/123456789/
            else {
                const parts = urlObj.pathname.split('/').filter(p => p)
                const lastPart = parts[parts.length - 1]
                if (lastPart && lastPart.match(/^\d{10,}$/)) {
                    pageId = lastPart
                }
            }

            // Valid page IDs are usually 10+ digits
            if (!pageId || !pageId.match(/^\d{10,}$/)) return

            // 3. NAME EXTRACTION
            let name = el.textContent?.trim() || ''

            // If name is too short/generic, look for context
            if (name.length < 2 || ['Review', 'Switch', 'Promote', 'Create', 'Dashboard', 'Xem', 'Trang'].some(k => name.includes(k))) {
                // Look up to 3 levels for a bold/heading element
                let parent = el.parentElement
                for (let i = 0; i < 3; i++) {
                    if (!parent) break
                    const bold = parent.querySelector('strong, h3, h4, span[style*="bold"], span[class*="Text"]')
                    if (bold && bold.textContent && bold.textContent.length > 2) {
                        name = bold.textContent.trim()
                        break
                    }
                    parent = parent.parentElement
                }
            }

            // Final name check
            if (name.length < 2 || name.length > 100) {
                // Log why we skipped this ID
                // console.log(`[Fanpage Detector] Skip ID ${pageId} - Invalid name "${name}"`)
                return
            }

            // 4. AVATAR EXTRACTION (Best Effort)
            let avatarUrl = ''
            let card = el.closest('div[role="article"]') || el.parentElement?.parentElement?.parentElement
            if (card) {
                const img = card.querySelector('image, img')
                if (img) {
                    const src = (img as any).href?.baseVal || (img as HTMLImageElement).src || ''
                    if (src.includes('scontent')) avatarUrl = src
                }
            }

            // Save candidate (deduplicate by ID, keep longest name if multiple found)
            if (candidates.has(pageId)) {
                const existing = candidates.get(pageId)!
                if (name.length > existing.name.length && !name.includes('...')) {
                    existing.name = name
                }
                if (avatarUrl && !existing.avatar) {
                    existing.avatar = avatarUrl
                }
            } else {
                candidates.set(pageId, {
                    name,
                    url: `https://www.facebook.com/profile.php?id=${pageId}`,
                    avatar: avatarUrl,
                    debug: `Found via ${href}`
                })
            }
        })

        console.log(`[Fanpage Detector] Found ${candidates.size} unique candidates`)

        // Convert map to array
        for (const [id, data] of candidates) {
            console.log(`[Fanpage Detector] >> MERGED: [${data.name}] (ID: ${id})`)
            fanpages.push({
                fbPageId: id,
                name: data.name,
                url: data.url,
                avatarUrl: data.avatar,
                enabled: false,
                postInterval: 60,
                dailyLimit: 10,
                activeHoursStart: 8,
                activeHoursEnd: 22,
                totalPosts: 0,
                syncedAt: new Date()
            })
        }

        console.log('--- [Fanpage Detector] SCAN COMPLETE ---')
        return fanpages
    }


    private extractPageId(url: string): string {
        // Try to extract from URL patterns
        // Pattern 1: /profile.php?id=123
        let match = url.match(/profile\.php\?id=(\d+)/)
        if (match) return match[1]

        // Pattern 2: facebook.com/pagename
        match = url.match(/facebook\.com\/([^/?]+)/)
        if (match && match[1]) {
            return match[1]
        }

        return ''
    }

    async getPageDetails(pageUrl: string): Promise<any> {
        // Navigate to page and get more details
        window.location.href = pageUrl
        await this.wait(2000)

        // Extract additional details like follower count, etc.
        return {
            // Can be enhanced later
        }
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export const fanpageDetector = new FanpageDetector()
