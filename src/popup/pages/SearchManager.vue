<template>
  <div class="search-manager">
    <h1>Tìm kiếm & Crawl bài viết</h1>

    <!-- Search Form -->
    <div class="search-form">
      <div class="mode-switch">
        <button 
          :class="{ active: searchMode === 'keyword' }"
          @click="searchMode = 'keyword'"
          class="mode-btn"
          :disabled="postsStore.isSearching"
        >Tìm từ khóa</button>
        <button 
          :class="{ active: searchMode === 'group' }"
          @click="searchMode = 'group'"
          class="mode-btn"
          :disabled="postsStore.isSearching"
        >Quét Group</button>
        <button 
          :class="{ active: searchMode === 'matrix' }"
          @click="searchMode = 'matrix'"
          class="mode-btn"
          :disabled="postsStore.isSearching"
        >Tìm kiếm Ma trận</button>
      </div>

      <div v-if="searchMode === 'keyword'" class="form-group">
        <label>Từ khóa tìm kiếm:</label>
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="Nhập từ khóa..."
          @keyup.enter="startSearch"
          :disabled="postsStore.isSearching"
        />
      </div>

      <div v-if="searchMode === 'group'" class="form-group">
        <label>Danh sách Link Group (Mỗi dòng 1 link):</label>
        <textarea
          v-model="groupLinks"
          rows="5"
          placeholder="https://www.facebook.com/groups/...&#10;https://www.facebook.com/groups/..."
          :disabled="postsStore.isSearching"
        ></textarea>
        <div class="help-text">Tool sẽ tự động vào từng group và quét cho đến khi bạn bấm dừng.</div>
      </div>

      <div v-if="searchMode === 'matrix'" class="form-group">
        <label>Danh sách từ khóa (Mỗi dòng 1 từ khóa):</label>
        <textarea
          v-model="matrixKeywords"
          rows="4"
          placeholder="react&#10;vue&#10;angular"
          :disabled="postsStore.isSearching"
        ></textarea>
        
        <label style="margin-top: 10px;">Danh sách Link Group (Mỗi dòng 1 link):</label>
        <textarea
          v-model="matrixGroups"
          rows="4"
          placeholder="https://www.facebook.com/groups/javascript&#10;https://www.facebook.com/groups/webdev"
          :disabled="postsStore.isSearching"
        ></textarea>
        
        <div style="margin-top: 10px;">
          <label style="display: inline-flex; align-items: center; cursor: pointer;">
            <input 
              type="checkbox" 
              v-model="includeGeneralSearch"
              :disabled="postsStore.isSearching"
              style="margin-right: 8px;"
            />
            Bao gồm tìm kiếm chung (mỗi từ khóa)
          </label>
        </div>
        
        <div class="help-text">
          Tool sẽ tìm kiếm mỗi từ khóa trong {{ includeGeneralSearch ? 'tìm kiếm chung + ' : '' }}từng group.
          <br>Ví dụ: 2 từ khóa × 2 groups {{ includeGeneralSearch ? '+ chung' : '' }} = {{ matrixSearchCount }} tìm kiếm
        </div>
      </div>

      <div class="form-group">
        <label>Số bài tối đa (mỗi group/tìm kiếm):</label>
        <input
          v-model.number="maxPosts"
          type="number"
          placeholder="50"
          :disabled="postsStore.isSearching"
        />
      </div>

      <div class="form-actions">
        <button
          v-if="!postsStore.isSearching"
          @click="startSearch"
          class="btn btn-primary"
          :disabled="!canStart"
        >
          <span v-if="searchMode === 'keyword'">🔍 Bắt đầu tìm kiếm</span>
          <span v-else-if="searchMode === 'group'">🚀 Bắt đầu quét Group</span>
          <span v-else>🎯 Bắt đầu tìm kiếm Ma trận ({{ matrixSearchCount }} tìm kiếm)</span>
        </button>
        <button
          v-else
          @click="stopSearch"
          class="btn btn-danger"
        >
          ⏹️ Dừng lại (Stop)
        </button>
      </div>
    </div>

    <!-- Progress -->
    <div v-if="postsStore.isSearching" class="progress-section">
      <div class="progress-info">
        <span>Đang chạy...</span>
        <span>{{ postsStore.searchProgress }} bài</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill indeterminate"></div>
      </div>
    </div>

    <!-- Posts List -->
    <div class="posts-section">
      <div class="section-header">
        <h2>Bài viết đã crawl ({{ filteredPosts.length }})</h2>
        <div class="header-actions">
          <select v-model="filterStatus">
            <option value="all">Tất cả</option>
            <option value="published">Đã đăng</option>
            <option value="unpublished">Chưa đăng</option>
          </select>
          <button @click="clearAll" class="btn btn-sm">Xóa tất cả</button>
        </div>
      </div>

      <div v-if="filteredPosts.length === 0" class="empty-state">
        <p>Chưa có bài viết nào</p>
      </div>

      <div v-else class="posts-grid">
        <PostCard
          v-for="post in filteredPosts"
          :key="post.id"
          :post="post"
          @delete="deletePost"
          @schedule="schedulePost"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { usePostsStore } from '@/stores/posts'
