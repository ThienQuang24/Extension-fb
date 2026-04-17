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
    </div>

    <!-- Search/Filter -->
    <div class="filter-bar">
      <div class="search-input">
        <span class="search-icon">🔍</span>
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Tìm kiếm nhóm..."
        />
      </div>
      <button 
        v-if="searchQuery && filteredGroups.length > 0" 
        class="btn btn-outline btn-sm"
        @click="enableOnlyFiltered"
      >
        🎯 Chỉ bật kết quả này
      </button>
    </div>

    <!-- Group List -->
    <div class="group-list">
      <div v-if="filteredGroups.length === 0" class="empty-state">
        <div class="empty-icon">👥</div>
        <p v-if="searchQuery">Không tìm thấy nhóm nào khớp với "{{ searchQuery }}"</p>
        <div v-else>
          <p>Chưa có danh sách nhóm.</p>
          <p class="hint">Nhấn "Đồng bộ Nhóm" để lấy danh sách từ Facebook.</p>
        </div>
      </div>

      <div 
        v-for="group in filteredGroups" 
        :key="group.id" 
        class="group-card"
        :class="{ 'disabled': !group.enabled }"
      >
        <div class="group-info">
          <div class="group-meta">
            <h3 class="group-name">{{ group.name }}</h3>
            <p class="group-url">{{ group.fbGroupId }}</p>
          </div>
        </div>
        
        <div class="group-actions">
          <a :href="group.url" target="_blank" class="action-btn link-btn" title="Mở trên FB">🔗</a>
          <div class="toggle-switch">
            <input 
              :id="'toggle-' + group.id" 
              type="checkbox" 
              :checked="group.enabled"
              @change="toggleGroup(group)"
            />
            <label :for="'toggle-' + group.id"></label>
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

const filteredGroups = computed(() => {
  if (!searchQuery.value) return groupsStore.groups
  const query = searchQuery.value.toLowerCase()
  return groupsStore.groups.filter(g => 
    g.name.toLowerCase().includes(query) || 
    g.fbGroupId.includes(query)
  )
})

const toggleGroup = async (group: Group) => {
  await groupsStore.toggleGroup(group.id!)
}

const setAllGroupsStatus = async (status: boolean) => {
  await groupsStore.setAllGroupsStatus(status)
}

const enableOnlyFiltered = async () => {
  if (!searchQuery.value) return
  
  const filteredIds = filteredGroups.value.map(g => g.id!)
  const allGroups = groupsStore.groups
  
  // Custom logic for filtering remains here but uses groupsStore.updateGroup
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

.group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.group-card {
  background: white;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #eef1f5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.2s;
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
  font-size: 15px;
  font-weight: 600;
  color: #1a1f36;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.group-url {
  font-size: 11px;
  color: #8792a2;
  margin: 2px 0 0 0;
  font-family: monospace;
}

.group-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  text-decoration: none;
  background: #f6f8fa;
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
  width: 40px;
  height: 22px;
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
  height: 16px; width: 16px;
  left: 3px; bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: .4s;
}

.toggle-switch input:checked + label {
  background-color: #0366d6;
}

.toggle-switch input:checked + label:before {
  transform: translateX(18px);
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

.empty-state {
  padding: 40px 20px;
  text-align: center;
  background: white;
  border-radius: 12px;
  border: 1px dashed #d1d9e0;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.hint {
  font-size: 12px;
  color: #8792a2;
}
</style>
