<template>
  <div class="schedule-manager">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">Lịch đăng bài</h1>
        <p class="page-subtitle">Quản lý và lập lịch nội dung tự động</p>
      </div>
      <div class="header-status">
        <span class="status-badge" :class="{ 'active': unpublishedPosts.length > 0 }">
          {{ unpublishedPosts.length }} bài chờ đăng
        </span>
      </div>
    </div>

    <!-- GLOBAL CONFIG -->
    <div class="config-card glass-panel">
      <label class="premium-checkbox">
        <input type="checkbox" v-model="includeAuthor" @change="saveSettings" />
        <span class="checkmark"></span>
        <span class="label-text">Tự động thêm tên tác giả vào cuối bài viết</span>
      </label>
    </div>

    <!-- MAIN TOOLS -->
    <div class="tools-grid">
      <!-- SMART SCHEDULER -->
      <div class="tool-card smart-scheduler">
        <div class="card-header">
          <div class="icon-circle">🤖</div>
          <div class="text-group">
            <h3>Smart Scheduler</h3>
            <p>Tự động lên lịch tối ưu cho bài viết</p>
          </div>
        </div>

        <div class="card-content">
          <div class="form-group">
            <label>1. Chọn bài viết cần đăng:</label>
            <div class="selection-box scrollable">
              <template v-if="unpublishedPosts.length > 0">
                <div v-for="p in unpublishedPosts" :key="p.id" class="target-chip">
                  <input type="checkbox" :id="'auto-p-'+p.id" :value="p.id" v-model="selectedPostIdsForAuto" />
                  <label :for="'auto-p-'+p.id" class="post-chip-label">
                    [{{ p.authorName }}] {{ p.content.substring(0, 30) }}...
                  </label>
                </div>
              </template>
              <div v-else class="empty-warning">⚠️ Không có bài viết nào chưa đăng.</div>
            </div>
          </div>

          <div class="form-group">
            <label>2. Đăng vào đâu?</label>
            <div class="segmented-control">
              <button 
                :class="{ active: autoTargetType === 'FANPAGE' }" 
                @click="autoTargetType = 'FANPAGE'"
              >📄 Fanpage</button>
              <button 
                :class="{ active: autoTargetType === 'GROUP' }" 
                @click="autoTargetType = 'GROUP'"
              >👥 Nhóm</button>
            </div>
          </div>

          <div class="form-row">
            <div class="input-group">
              <label>Khoảng cách (phút)</label>
              <input type="number" v-model="autoConfig.postInterval" min="1" class="premium-input-small"/>
            </div>
            <div class="input-group">
              <label>Giới hạn/ngày</label>
              <input type="number" v-model="autoConfig.dailyLimit" min="1" class="premium-input-small" />
            </div>
          </div>

          <div class="form-group">
            <label>3. {{ autoTargetType === 'FANPAGE' ? 'Chọn Fanpage đích:' : 'Chọn Nhóm đích:' }}</label>
            <div v-if="autoTargetType === 'FANPAGE'" class="selection-box scrollable">
              <template v-if="enabledFanpages.length > 0">
                <div v-for="f in enabledFanpages" :key="f.id" class="target-chip">
                  <input type="checkbox" :id="'auto-f-'+f.id" :value="f.id" v-model="selectedFanpageIds" />
                  <label :for="'auto-f-'+f.id">{{ f.name }}</label>
                </div>
              </template>
              <div v-else class="empty-warning">⚠️ Không có Fanpage nào đang bật.</div>
            </div>
            <div v-else class="selection-box scrollable">
              <template v-if="enabledGroups.length > 0">
                <div v-for="g in enabledGroups" :key="g.id" class="target-chip">
                  <input type="checkbox" :id="'auto-g-'+g.id" :value="g.id" v-model="selectedGroupIds" />
                  <label :for="'auto-g-'+g.id">{{ g.name }}</label>
                </div>
              </template>
              <div v-else class="empty-warning">⚠️ Không có Nhóm nào đang bật.</div>
            </div>
          </div>

          <!-- Identity Selection - ONLY FOR GROUPS -->
          <div v-if="autoTargetType === 'GROUP'" class="form-group animate-fade">
            <label>Đăng bằng tư cách:</label>
            <select v-model="autoPublisherId" class="premium-select">
              <option value="PERSONAL">Tài khoản cá nhân</option>
              <optgroup label="Dùng Fanpage đăng vào nhóm">
                <option v-for="f in enabledFanpages" :key="f.id" :value="f.fbPageId">
                  Trang: {{ f.name }}
                </option>
              </optgroup>
            </select>
          </div>

          <button 
            class="btn btn-primary btn-block btn-lg" 
            :disabled="!canAutoSchedule"
            @click="autoScheduleAll"
          >
             🚀 Lên lịch cho {{ selectedPostIdsForAuto.length }} bài viết
          </button>
        </div>
      </div>

      <!-- MANUAL SCHEDULER -->
      <div class="tool-card manual-scheduler">
        <div class="card-header">
          <div class="icon-circle">🗓️</div>
          <div class="text-group">
            <h3>Lên lịch thủ công</h3>
            <p>Chọn bài và thời gian cụ thể</p>
          </div>
        </div>

        <div class="card-content">
          <div class="form-group">
            <label>Chọn bài viết:</label>
            <select v-model="selectedPostId" class="premium-select">
              <option value="">-- Chọn bài viết --</option>
              <option v-for="p in unpublishedPosts" :key="p.id" :value="p.id">
                [{{ p.authorName }}] {{ p.content.substring(0, 40) }}...
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Đăng vào đâu?</label>
            <div class="segmented-control">
              <button 
                :class="{ active: manualTargetType === 'FANPAGE' }" 
                @click="manualTargetType = 'FANPAGE'"
              >📄 Fanpage</button>
              <button 
                :class="{ active: manualTargetType === 'GROUP' }" 
                @click="manualTargetType = 'GROUP'"
              >👥 Nhóm</button>
            </div>
          </div>

          <div class="form-group">
            <label>Đích đến:</label>
            <select v-if="manualTargetType === 'FANPAGE'" v-model="selectedFanpageId" class="premium-select">
               <option value="">-- Chọn Fanpage --</option>
               <option v-for="f in enabledFanpages" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
            <select v-else v-model="selectedGroupId" class="premium-select">
               <option value="">-- Chọn Nhóm --</option>
               <option v-for="g in enabledGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>

          <!-- Identity Selection - ONLY FOR GROUPS -->
          <div v-if="manualTargetType === 'GROUP'" class="form-group animate-fade">
            <label>Đăng bằng tư cách:</label>
            <select v-model="manualPublisherId" class="premium-select">
              <option value="PERSONAL">Tài khoản cá nhân</option>
              <optgroup label="Dùng Fanpage đăng vào nhóm">
                <option v-for="f in enabledFanpages" :key="f.id" :value="f.fbPageId">
                  Trang: {{ f.name }}
                </option>
              </optgroup>
            </select>
          </div>

          <div class="form-group">
            <label>Thời gian đăng:</label>
            <input type="datetime-local" v-model="scheduledTime" :min="minDateTime" class="premium-input" />
          </div>

          <button 
            class="btn btn-secondary btn-block" 
            :disabled="!canCreate"
            @click="createSchedule"
          >
            ⚖️ Tạo lịch đăng
          </button>
        </div>
      </div>
    </div>

    <!-- SCHEDULE LIST -->
    <div class="schedule-list-section card">
      <div class="list-tabs">
        <button 
          v-for="tab in (['pending', 'completed', 'failed'] as const)" 
          :key="tab"
          class="tab-link" 
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          {{ tab === 'pending' ? '⌛ Đang chờ' : tab === 'completed' ? '✅ Thành công' : '❌ Thất bại' }}
        </button>
      </div>

      <div class="list-container scrollable-list">
        <div v-if="currentSchedules.length === 0" class="empty-list">
           Chưa có lịch đăng nào trong danh sách.
        </div>
        <div v-for="s in currentSchedules" :key="s.id" class="schedule-item card-item animate-slide">
          <div class="item-main">
            <div class="target-info">
              <span class="type-badge" :class="s.targetType.toLowerCase()">{{ s.targetType === 'FANPAGE' ? 'Page' : 'Nhóm' }}</span>
              <span class="target-name">{{ getTargetName(s) }}</span>
              <span v-if="s.targetType === 'GROUP'" class="pub-badge">🎭 {{ getPublisherName(s.publisherId) }}</span>
            </div>
            <div class="post-preview">
              {{ getPostContent(s.postId) }}
            </div>
            <div v-if="s.error" class="error-text">⚠️ {{ s.error }}</div>
          </div>
          <div class="item-meta">
            <div class="time-box">
              <p class="time-label">{{ s.status === 'pending' ? 'Sắp đăng' : 'Đã đăng' }}</p>
              <p class="time-value">{{ formatTime(s.scheduledAt) }}</p>
            </div>
            <div class="item-actions">
               <button v-if="s.status === 'pending'" class="action-btn play" @click="publishNow(s.id!)" title="Đăng ngay">🚀</button>
               <button class="action-btn delete" @click="deleteSchedule(s.id!)" title="Xóa">🗑️</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { usePostsStore } from '@/stores/posts'
