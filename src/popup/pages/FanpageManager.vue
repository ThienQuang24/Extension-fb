<template>
  <div class="fanpage-manager">
    <h1>Quản lý Fanpage</h1>

    <div class="sync-section">
      <button @click="sync" class="btn btn-primary" :disabled="fanpagesStore.isSyncing">
        {{ fanpagesStore.isSyncing ? '🔄 Đang sync...' : '🔄 Sync Fanpages' }}
      </button>
      <p class="hint">Lấy danh sách fanpage từ tài khoản Facebook đã đăng nhập</p>
    </div>

    <div class="fanpages-list">
      <h2>Danh sách Fanpage ({{ fanpagesStore.fanpages.length }})</h2>

      <div v-if="fanpagesStore.fanpages.length === 0" class="empty-state">
        <p>Chưa có fanpage nào. Click "Sync Fanpages" để lấy danh sách.</p>
      </div>

      <div v-else class="fanpages-grid">
        <div
          v-for="fanpage in fanpagesStore.fanpages"
          :key="fanpage.id"
          class="fanpage-card"
        >
          <div class="fanpage-header">
            <div>
              <strong>{{ fanpage.name }}</strong>
              <div class="fanpage-uid">
                🆔 UID: {{ fanpage.fbPageId }}
              </div>
              <div class="fanpage-stats">
                <span>📊 {{ fanpage.totalPosts }} bài</span>
                <span v-if="fanpage.lastPostAt">
                  📅 {{ formatDate(fanpage.lastPostAt) }}
                </span>
              </div>
            </div>
            <label class="toggle">
              <input
                type="checkbox"
                :checked="fanpage.enabled"
                @change="toggleFanpage(fanpage.id!)"
              />
              <span class="slider"></span>
            </label>
          </div>

          <div v-if="fanpage.enabled" class="fanpage-settings">
            <div class="setting-row">
              <label>Khoảng cách đăng (phút):</label>
              <input
                type="number"
                :value="fanpage.postInterval"
                @input="updateInterval(fanpage.id!, $event)"
                min="30"
              />
            </div>
            <div class="setting-row">
              <label>Giới hạn bài/ngày:</label>
              <input
                type="number"
                :value="fanpage.dailyLimit"
                @input="updateDailyLimit(fanpage.id!, $event)"
                min="1"
                max="50"
              />
            </div>
            <div class="setting-row">
              <label>Giờ hoạt động:</label>
              <div class="time-range">
                <input
                  type="number"
                  :value="fanpage.activeHoursStart"
                  @input="updateActiveStart(fanpage.id!, $event)"
                  min="0"
                  max="23"
                />
                <span>-</span>
                <input
                  type="number"
                  :value="fanpage.activeHoursEnd"
                  @input="updateActiveEnd(fanpage.id!, $event)"
                  min="0"
                  max="23"
                />
              </div>
            </div>
          </div>

          <div class="fanpage-actions">
            <a :href="fanpage.url" target="_blank" class="btn-sm">
              🔗 Xem fanpage
            </a>
            <button @click="deleteFanpage(fanpage.id!)" class="btn-sm btn-danger">
              🗑️ Xóa
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useFanpagesStore } from '@/stores/fanpages'

const fanpagesStore = useFanpagesStore()

onMounted(async () => {
  await fanpagesStore.loadFanpages()
})

async function sync() {
  await fanpagesStore.syncFanpages()
}

async function toggleFanpage(id: number) {
  await fanpagesStore.toggleFanpage(id)
}

async function updateInterval(id: number, event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value)
  await fanpagesStore.updateFanpage(id, { postInterval: value })
}

async function updateDailyLimit(id: number, event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value)
  await fanpagesStore.updateFanpage(id, { dailyLimit: value })
}

async function updateActiveStart(id: number, event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value)
  await fanpagesStore.updateFanpage(id, { activeHoursStart: value })
}

async function updateActiveEnd(id: number, event: Event) {
  const value = parseInt((event.target as HTMLInputElement).value)
  await fanpagesStore.updateFanpage(id, { activeHoursEnd: value })
}

async function deleteFanpage(id: number) {
  if (confirm('Xóa fanpage này?')) {
    await fanpagesStore.deleteFanpage(id)
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit'
  })
}
</script>

<style scoped>
.fanpage-manager {
  padding-bottom: 20px;
}

h1, h2 {
  margin: 0 0 16px 0;
  color: #24292e;
}

h1 {
  font-size: 24px;
}

h2 {
  font-size: 18px;
}

.sync-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.hint {
  margin: 8px 0 0 0;
  font-size: 12px;
  color: #586069;
}

.fanpages-list {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.fanpages-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 450px;
  overflow-y: auto;
}

.fanpage-card {
  background: #f6f8fa;
  border-radius: 6px;
  padding: 12px;
  border-left: 3px solid #28a745;
}

.fanpage-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.fanpage-stats {
  display: flex;
  gap: 12px;
  margin-top: 4px;
  font-size: 11px;
  color: #586069;
}

.fanpage-uid {
  margin-top: 2px;
  font-size: 10px;
  color: #0366d6;
  font-family: monospace;
  background: #f1f8ff;
  padding: 2px 6px;
  border-radius: 3px;
  display: inline-block;
  margin-bottom: 4px;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.4s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.4s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #28a745;
}

input:checked + .slider:before {
  transform: translateX(20px);
}

.fanpage-settings {
  padding: 12px;
  background: #fff;
  border-radius: 4px;
  margin-bottom: 8px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.setting-row label {
  color: #586069;
}

.setting-row input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #e1e4e8;
  border-radius: 4px;
  font-size: 12px;
}

.time-range {
  display: flex;
  gap: 4px;
  align-items: center;
}

.time-range input {
  width: 50px;
}

.fanpage-actions {
  display: flex;
  gap: 4px;
}

.btn, .btn-sm {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #0366d6;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #0256c7;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #e1e4e8;
  text-decoration: none;
  color: #24292e;
}

.btn-sm:hover {
  background: #f6f8fa;
}

.btn-sm.btn-danger:hover {
  background: #ffeef0;
  border-color: #d73a49;
  color: #d73a49;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #586069;
}
</style>