import { useRouter } from 'vue-router'
import PostCard from '@/popup/components/PostCard.vue'

const postsStore = usePostsStore()
const router = useRouter()

// LocalStorage keys
const STORAGE_KEYS = {
  searchMode: 'fb_search_mode',
  searchKeyword: 'fb_search_keyword',
  groupLinks: 'fb_group_links',
  matrixKeywords: 'fb_matrix_keywords',
  matrixGroups: 'fb_matrix_groups',
  includeGeneralSearch: 'fb_include_general',
  maxPosts: 'fb_max_posts'
}

const searchMode = ref<'keyword' | 'group' | 'matrix'>('keyword')
const searchKeyword = ref('')
const groupLinks = ref('')
const matrixKeywords = ref('')
const matrixGroups = ref('')
const includeGeneralSearch = ref(true)
const maxPosts = ref(5000)
const filterStatus = ref('all')

// Load saved values from localStorage
function loadSavedInputs() {
  try {
    const savedMode = localStorage.getItem(STORAGE_KEYS.searchMode)
    if (savedMode) searchMode.value = savedMode as any

    const savedKeyword = localStorage.getItem(STORAGE_KEYS.searchKeyword)
    if (savedKeyword) searchKeyword.value = savedKeyword

    const savedGroupLinks = localStorage.getItem(STORAGE_KEYS.groupLinks)
    if (savedGroupLinks) groupLinks.value = savedGroupLinks

    const savedMatrixKeywords = localStorage.getItem(STORAGE_KEYS.matrixKeywords)
    if (savedMatrixKeywords) matrixKeywords.value = savedMatrixKeywords

    const savedMatrixGroups = localStorage.getItem(STORAGE_KEYS.matrixGroups)
    if (savedMatrixGroups) matrixGroups.value = savedMatrixGroups

    const savedIncludeGeneral = localStorage.getItem(STORAGE_KEYS.includeGeneralSearch)
    if (savedIncludeGeneral !== null) includeGeneralSearch.value = savedIncludeGeneral === 'true'

    const savedMaxPosts = localStorage.getItem(STORAGE_KEYS.maxPosts)
    if (savedMaxPosts) maxPosts.value = parseInt(savedMaxPosts)
  } catch (error) {
    console.error('Error loading saved inputs:', error)
  }
}

// Auto-save inputs to localStorage
watch(searchMode, (val) => localStorage.setItem(STORAGE_KEYS.searchMode, val))
watch(searchKeyword, (val) => localStorage.setItem(STORAGE_KEYS.searchKeyword, val))
watch(groupLinks, (val) => localStorage.setItem(STORAGE_KEYS.groupLinks, val))
watch(matrixKeywords, (val) => localStorage.setItem(STORAGE_KEYS.matrixKeywords, val))
watch(matrixGroups, (val) => localStorage.setItem(STORAGE_KEYS.matrixGroups, val))
watch(includeGeneralSearch, (val) => localStorage.setItem(STORAGE_KEYS.includeGeneralSearch, String(val)))
watch(maxPosts, (val) => localStorage.setItem(STORAGE_KEYS.maxPosts, String(val)))

const canStart = computed(() => {
  if (searchMode.value === 'keyword') return !!searchKeyword.value
  if (searchMode.value === 'group') return !!groupLinks.value.trim()
  if (searchMode.value === 'matrix') {
    return !!matrixKeywords.value.trim() && !!matrixGroups.value.trim()
  }
  return false
})

const matrixSearchCount = computed(() => {
  if (searchMode.value !== 'matrix') return 0
  const keywords = matrixKeywords.value.split('\n').filter(k => k.trim()).length
  const groups = matrixGroups.value.split('\n').filter(g => g.trim()).length
  const generalSearches = includeGeneralSearch.value ? keywords : 0
  return generalSearches + (keywords * groups)
})