import { useSchedulesStore } from '@/stores/schedules'
import { db, Fanpage, Group, Post } from '@/db/schema'
import { generateAutoSchedule } from '@/utils/auto-scheduler'

const postsStore = usePostsStore()
const schedulesStore = useSchedulesStore()

const unpublishedPosts = ref<Post[]>([])
const enabledFanpages = ref<Fanpage[]>([])
const enabledGroups = ref<Group[]>([])
const includeAuthor = ref(false)

// Manual form state
const selectedPostId = ref<number | ''>('')
const manualTargetType = ref<'FANPAGE' | 'GROUP'>('FANPAGE')
const selectedFanpageId = ref<number | ''>('')
const selectedGroupId = ref<number | ''>('')
const manualPublisherId = ref<string>('PERSONAL')
const scheduledTime = ref('')
const minDateTime = ref(new Date().toISOString().slice(0, 16))

// Auto scheduler state
const autoTargetType = ref<'FANPAGE' | 'GROUP'>('FANPAGE')
const selectedPostIdsForAuto = ref<number[]>([])
const selectedFanpageIds = ref<number[]>([])
const selectedGroupIds = ref<number[]>([])
const autoPublisherId = ref<string>('PERSONAL')
const autoConfig = ref({
  postInterval: 60,
  dailyLimit: 10,
  activeHoursStart: 8,
  activeHoursEnd: 22,
  multiPageStrategy: 'staggered' as 'simultaneous' | 'staggered',
  staggerDelay: 5
})

