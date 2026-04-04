import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db, Keyword, Filter } from '@/db/schema'

export const useKeywordsStore = defineStore('keywords', () => {
    const keywords = ref<Keyword[]>([])
    const filters = ref<Filter[]>([])

    // Keyword Actions
    async function loadKeywords() {
        keywords.value = await db.keywords.toArray()
    }

    async function addKeyword(text: string, category?: string) {
        const keyword: Keyword = {
            text,
            category,
            enabled: true,
            createdAt: new Date()
        }

        await db.keywords.add(keyword)
        await loadKeywords()
    }

    async function updateKeyword(id: number, updates: Partial<Keyword>) {
        await db.keywords.update(id, updates)
        await loadKeywords()
    }

    async function deleteKeyword(id: number) {
        await db.keywords.delete(id)
        await loadKeywords()
    }

    async function toggleKeyword(id: number) {
        const keyword = keywords.value.find(k => k.id === id)
        if (keyword) {
            await updateKeyword(id, { enabled: !keyword.enabled })
        }
    }

    // Filter Actions
    async function loadFilters() {
        filters.value = await db.filters.toArray()
    }

    async function addFilter(filter: Omit<Filter, 'id' | 'createdAt'>) {
        const newFilter: Filter = {
            ...filter,
            createdAt: new Date()
        }

        await db.filters.add(newFilter)
        await loadFilters()
    }

    async function updateFilter(id: number, updates: Partial<Filter>) {
        await db.filters.update(id, updates)
        await loadFilters()
    }

    async function deleteFilter(id: number) {
        await db.filters.delete(id)
        await loadFilters()
    }

    async function toggleFilter(id: number) {
        const filter = filters.value.find(f => f.id === id)
        if (filter) {
            await updateFilter(id, { enabled: !filter.enabled })
        }
    }

    // Get active filter
    function getActiveFilter(): Filter | undefined {
        return filters.value.find(f => f.enabled)
    }

    return {
        keywords,
        filters,
        loadKeywords,
        addKeyword,
        updateKeyword,
        deleteKeyword,
        toggleKeyword,
        loadFilters,
        addFilter,
        updateFilter,
        deleteFilter,
        toggleFilter,
        getActiveFilter
    }
})