const filteredPosts = computed(() => {
  if (filterStatus.value === 'published') {
    return postsStore.publishedPosts
  } else if (filterStatus.value === 'unpublished') {
    return postsStore.unpublishedPosts
  }
  return postsStore.posts
})

onMounted(async () => {
  loadSavedInputs() // Load saved inputs first
  await postsStore.loadPosts()
  await postsStore.syncSearchStatus() // Sync search status with background
})

async function startSearch() {
  if (!canStart.value) return
  
  let config: any = { maxPosts: maxPosts.value }
  
  if (searchMode.value === 'keyword') {
    config.keyword = searchKeyword.value
    config.mode = 'KEYWORD'
    
    // Legacy behavior: open tab immediately
    const success = await postsStore.startSearch(config)
    if (success) {
      const tabs = await chrome.tabs.query({ active: true })
      if (tabs[0]?.id) {
        chrome.tabs.update(tabs[0].id, {
          url: `https://www.facebook.com/search/posts?q=${encodeURIComponent(searchKeyword.value)}`
        })
      }
    }
  } else if (searchMode.value === 'group') {
    // Group Mode
    const urls = groupLinks.value.split('\n').map(u => u.trim()).filter(u => u.includes('facebook.com'))
    if (urls.length === 0) {
      alert('Vui lòng nhập ít nhất 1 link Facebook hợp lệ!')
      return
    }
    config.groupUrls = urls
    config.mode = 'GROUP'
    
    await postsStore.startSearch(config)
    // Navigation is handled by background script
  } else if (searchMode.value === 'matrix') {
    // Matrix Mode
    const keywords = matrixKeywords.value.split('\n').map(k => k.trim()).filter(k => k.length > 0)
    const groups = matrixGroups.value.split('\n').map(g => g.trim()).filter(g => g.includes('facebook.com'))
    
    if (keywords.length === 0) {
      alert('Vui lòng nhập ít nhất 1 từ khóa!')
      return
    }
    if (groups.length === 0) {
      alert('Vui lòng nhập ít nhất 1 link Group!')
      return
    }
    
    config.keywords = keywords
    config.groupUrls = groups
    config.includeGeneralSearch = includeGeneralSearch.value
    config.mode = 'MATRIX'
    
    await postsStore.startSearch(config)
    // Matrix queue processing is handled by background script
  }
}

async function stopSearch() {
  await postsStore.stopSearch()
}

async function deletePost(id: number) {
  if (confirm('Xóa bài viết này?')) {
    await postsStore.deletePost(id)
  }
}

function schedulePost(post: any) {
  router.push({
    name: 'schedule',
    query: { postId: post.id }
  })
}

async function clearAll() {
  if (confirm('Xóa tất cả bài viết đã crawl?')) {
    await postsStore.clearAllPosts()
  }
}
</script>

<style scoped>
.search-manager {
  padding-bottom: 20px;
}

h1 {
  margin: 0 0 20px 0;
  font-size: 24px;
  color: #24292e;
}

h2 {
  margin: 0;
  font-size: 18px;
  color: #24292e;
}

.search-form {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.mode-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f6f8fa;
  padding: 4px;
  border-radius: 6px;
}

.mode-btn {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: #586069;
}

.mode-btn.active {
  background: #fff;
  color: #0366d6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #24292e;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
  font-family: monospace;
  font-size: 13px;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #0366d6;
}

.help-text {
  font-size: 11px;
  color: #6a737d;
  margin-top: 4px;
}

.form-actions {
  margin-top: 16px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #0366d6;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #0256c7;
}

.btn-danger {
  background: #d73a49;
  color: #fff;
}

.btn-danger:hover {
  background: #cb2431;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #e1e4e8;
}

.btn-sm:hover {
  background: #f6f8fa;
}

.progress-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: #586069;
}

.progress-bar {
  height: 8px;
  background: #e1e4e8;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0366d6, #0256c7);
  transition: width 0.3s;
}

.progress-fill.indeterminate {
  width: 100%;
  background: linear-gradient(90deg, #0366d6 0%, #28a745 50%, #0366d6 100%);
  background-size: 200% 100%;
  animation: loading 2s infinite linear;
}

@keyframes loading {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.posts-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-actions select {
  padding: 6px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 13px;
}

.posts-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #586069;
}
</style>
