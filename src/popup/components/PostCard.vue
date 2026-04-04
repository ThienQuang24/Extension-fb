<template>
  <div class="post-card">
    <div class="post-header">
      <div class="author">
        <strong>{{ post.authorName }}</strong>
      </div>
      <div class="status-badge" :class="post.published ? 'published' : 'unpublished'">
        {{ post.published ? '✅ Đã đăng' : '⏳ Chưa đăng' }}
      </div>
    </div>

    <div class="post-content">
      {{ post.content.substring(0, 200) }}{{ post.content.length > 200 ? '...' : '' }}
    </div>

    <div v-if="post.images.length > 0" class="post-images">
      <img
        v-for="(image, index) in post.images.slice(0, 3)"
        :key="index"
        :src="image"
        alt="Post image"
      />
      <div v-if="post.images.length > 3" class="more-images">
        +{{ post.images.length - 3 }}
      </div>
    </div>

    <div class="post-meta">
      <span>{{ formatDate(post.crawledAt) }}</span>
      <span v-if="post.keywordUsed">🏷️ {{ post.keywordUsed }}</span>
    </div>

    <div class="post-actions">
      <button @click="$emit('schedule', post)" class="btn-action">
        📅 Lên lịch
      </button>
      <a :href="post.postUrl" target="_blank" class="btn-action">
        🔗 Xem gốc
      </a>
      <button @click="$emit('delete', post.id)" class="btn-action btn-danger">
        🗑️ Xóa
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Post } from '@/db/schema'

defineProps<{
  post: Post
}>()

defineEmits<{
  delete: [id: number]
  schedule: [post: Post]
}>()

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.post-card {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 12px;
  border-left: 3px solid #0366d6;
}

.post-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.author {
  font-size: 13px;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
}

.status-badge.published {
  background: #dcffe4;
  color: #22863a;
}

.status-badge.unpublished {
  background: #fff4e0;
  color: #b08800;
}

.post-content {
  font-size: 13px;
  color: #24292e;
  margin-bottom: 8px;
  line-height: 1.5;
}

.post-images {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
  position: relative;
}

.post-images img {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.more-images {
  width: 60px;
  height: 60px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
}

.post-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #586069;
  margin-bottom: 8px;
}

.post-actions {
  display: flex;
  gap: 4px;
}

.btn-action {
  flex: 1;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e1e4e8;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  text-decoration: none;
  color: #24292e;
  text-align: center;
  transition: all 0.2s;
}

.btn-action:hover {
  background: #f6f8fa;
  border-color: #0366d6;
}

.btn-action.btn-danger:hover {
  background: #ffeef0;
  border-color: #d73a49;
  color: #d73a49;
}
</style>