const activeTab = ref<'pending' | 'completed' | 'failed'>('pending')

const loadData = async () => {
  await postsStore.loadPosts()
  await schedulesStore.loadSchedules()
  
  unpublishedPosts.value = postsStore.posts.filter(p => !p.published)
  
  // FIXED: Query logic for boolean fields in Dexie
  const fps = await db.fanpages.toArray()
  enabledFanpages.value = fps.filter(f => f.enabled)
  
  const grps = await db.groups.toArray()
  enabledGroups.value = grps.filter(g => g.enabled)
  
  const storage = await chrome.storage.local.get('includeAuthor')
  includeAuthor.value = !!storage.includeAuthor
}

onMounted(loadData)

const currentSchedules = computed(() => {
  if (activeTab.value === 'pending') return schedulesStore.pendingSchedules
  if (activeTab.value === 'completed') return schedulesStore.completedSchedules
  return schedulesStore.failedSchedules
})

const canCreate = computed(() => {
  const hasPost = selectedPostId.value !== ''
  const hasTarget = manualTargetType.value === 'FANPAGE' ? selectedFanpageId.value !== '' : selectedGroupId.value !== ''
  return hasPost && hasTarget && scheduledTime.value !== ''
})

const canAutoSchedule = computed(() => {
  if (selectedPostIdsForAuto.value.length === 0) return false
  if (autoTargetType.value === 'FANPAGE') return selectedFanpageIds.value.length > 0
  return selectedGroupIds.value.length > 0
})

async function saveSettings() {
  await chrome.storage.local.set({ includeAuthor: includeAuthor.value })
}

async function createSchedule() {
  if (!canCreate.value) return
  
  const targetId = manualTargetType.value === 'FANPAGE' ? selectedFanpageId.value : selectedGroupId.value
  // Keep original fanpage publisher logic
  const publisherId = manualTargetType.value === 'FANPAGE' ? 'PAGE' : manualPublisherId.value
  
  await schedulesStore.createSchedule(
    selectedPostId.value as number,
    manualTargetType.value,
    targetId as number,
    publisherId,
    new Date(scheduledTime.value)
  )
  
  selectedPostId.value = ''
  scheduledTime.value = ''
  await loadData()
}

