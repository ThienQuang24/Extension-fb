<template>
  <div class="dashboard">
    <h1>Dashboard</h1>
    
    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📝</div>
        <div class="stat-content">
          <div class="stat-value">{{ postsStore.totalPosts }}</div>
          <div class="stat-label">Bài đã crawl</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">📄</div>
        <div class="stat-content">
          <div class="stat-value">{{ fanpagesStore.totalFanpages }}</div>
          <div class="stat-label">Fanpages</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-content">
          <div class="stat-value">{{ postsStore.publishedPosts.length }}</div>
          <div class="stat-label">Đã đăng</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon">⏰</div>
        <div class="stat-content">
          <div class="stat-value">{{ schedulesStore.pendingSchedules.length }}</div>
          <div class="stat-label">Chờ đăng</div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>Quick Actions</h2>
      <div class="actions-grid">
        <button class="action-btn" @click="$router.push('/search')">
          <span class="btn-icon">🔍</span>
          <span>Bắt đầu tìm kiếm</span>
        </button>
        <button class="action-btn" @click="syncFanpages">
          <span class="btn-icon">🔄</span>
          <span>Sync Fanpages</span>
        </button>
        <button class="action-btn" @click="$router.push('/keywords')">
          <span class="btn-icon">➕</span>
          <span>Thêm từ khóa</span>
        </button>
        <button class="action-btn" @click="openFacebook">
          <span class="btn-icon">📘</span>
          <span>Mở Facebook</span>
        </button>
        <button class="action-btn" @click="exportToExcel">
          <span class="btn-icon">📊</span>
          <span>Xuất Excel</span>
        </button>
      </div>
    </div>

    <!-- Recent Posts -->
    <div class="recent-posts">
      <h2>Bài viết gần đây</h2>
      <div v-if="recentPosts.length === 0" class="empty-state">
        <p>Chưa có bài viết nào. Hãy bắt đầu tìm kiếm!</p>
      </div>
      <div v-else class="posts-list">
        <div
          v-for="post in recentPosts"
          :key="post.id"
          class="post-preview"
        >
          <div class="post-content">{{ post.content.substring(0, 100) }}...</div>
          <div class="post-meta">
            <span>{{ post.authorName }}</span>
            <span>{{ formatDate(post.crawledAt) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { usePostsStore } from '@/stores/posts'
import { useFanpagesStore } from '@/stores/fanpages'
import { useSchedulesStore } from '@/stores/schedules'
import { exportPostsToExcel } from '@/utils/excel-export'

const postsStore = usePostsStore()
const fanpagesStore = useFanpagesStore()
const schedulesStore = useSchedulesStore()

const recentPosts = computed(() => postsStore.posts.slice(0, 5))

onMounted(async () => {
  await Promise.all([
    postsStore.loadPosts(),
    fanpagesStore.loadFanpages(),
    schedulesStore.loadSchedules()
  ])
})

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('vi-VN')
}

async function syncFanpages() {
  await fanpagesStore.syncFanpages()
}

function openFacebook() {
  chrome.tabs.create({ url: 'https://facebook.com' })
}

function exportToExcel() {
  if (postsStore.posts.length === 0) {
    alert('Chưa có dữ liệu bài viết để xuất!')
    return
  }
  exportPostsToExcel(postsStore.posts)
}
</script>

<style scoped>
.dashboard {
  padding-bottom: 20px;
}

h1 {
  margin: 0 0 20px 0;
  font-size: 24px;
  color: #24292e;
}

h2 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #24292e;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  font-size: 32px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #0366d6;
}

.stat-label {
  font-size: 13px;
  color: #586069;
}

.quick-actions {
  margin-bottom: 24px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.action-btn {
  background: #fff;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f6f8fa;
  border-color: #0366d6;
  color: #0366d6;
}

.btn-icon {
  font-size: 18px;
}

.recent-posts {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.posts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.post-preview {
  padding: 12px;
  background: #f6f8fa;
  border-radius: 6px;
  border-left: 3px solid #0366d6;
}

.post-content {
  font-size: 13px;
  color: #24292e;
  margin-bottom: 8px;
}

.post-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #586069;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #586069;
}
</style>
