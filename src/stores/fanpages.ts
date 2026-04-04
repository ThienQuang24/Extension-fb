import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, Fanpage } from '@/db/schema'
import { sendToBackground } from '@/utils/message-bridge'

export const useFanpagesStore = defineStore('fanpages', () => {
    const fanpages = ref<Fanpage[]>([])
    const isSyncing = ref(false)

    // Computed
    const enabledFanpages = computed(() =>
        fanpages.value.filter(f => f.enabled)
    )

    const totalFanpages = computed(() => fanpages.value.length)

    // Actions
    async function loadFanpages() {
        fanpages.value = await db.fanpages.toArray()
    }

    async function syncFanpages() {
        isSyncing.value = true

        try {
            const response = await sendToBackground({
                type: 'SYNC_FANPAGES'
            })

            if (response.success) {
                // Fanpages will be saved by background script
                await loadFanpages()
                return true
            } else {
                console.error('Failed to sync fanpages:', response.error)
                return false
            }
        } catch (error) {
            console.error('Error syncing fanpages:', error)
            return false
        } finally {
            isSyncing.value = false
        }
    }

    async function updateFanpage(id: number, updates: Partial<Fanpage>) {
        await db.fanpages.update(id, updates)
        await loadFanpages()
    }

    async function toggleFanpage(id: number) {
        const fanpage = fanpages.value.find(f => f.id === id)
        if (fanpage) {
            await updateFanpage(id, { enabled: !fanpage.enabled })
        }
    }

    async function deleteFanpage(id: number) {
        await db.fanpages.delete(id)
        await loadFanpages()
    }

    return {
        fanpages,
        isSyncing,
        enabledFanpages,
        totalFanpages,
        loadFanpages,
        syncFanpages,
        updateFanpage,
        toggleFanpage,
        deleteFanpage
    }
})