async function autoScheduleAll() {
  if (!canAutoSchedule.value) return
  
  const selectedPosts = unpublishedPosts.value.filter(p => selectedPostIdsForAuto.value.includes(p.id!))
  const selectedTargets = autoTargetType.value === 'FANPAGE' 
    ? enabledFanpages.value.filter(f => selectedFanpageIds.value.includes(f.id!))
    : enabledGroups.value.filter(g => selectedGroupIds.value.includes(g.id!))
    
  const slots = generateAutoSchedule(
    selectedPosts,
    selectedTargets as any[],
    autoConfig.value
  )
  
  if (slots.length === 0) return alert('Không thể tạo lịch. Kiểm tra lại cấu hình.')
  
  if (confirm(`Tạo ${slots.length} lượt đăng tự động?`)) {
    const publisherId = autoTargetType.value === 'FANPAGE' ? 'PAGE' : autoPublisherId.value
    for (const slot of slots) {
      await schedulesStore.createSchedule(
        slot.postId,
        autoTargetType.value,
        slot.targetId,
        publisherId,
        slot.scheduledAt
      )
    }
    await loadData()
    selectedPostIdsForAuto.value = []
    selectedFanpageIds.value = []
    selectedGroupIds.value = []
  }
}

async function publishNow(id: number) {
  if (confirm('Đăng bài này ngay bây giờ?')) {
    await schedulesStore.publishNow(id)
    await loadData()
  }
}

async function deleteSchedule(id: number) {
  if (confirm('Xóa lịch đăng này?')) {
    await schedulesStore.deleteSchedule(id)
    await loadData()
  }
}

function getTargetName(s: any) {
  if (s.targetType === 'FANPAGE') {
    return enabledFanpages.value.find(f => f.id === s.fanpageId)?.name || 'Fanpage #' + s.fanpageId
  }
  return enabledGroups.value.find(g => g.id === s.groupId)?.name || 'Nhóm #' + s.groupId
}

function getPublisherName(pubId: string) {
  if (pubId === 'PERSONAL') return 'Cá nhân'
  if (pubId === 'PAGE') return 'Fanpage (Mặc định)'
  return enabledFanpages.value.find(f => f.fbPageId === pubId)?.name || 'Trang ID: ' + pubId
}

function getPostContent(postId: number) {
  const post = postsStore.posts.find(p => p.id === postId)
  return post ? post.content.substring(0, 100) + '...' : 'Bài viết không tồn tại'
}

