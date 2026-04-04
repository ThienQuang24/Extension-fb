import { Post, Fanpage, Schedule } from '@/db/schema'

export interface AutoSchedulerConfig {
    postInterval: number // minutes between posts
    dailyLimit: number // max posts per fanpage per day
    activeHoursStart: number // 8 = 8:00 AM
    activeHoursEnd: number // 22 = 10:00 PM
    multiPageStrategy: 'simultaneous' | 'staggered'
    staggerDelay: number // minutes delay between fanpages (if staggered)
}

export const DEFAULT_AUTO_SCHEDULER_CONFIG: AutoSchedulerConfig = {
    postInterval: 60, // 1 hour between posts
    dailyLimit: 10,
    activeHoursStart: 8,
    activeHoursEnd: 22,
    multiPageStrategy: 'staggered',
    staggerDelay: 5 // Changed from 15 to 5 minutes
}

interface ScheduleSlot {
    postId: number
    fanpageId: number
    scheduledAt: Date
}

export function generateAutoSchedule(
    posts: Post[],
    fanpages: Fanpage[],
    config: AutoSchedulerConfig = DEFAULT_AUTO_SCHEDULER_CONFIG
): ScheduleSlot[] {
    const slots: ScheduleSlot[] = []

    // Only schedule unpublished posts
    const unpublishedPosts = posts.filter(p => !p.published)

    if (unpublishedPosts.length === 0 || fanpages.length === 0) {
        return slots
    }

    // Start scheduling from next available time
    let currentTime = getNextAvailableTime(new Date(), config)

    // Track posts per fanpage per day for daily limit
    const dailyPostCount: Map<string, number> = new Map()

    // For each post, schedule it to all selected fanpages
    for (const post of unpublishedPosts) {
        for (let i = 0; i < fanpages.length; i++) {
            const fanpage = fanpages[i]

            // Calculate time for this fanpage
            let scheduleTime = new Date(currentTime)

            if (config.multiPageStrategy === 'staggered' && i > 0) {
                // Add stagger delay for subsequent fanpages
                scheduleTime = addMinutes(scheduleTime, i * config.staggerDelay)
            }

            // Check daily limit for this fanpage
            const dayKey = `${fanpage.id}-${getDateKey(scheduleTime)}`
            const count = dailyPostCount.get(dayKey) || 0

            if (count >= config.dailyLimit) {
                // Move to next day
                scheduleTime = getNextDay(scheduleTime, config)
                dailyPostCount.set(dayKey, 0)
            }

            // Ensure within active hours
            scheduleTime = ensureWithinActiveHours(scheduleTime, config)

            slots.push({
                postId: post.id!,
                fanpageId: fanpage.id!,
                scheduledAt: scheduleTime
            })

            // Update daily count
            const newDayKey = `${fanpage.id}-${getDateKey(scheduleTime)}`
            dailyPostCount.set(newDayKey, (dailyPostCount.get(newDayKey) || 0) + 1)
        }

        // Move to next post interval
        currentTime = addMinutes(currentTime, config.postInterval)
        currentTime = ensureWithinActiveHours(currentTime, config)
    }

    return slots
}

function getNextAvailableTime(from: Date, config: AutoSchedulerConfig): Date {
    const next = new Date(from)
    next.setMinutes(next.getMinutes() + 5) // Start at least 5 minutes from now
    return ensureWithinActiveHours(next, config)
}

function ensureWithinActiveHours(time: Date, config: AutoSchedulerConfig): Date {
    const hours = time.getHours()

    if (hours < config.activeHoursStart) {
        // Too early, move to start of active hours
        time.setHours(config.activeHoursStart, 0, 0, 0)
    } else if (hours >= config.activeHoursEnd) {
        // Too late, move to tomorrow's start
        time.setDate(time.getDate() + 1)
        time.setHours(config.activeHoursStart, 0, 0, 0)
    }

    return time
}

function getNextDay(time: Date, config: AutoSchedulerConfig): Date {
    const next = new Date(time)
    next.setDate(next.getDate() + 1)
    next.setHours(config.activeHoursStart, 0, 0, 0)
    return next
}

function addMinutes(time: Date, minutes: number): Date {
    const result = new Date(time)
    result.setMinutes(result.getMinutes() + minutes)
    return result
}

function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
