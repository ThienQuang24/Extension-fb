import Dexie, { Table } from 'dexie'

// Interface definitions
export interface Keyword {
    id?: number
    text: string
    category?: string
    enabled: boolean
    createdAt: Date
}

export interface Filter {
    id?: number
    name: string
    dateRangeInDays?: number
    postTypes: string[] // ['text', 'image', 'video']
    minLikes?: number
    maxLikes?: number
    minShares?: number
    minComments?: number
    includeKeywords?: string[]
    excludeKeywords: string[]
    enabled: boolean
    createdAt: Date
}

export interface Post {
    id?: number
    fbPostId: string
    authorName: string
    authorUrl: string
    content: string
    images: string[] // base64 or blob URLs
    videos: string[]
    timestamp: Date
    likes?: number
    shares?: number
    comments?: number
    postUrl: string
    keywordUsed: string
    crawledAt: Date
    published: boolean
    publishedAt?: Date
}

export interface Fanpage {
    id?: number
    fbPageId: string
    name: string
    url: string
    avatarUrl?: string // NEW: Profile picture URL
    enabled: boolean
    postInterval: number // minutes between posts
    dailyLimit: number
    activeHoursStart: number // 0-23
    activeHoursEnd: number // 0-23
    lastPostAt?: Date
    totalPosts: number
    syncedAt: Date
}

export interface Schedule {
    id?: number
    postId: number
    fanpageId: number
    scheduledAt: Date
    status: 'pending' | 'processing' | 'success' | 'failed'
    error?: string
    publishedUrl?: string
    publishedAt?: Date
    createdAt: Date
}

// NEW: Track post UIDs forever to prevent duplicates
export interface PostUID {
    id?: number
    fbPostId: string
    crawledAt: Date
}

// Database class
export class FacebookDatabase extends Dexie {
    keywords!: Table<Keyword, number>
    filters!: Table<Filter, number>
    posts!: Table<Post, number>
    fanpages!: Table<Fanpage, number>
    schedules!: Table<Schedule, number>
    postUIDs!: Table<PostUID, number> // NEW

    constructor() {
        super('FacebookExtensionDB')

        this.version(3).stores({
            keywords: '++id, text, category, enabled',
            filters: '++id, name, enabled',
            posts: '++id, fbPostId, keywordUsed, published, crawledAt',
            fanpages: '++id, fbPageId, name, enabled',
            schedules: '++id, postId, fanpageId, scheduledAt, status, publishedUrl',
            postUIDs: '++id, fbPostId, crawledAt'
        }).upgrade(() => { })

        this.version(2).stores({ // Increment version
            keywords: '++id, text, category, enabled',
            filters: '++id, name, enabled',
            posts: '++id, fbPostId, keywordUsed, published, crawledAt',
            fanpages: '++id, fbPageId, name, enabled',
            schedules: '++id, postId, fanpageId, scheduledAt, status',
            postUIDs: '++id, fbPostId, crawledAt' // NEW
        })
    }
}

// Export singleton instance
export const db = new FacebookDatabase()