function formatTime(date: Date) {
  return new Date(date).toLocaleString('vi-VN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

watch(includeAuthor, v => chrome.storage.local.set({ includeAuthor: v }))
</script>

<style scoped>
.schedule-manager {
  display: flex;
  flex-direction: column;
  gap: 20px;
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Page Header */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 22px;
  font-weight: 800;
  color: #1a1f36;
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: #697386;
  margin: 2px 0 0 0;
}

.status-badge {
  padding: 6px 14px;
  background: #f1f4f9;
  color: #8792a2;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
}

.status-badge.active {
  background: #e1ecf8;
  color: #0366d6;
}

/* Panels */
.glass-panel {
  background: white;
  border: 1px solid #eef1f5;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.tools-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tool-card {
  background: white;
  border-radius: 16px;
  border: 1px solid #eef1f5;
  box-shadow: 0 2px 10px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
}

.card-header {
  padding: 14px 18px;
  border-bottom: 1px solid #f6f8fa;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fbfbfc;
}

.icon-circle {
  width: 38px; height: 38px;
  background: white; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}

.card-header h3 { font-size: 15px; font-weight: 700; color: #1a1f36; margin: 0; }
.card-header p { font-size: 11px; color: #697386; margin: 1px 0 0 0; }

.card-content { padding: 18px; display: flex; flex-direction: column; gap: 14px; }

/* Control UI */
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 700; color: #4f566b; }

.segmented-control {
  display: flex; background: #f1f4f9; padding: 4px; border-radius: 10px;
}

.segmented-control button {
  flex: 1; padding: 8px; border: none; background: none;
  font-size: 12px; font-weight: 700; color: #697386;
  cursor: pointer; border-radius: 7px; transition: all 0.2s;
}

.segmented-control button.active {
  background: white; color: #0366d6; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.premium-select, .premium-input, .premium-input-small {
  padding: 10px 12px; border: 1.5px solid #e1e7ef; border-radius: 10px;
  font-size: 13px; color: #1a1f36; outline: none; transition: border-color 0.2s;
}
.premium-input-small { padding: 8px 10px; }
.premium-select:focus, .premium-input:focus { border-color: #0366d6; }

.selection-box {
  background: #fbfbfc; border: 1.5px dashed #e1e7ef; border-radius: 10px;
  padding: 10px; display: flex; flex-wrap: wrap; gap: 8px;
}

.scrollable { max-height: 100px; overflow-y: auto; }

.target-chip { display: flex; }
.target-chip input { display: none; }
.target-chip label {
  padding: 4px 10px; background: white; border: 1px solid #e1e7ef; border-radius: 6px;
  font-size: 11px; color: #4f566b; cursor: pointer;
}
.target-chip input:checked + label { background: #0366d6; border-color: #0366d6; color: white !important; }

.post-chip-label {
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-warning { font-size: 11px; color: #f59e0b; width: 100%; text-align: center; }

/* Buttons */
.btn { border: none; padding: 12px 20px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
.btn-primary { background: #0366d6; color: white; }
.btn-primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(3, 102, 214, 0.2); }
.btn-secondary { background: #f1f4f9; color: #0366d6; }
.btn-block { width: 100%; }
.btn-lg { padding: 14px; margin-top: 5px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* List Section */
.schedule-list-section { margin-top: 10px; }
.list-tabs { display: flex; gap: 20px; padding-bottom: 12px; border-bottom: 1px solid #f6f8fa; margin-bottom: 16px; }
.tab-link { background: none; border: none; font-size: 13px; font-weight: 700; color: #697386; cursor: pointer; padding-bottom: 8px; position: relative; }
.tab-link.active { color: #0366d6; }
.tab-link.active::after { content: ""; position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: #0366d6; border-radius: 3px; }

.scrollable-list { max-height: 400px; overflow-y: auto; }

.card-item {
  display: flex; justify-content: space-between; border: 1px solid #eef1f5;
  border-radius: 12px; padding: 14px; margin-bottom: 12px; background: white;
}

.item-main { flex: 1; }
.target-info { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.type-badge { font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
.type-badge.fanpage { background: #e1ecf8; color: #0366d6; }
.type-badge.group { background: #fef3c7; color: #92400e; }
.target-name { font-size: 14px; font-weight: 700; color: #1a1f36; }
.pub-badge { font-size: 10px; color: #697386; background: #f6f8fa; padding: 2px 6px; border-radius: 4px; }
.post-preview { font-size: 13px; color: #4f566b; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.error-text { font-size: 11px; color: #dc2626; margin-top: 4px; font-weight: 600; }

.item-meta { display: flex; align-items: center; gap: 20px; }
.time-box { text-align: right; }
.time-label { font-size: 10px; color: #697386; margin: 0; text-transform: uppercase; }
.time-value { font-size: 13px; font-weight: 700; color: #1a1f36; margin: 0; }

.item-actions { display: flex; gap: 8px; }
.action-btn { width: 32px; height: 32px; border: 1px solid #eef1f5; background: white; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
.action-btn:hover { background: #f6f8fa; transform: scale(1.05); }
.action-btn.play { color: #0366d6; border-color: #0366d611; }
.action-btn.delete { color: #dc2626; border-color: #dc262611; }

.premium-checkbox { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.premium-checkbox input { display: none; }
.checkmark { width: 20px; height: 20px; border: 2px solid #e1e7ef; border-radius: 6px; position: relative; transition: .2s; }
.premium-checkbox input:checked ~ .checkmark { background: #0366d6; border-color: #0366d6; }
.checkmark:after { content: ""; position: absolute; display: none; left: 6px; top: 2px; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.premium-checkbox input:checked ~ .checkmark:after { display: block; }

.empty-list { padding: 40px; text-align: center; color: #8792a2; font-style: italic; font-size: 13px; }

.animate-fade { animation: fadeIn 0.3s ease; }
.animate-slide { animation: slideIn 0.3s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
</style>
