import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, Post } from '@/db/schema'
import { sendToBackground } from '@/utils/message-bridge'
import { useKeywordsStore } from './keywords'

export const usePostsStore = defineStore('posts', () => {
    const posts = ref<Post[]>([])
    const isSearching = ref(false)
    const searchProgress = ref(0)
    const keywordsStore = useKeywordsStore()

    // Computed
    const publishedPosts = computed(() =>
        posts.value.filter(p => p.published)
    )

    const unpublishedPosts = computed(() =>
        posts.value.filter(p => !p.published)
    )

    const totalPosts = computed(() => posts.value.length)

    // Actions
    async function loadPosts() {
        posts.value = await db.posts.reverse().sortBy('crawledAt')
    }

    // Sync search status with background script
    async function syncSearchStatus() {
        try {
            const response = await sendToBackground({
                type: 'GET_SEARCH_STATUS'
            })

            if (response.success && response.data) {
                const wasSearching = isSearching.value
                isSearching.value = response.data.isSearching

                if (response.data.isSearching && !wasSearching) {
                    console.log('📥 [POPUP] Synced search status: SEARCHING')
                    console.log(`   Mode: ${response.data.mode}, Progress: ${response.data.currentIndex}/${response.data.totalCount}`)
                }
            }
        } catch (error) {
            console.error('Error syncing search status:', error)
        }
    }

    async function startSearch(config: { mode?: string; keyword?: string; groupUrls?: string[]; keywords?: string[]; includeGeneralSearch?: boolean; maxPosts?: number }) {
        isSearching.value = true
        searchProgress.value = 0

        // Get active filter if any
        await keywordsStore.loadFilters()
        const activeFilter = keywordsStore.getActiveFilter()

        const searchConfig = {
            ...config,
            filter: activeFilter ? {
                dateRangeInDays: activeFilter.dateRangeInDays,
                minLikes: activeFilter.minLikes,
                postTypes: activeFilter.postTypes,
                includeKeywords: activeFilter.includeKeywords,
                excludeKeywords: activeFilter.excludeKeywords
            } : undefined
        }

        try {
            const response = await sendToBackground({
                type: 'START_SEARCH',
                data: searchConfig
            })

            if (response.success) {
                return true
            } else {
                console.error('Failed to start search:', response.error)
                isSearching.value = false
                return false
            }
        } catch (error) {
            console.error('Error starting search:', error)
            isSearching.value = false
            return false
        }
    }

    async function stopSearch() {
        const response = await sendToBackground({
            type: 'STOP_SEARCH'
        })

        isSearching.value = false

        if (response.success) {
            await loadPosts()
        }
    }

    async function deletePost(id: number) {
        await db.posts.delete(id)
        await loadPosts()
    }

    async function clearAllPosts() {
        await db.posts.clear()
        posts.value = []
    }

    function updateSearchProgress(count: number) {
        searchProgress.value = count
    }

    // Listen for search completion from background script
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SEARCH_COMPLETE') {
                console.log('📥 [POPUP] Received SEARCH_COMPLETE, resetting isSearching')
                isSearching.value = false
                loadPosts()
            }
            if (message.type === 'SEARCH_STOPPED') {
                console.log('📥 [POPUP] Received SEARCH_STOPPED, resetting isSearching')
                isSearching.value = false
                loadPosts()
            }
        })
    }

    return {
        posts,
        isSearching,
        searchProgress,
        publishedPosts,
        unpublishedPosts,
        totalPosts,
        loadPosts,
        syncSearchStatus,
        startSearch,
        stopSearch,
        deletePost,
        clearAllPosts,
        updateSearchProgress
    }
})
