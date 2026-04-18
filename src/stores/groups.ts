import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, Group } from '@/db/schema'
import { sendToBackground } from '@/utils/message-bridge'

export const useGroupsStore = defineStore('groups', () => {
    const groups = ref<Group[]>([])
    const isSyncing = ref(false)

    // Computed
    const enabledGroups = computed(() =>
        groups.value.filter(g => g.enabled)
    )

    const totalGroups = computed(() => groups.value.length)
    const enabledGroupsCount = computed(() => enabledGroups.value.length)

    // Actions
    async function loadGroups() {
        groups.value = await db.groups.toArray()
    }

    async function syncGroups() {
        if (isSyncing.value) return { status: 'busy' }
        isSyncing.value = true
        try {
            // 1. Sync current actor groups
            const response = await chrome.runtime.sendMessage({ type: 'SYNC_GROUPS' })
            if (response && response.data && response.data.status === 'navigating') {
                return { status: 'navigating' }
            }

            // 2. If current actor is successfully synced, then sync enabled fanpages
            // We do this in background to avoid blocking the UI too much
            await chrome.runtime.sendMessage({ type: 'SYNC_FANPAGE_GROUPS' })
            
            await loadGroups()
            return { status: 'success' }
        } catch (error) {
            console.error('Failed to sync groups:', error)
            throw error
        } finally {
            setTimeout(() => { isSyncing.value = false }, 2000)
        }
    }

    async function updateGroup(id: number, updates: Partial<Group>) {
        await db.groups.update(id, updates)
        await loadGroups()
    }

    async function toggleGroup(id: number) {
        const group = groups.value.find(g => g.id === id)
        if (group) {
            await updateGroup(id, { enabled: !group.enabled })
        }
    }

    async function setAllGroupsStatus(status: boolean) {
        const ids = groups.value.map(g => g.id!)
        await db.groups.where('id').anyOf(ids).modify({ enabled: status })
        await loadGroups()
    }

    async function deleteGroup(id: number) {
        await db.groups.delete(id)
        await loadGroups()
    }

    async function deleteAllGroups() {
        await db.groups.clear()
        await loadGroups()
    }

    return {
        groups,
        isSyncing,
        enabledGroups,
        totalGroups,
        enabledGroupsCount,
        loadGroups,
        syncGroups,
        updateGroup,
        toggleGroup,
        setAllGroupsStatus,
        deleteGroup,
        deleteAllGroups
    }
})
