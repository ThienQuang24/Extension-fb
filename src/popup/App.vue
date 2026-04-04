<template>
  <div class="app">
    <!-- Navigation -->
    <nav class="nav">
      <router-link to="/" class="nav-item">
        <span class="icon">📊</span>
        <span>Dashboard</span>
      </router-link>
      <router-link to="/search" class="nav-item">
        <span class="icon">🔍</span>
        <span>Tìm kiếm</span>
      </router-link>
      <router-link to="/fanpages" class="nav-item">
        <span class="icon">📄</span>
        <span>Fanpage</span>
      </router-link>
      <router-link to="/keywords" class="nav-item">
        <span class="icon">🏷️</span>
        <span>Từ khóa</span>
      </router-link>
      <router-link to="/schedule" class="nav-item">
        <span class="icon">📅</span>
        <span>Lịch đăng</span>
      </router-link>
      <router-link to="/guide" class="nav-item">
        <span class="icon">ℹ️</span>
        <span>Hướng dẫn</span>
      </router-link>
    </nav>

    <!-- Main Content -->
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { onMessage } from '@/utils/message-bridge'
import { usePostsStore } from '@/stores/posts'

const postsStore = usePostsStore()

// Listen for messages from background
onMounted(() => {
  onMessage((message) => {
    if (message.type === 'SEARCH_PROGRESS') {
      postsStore.updateSearchProgress(message.data.count)
    }
  })
})
</script>

<style scoped>
.app {
  width: 600px;
  height: 600px;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.nav {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #e1e4e8;
  padding: 0;
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  text-decoration: none;
  color: #586069;
  font-size: 11px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.nav-item:hover {
  background: #f6f8fa;
  color: #0366d6;
}

.nav-item.router-link-active {
  color: #0366d6;
  border-bottom-color: #0366d6;
}

.nav-item .icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
</style>
