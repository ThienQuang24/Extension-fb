import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { db, Schedule } from '@/db/schema'
import { sendToBackground } from '@/utils/message-bridge'

export const useSchedulesStore = defineStore('schedules', () => {
    const schedules = ref<Schedule[]>([])

    // Computed
    const pendingSchedules = computed(() =>
        schedules.value.filter(s => s.status === 'pending')
    )

    const completedSchedules = computed(() =>
        schedules.value.filter(s => s.status === 'success')
    )

    const failedSchedules = computed(() =>
        schedules.value.filter(s => s.status === 'failed')
    )

    // Actions
    async function loadSchedules() {
        schedules.value = await db.schedules.reverse().sortBy('scheduledAt')
    }

    async function createSchedule(
        postId: number,
        targetType: 'FANPAGE' | 'GROUP',
        targetId: number, // Can be fanpage id or group id
        publisherId: string, // 'PERSONAL' or fbPageId
        scheduledAt: Date
    ) {
        const schedule: Schedule = {
            postId,
            targetType,
            fanpageId: targetType === 'FANPAGE' ? targetId : undefined,
            groupId: targetType === 'GROUP' ? targetId : undefined,
            publisherId,
            scheduledAt,
            status: 'pending',
            createdAt: new Date()
        }

        await db.schedules.add(schedule)
        await loadSchedules()
    }

    async function updateSchedule(id: number, updates: Partial<Schedule>) {
        await db.schedules.update(id, updates)
        await loadSchedules()
    }

    async function deleteSchedule(id: number) {
        await db.schedules.delete(id)
        await loadSchedules()
    }

    async function publishNow(scheduleId: number) {
        const schedule = schedules.value.find(s => s.id === scheduleId)
        if (!schedule) return

        try {
            const response = await sendToBackground({
                type: 'PUBLISH_POST',
                data: {
                    postId: schedule.postId,
                    targetType: schedule.targetType,
                    fanpageId: schedule.fanpageId,
                    groupId: schedule.groupId,
                    publisherId: schedule.publisherId
                }
            })

            if (response.success) {
                await updateSchedule(scheduleId, {
                    status: 'success',
                    publishedAt: new Date(),
                    publishedUrl: response.data?.publishedUrl
                })
                return true
            } else {
                await updateSchedule(scheduleId, {
                    status: 'failed',
                    error: response.error
                })
                return false
            }
        } catch (error) {
            console.error('Error publishing now:', error)
            return false
        }
    }

    return {
        schedules,
        pendingSchedules,
        completedSchedules,
        failedSchedules,
        loadSchedules,
        createSchedule,
        updateSchedule,
        deleteSchedule,
        publishNow
    }
})
