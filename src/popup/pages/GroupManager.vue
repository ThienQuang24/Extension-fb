<template>
  <div class="group-manager">
    <div class="header">
      <div class="title-section">
        <h2 class="title">Quản lý Nhóm</h2>
        <p class="subtitle">Danh sách các nhóm đã tham gia</p>
      </div>
      <button 
        class="btn btn-primary sync-btn" 
        :disabled="groupsStore.isSyncing"
        @click="syncGroups"
      >
        <span v-if="groupsStore.isSyncing" class="spinner"></span>
        <span v-else>🔄</span>
        {{ groupsStore.isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Nhóm' }}
      </button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-value">{{ groupsStore.totalGroups }}</span>
        <span class="stat-label">Tổng nhóm</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ groupsStore.enabledGroupsCount }}</span>
        <span class="stat-label">Đã bật</span>
      </div>
    </div>

    <!-- Bulk Actions -->
    <div class="bulk-actions">
      <button class="btn-text" @click="setAllGroupsStatus(true)">🚀 Bật tất cả</button>
      <button class="btn-text" @click="setAllGroupsStatus(false)">🛑 Tắt tất cả</button>
      <button class="btn-text btn-danger-text" @click="confirmDeleteAll">🗑️ Xóa hết nhóm</button>
    </div>

    <!-- Search/Filter -->
    <div class="filter-bar">
      <div class="search-input">
        <span class="search-icon">🔍</span>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Tìm tên nhóm hoặc ID..."
        />
      </div>
      <button 
        v-if="searchQuery && filteredJoined.length > 0" 
        class="btn btn-outline btn-sm"
        @click="enableOnlyFiltered"
      >
        🎯 Chỉ bật kết quả này
      </button>
    </div>

    <!-- Two-Column Group List -->

      <!-- Column 2: Joined Groups -->
    <div class="list-section single-column">
      <div class="section-header">
         <span class="section-icon">👤</span>
         <span class="section-title">Danh sách nhóm ({{ joinedGroups.length }})</span>
      </div>
      <div class="group-list">
        <div v-if="filteredJoined.length === 0" class="empty-mini">
          {{ searchQuery ? 'Không tìm thấy nhóm nào' : 'Chưa có dữ liệu nhóm' }}
        </div>
        <div 
          v-for="group in filteredJoined" 
          :key="group.id" 
          class="group-card"
          :class="{ 'disabled': !group.enabled }"
        >
          <div class="group-info">
            <h3 class="group-name">{{ group.name }}</h3>
            <p class="group-url">{{ group.fbGroupId }}</p>
          </div>
          <div class="group-actions">
            <a :href="group.url" target="_blank" class="action-btn link-btn">🔗</a>
            <div class="toggle-switch">
              <input :id="'toggle-' + group.id" type="checkbox" :checked="group.enabled" @change="toggleGroup(group)" />
              <label :for="'toggle-' + group.id"></label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Group } from '@/db/schema'
import { useGroupsStore } from '@/stores/groups'

const groupsStore = useGroupsStore()
const searchQuery = ref('')

const joinedGroups = computed(() => groupsStore.groups)

const filteredJoined = computed(() => {
  if (!searchQuery.value) return joinedGroups.value
  const query = searchQuery.value.toLowerCase()
  return joinedGroups.value.filter(g => g.name.toLowerCase().includes(query) || g.fbGroupId.includes(query))
})

const toggleGroup = async (group: Group) => {
  await groupsStore.toggleGroup(group.id!)
}

const setAllGroupsStatus = async (status: boolean) => {
  await groupsStore.setAllGroupsStatus(status)
}

const confirmDeleteAll = async () => {
  if (confirm('Bạn có chắc chắn muốn xóa TẤT CẢ các nhóm khỏi cơ sở dữ liệu? Hành động này không thể hoàn tác.')) {
    await groupsStore.deleteAllGroups()
  }
}

const enableOnlyFiltered = async () => {
  if (!searchQuery.value) return
  
  const filteredIds = filteredJoined.value.map(g => g.id!)
  const allGroups = groupsStore.groups
  
  for (const g of allGroups) {
      const shouldEnable = filteredIds.includes(g.id!)
      if (g.enabled !== shouldEnable) {
          await groupsStore.updateGroup(g.id!, { enabled: shouldEnable })
      }
  }
}

const syncGroups = async () => {
  try {
    await groupsStore.syncGroups()
  } catch (error) {
    console.error('Failed to sync groups:', error)
    alert('Không thể bắt đầu đồng bộ. Hãy chắc chắn bạn đã đăng nhập Facebook.')
  }
}

onMounted(groupsStore.loadGroups)
</script>

<style scoped>
.group-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1f36;
  margin: 0;
}

.subtitle {
  font-size: 13px;
  color: #697386;
  margin: 4px 0 0 0;
}

.stats-row {
  display: flex;
  gap: 12px;
}

.stat-card {
  flex: 1;
  background: white;
  padding: 12px;
  border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid #eef1f5;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #0366d6;
}

.stat-label {
  font-size: 11px;
  color: #697386;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-bar {
  background: white;
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid #eef1f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.bulk-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 4px;
}

.btn-text {
  background: none;
  border: none;
  color: #0366d6;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-text:hover {
  background: #0366d611;
  text-decoration: underline;
}

.btn-danger-text {
  color: #dc3545 !important;
}

.btn-danger-text:hover {
  background: #dc354511 !important;
  color: #c82333 !important;
}

.btn-outline {
  background: white;
  border: 1px solid #0366d6;
  color: #0366d6;
}

.btn-outline:hover {
  background: #0366d608;
  border-color: #0255b3;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.search-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-icon {
  color: #8792a2;
}

.search-input input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  color: #1a1f36;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 600px) {
  .group-grid {
    grid-template-columns: 1fr;
  }
}

.list-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-bottom: 2px solid #eef1f5;
  margin-bottom: 4px;
}

.section-icon {
  font-size: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #4f566b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-card {
  background: white;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #eef1f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
}

.group-card.managed {
  border-left: 4px solid #f59e0b; /* Gold/Amber for admin */
}

.group-card:hover {
  border-color: #0366d633;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
}

.group-card.disabled {
  opacity: 0.6;
  background: #fbfbfc;
}

.group-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1f36;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.group-url {
  font-size: 10px;
  color: #8792a2;
  margin: 2px 0 0 0;
  font-family: monospace;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  text-decoration: none;
  background: #f6f8fa;
  font-size: 12px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #eef1f5;
  transform: scale(1.05);
}

/* UI Components */
.btn {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn-primary {
  background: #0366d6;
  color: white;
}

.btn-primary:hover {
  background: #0255b3;
  box-shadow: 0 4px 12px rgba(3, 102, 214, 0.3);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch label {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #ccc;
  border-radius: 34px;
  cursor: pointer;
  transition: .4s;
}

.toggle-switch label:before {
  position: absolute;
  content: "";
  height: 14px; width: 14px;
  left: 3px; bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: .4s;
}

.toggle-switch input:checked + label {
  background-color: #0366d6;
}

.toggle-switch input:checked + label:before {
  transform: translateX(16px);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: rotate 0.8s linear infinite;
}

@keyframes rotate {
  to { transform: rotate(360deg); }
}

.empty-mini {
  padding: 20px;
  text-align: center;
  background: #f8f9fa;
  border-radius: 12px;
  border: 1px dashed #d1d9e0;
  font-size: 12px;
  color: #8792a2;
}

.hint {
  font-size: 12px;
  color: #8792a2;
}
</style>
