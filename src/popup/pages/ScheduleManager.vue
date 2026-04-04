<template>
  <div class="schedule-manager">
    <h1>Lịch đăng bài</h1>

    <!-- AUTO-SCHEDULER SECTION -->
    <div class="auto-scheduler-section">
      <h2>🤖 Tự động lên lịch toàn bộ</h2>
      <p class="helper-text">Lên lịch tất cả {{ unpublishedPosts.length }} bài viết chưa đăng</p>

      <div class="config-grid">
        <div class="form-group">
          <label>Khoảng cách giữa bài (phút):</label>
          <input v-model.number="autoConfig.postInterval" type="number" min="10" max="1440" />
        </div>

        <div class="form-group">
          <label>Giới hạn/ngày/fanpage:</label>
          <input v-model.number="autoConfig.dailyLimit" type="number" min="1" max="50" />
        </div>

        <div class="form-group">
          <label>Giờ bắt đầu:</label>
          <input v-model.number="autoConfig.activeHoursStart" type="number" min="0" max="23" />
        </div>

        <div class="form-group">
          <label>Giờ kết thúc:</label>
          <input v-model.number="autoConfig.activeHoursEnd" type="number" min="0" max="23" />
        </div>
      </div>

      <div class="form-group">
        <label>Chiến lược đa fanpage:</label>
        <select v-model="autoConfig.multiPageStrategy">
          <option value="simultaneous">Đăng cùng lúc</option>
          <option value="staggered">Lệch thời gian</option>
        </select>
      </div>

      <!-- Stagger delay selector (only show when staggered is selected) -->
      <div v-if="autoConfig.multiPageStrategy === 'staggered'" class="form-group">
        <label>Khoảng cách giữa fanpages:</label>
        <select v-model.number="autoConfig.staggerDelay">
          <option :value="3">3 phút</option>
          <option :value="5">5 phút</option>
          <option :value="10">10 phút</option>
          <option :value="15">15 phút</option>
        </select>
      </div>

      <div class="form-group">
        <label>Chọn fanpage đích:</label>
        <div class="fanpage-checkboxes">
          <label v-for="fanpage in enabledFanpages" :key="fanpage.id" class="checkbox-label">
            <input
              type="checkbox"
              :value="fanpage.id"
              v-model="selectedFanpageIds"
            />
            <span>{{ fanpage.name }}</span>
          </label>
        </div>
        <p v-if="enabledFanpages.length === 0" class="warning-text">
          ⚠️ Chưa có fanpage nào được enable. Vui lòng vào tab Fanpage để enable.
        </p>
      </div>

      <button
        @click="autoScheduleAll"
        class="btn btn-primary btn-large"
        :disabled="!canAutoSchedule"
      >
        🚀 Tự động lên lịch {{ unpublishedPosts.length }} bài
      </button>

      <div v-if="autoPreview.length > 0" class="preview-section">
        <h3>Preview: {{ autoPreview.length }} lịch sẽ được tạo</h3>
        <div class="preview-list">
          <div v-for="(slot, idx) in autoPreview.slice(0, 5)" :key="idx" class="preview-item">
            <strong>{{ formatDateTime(slot.scheduledAt) }}</strong> - 
            Bài #{{ slot.postId }} → {{ getFanpageName(slot.fanpageId) }}
          </div>
          <p v-if="autoPreview.length > 5">... và {{ autoPreview.length - 5 }} lịch khác</p>
        </div>
      </div>
    </div>

    <!-- MANUAL CREATE SECTION (Original) -->
    <div class="schedule-form">
      <h2>Hoặc tạo lịch thủ công</h2>
      
      <div class="form-group">
        <label>Chọn bài viết:</label>
        <select v-model="selectedPostId">
          <option value="">-- Chọn bài viết --</option>
          <option
            v-for="post in unpublishedPosts"
            :key="post.id"
            :value="post.id"
          >
            {{ post.content.substring(0, 50) }}...
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Chọn fanpage:</label>
        <select v-model="selectedFanpageId">
          <option value="">-- Chọn fanpage --</option>
          <option
            v-for="fanpage in enabledFanpages"
            :key="fanpage.id"
            :value="fanpage.id"
          >
            {{ fanpage.name }}
          </option>
        </select>
      </div>

      <div class="form-group">
        <label>Thời gian đăng:</label>
        <input
          v-model="scheduledTime"
          type="datetime-local"
          :min="minDateTime"
        />
      </div>

      <button
        @click="createSchedule"
        class="btn btn-primary"
        :disabled="!canCreate"
      >
        📅 Tạo lịch đăng
      </button>
    </div>

    <!-- Schedules List -->
    <div class="schedules-section">
      <div class="tabs">
        <button
          @click="activeTab = 'pending'"
          :class="{ active: activeTab === 'pending' }"
        >
          ⏳ Chờ đăng ({{ schedulesStore.pendingSchedules.length }})
        </button>
        <button
          @click="activeTab = 'completed'"
          :class="{ active: activeTab === 'completed' }"
        >
          ✅ Đã đăng ({{ schedulesStore.completedSchedules.length }})
        </button>
        <button
          @click="activeTab = 'failed'"
          :class="{ active: activeTab === 'failed' }"
        >
          ❌ Thất bại ({{ schedulesStore.failedSchedules.length }})
        </button>
      </div>

      <div class="schedules-list">
        <div
          v-for="schedule in currentSchedules"
          :key="schedule.id"
          class="schedule-item"
          :class="schedule.status"
        >
          <div class="schedule-info">
            <div class="schedule-time">
              📅 {{ formatDateTime(schedule.scheduledAt) }}
            </div>
            <div class="schedule-meta">
              <span>Bài #{{ schedule.postId }}</span>
              <span>→ {{ getFanpageName(schedule.fanpageId) }}</span>
            </div>
            <div v-if="schedule.publishedUrl" class="published-link">
                <a :href="schedule.publishedUrl" target="_blank" class="view-link">
                    🔗 Xem bài đã đăng
                </a>
            </div>
            <div v-if="schedule.error" class="error-msg">
              ⚠️ {{ schedule.error }}
            </div>
          </div>

          <div class="schedule-actions">
            <button
              v-if="schedule.status === 'pending'"
              @click="publishNow(schedule.id!)"
              class="btn-sm btn-primary"
            >
              🚀 Đăng ngay
            </button>
            <button
              @click="deleteSchedule(schedule.id!)"
              class="btn-sm btn-danger"
            >
              🗑️ Xóa
            </button>
          </div>
        </div>

        <div v-if="currentSchedules.length === 0" class="empty-state">
          <p>Không có lịch đăng nào</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSchedulesStore } from '@/stores/schedules'
import { usePostsStore } from '@/stores/posts'
import { useFanpagesStore } from '@/stores/fanpages'
import { useRoute } from 'vue-router'
import { generateAutoSchedule, DEFAULT_AUTO_SCHEDULER_CONFIG, type AutoSchedulerConfig } from '@/utils/auto-scheduler'

const schedulesStore = useSchedulesStore()
const postsStore = usePostsStore()
const fanpagesStore = useFanpagesStore()
const route = useRoute()

// Manual scheduling state
const selectedPostId = ref<number | ''>('')
const selectedFanpageId = ref<number | ''>('')
const scheduledTime = ref('')
const activeTab = ref<'pending' | 'completed' | 'failed'>('pending')

// Auto-scheduler state
const selectedFanpageIds = ref<number[]>([])
const autoConfig = ref<AutoSchedulerConfig>({ ...DEFAULT_AUTO_SCHEDULER_CONFIG })
const autoPreview = ref<Array<{ postId: number; fanpageId: number; scheduledAt: Date }>>([])


const minDateTime = computed(() => {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 5) // At least 5 minutes from now
  return now.toISOString().slice(0, 16)
})

const unpublishedPosts = computed(() => postsStore.unpublishedPosts)
const enabledFanpages = computed(() => fanpagesStore.enabledFanpages)

const canCreate = computed(() => {
  return selectedPostId.value && selectedFanpageId.value && scheduledTime.value
})

const currentSchedules = computed(() => {
  switch (activeTab.value) {
    case 'pending':
      return schedulesStore.pendingSchedules
    case 'completed':
      return schedulesStore.completedSchedules
    case 'failed':
      return schedulesStore.failedSchedules
    default:
      return []
  }
})

onMounted(async () => {
  await Promise.all([
    schedulesStore.loadSchedules(),
    postsStore.loadPosts(),
    fanpagesStore.loadFanpages()
  ])

  // Check if postId in query params
  const postId = route.query.postId
  if (postId) {
    selectedPostId.value = parseInt(postId as string)
  }
  
  // Generate initial preview
  updateAutoPreview()
})

// Auto-scheduler computed
const canAutoSchedule = computed(() => {
  return unpublishedPosts.value.length > 0 && selectedFanpageIds.value.length > 0
})

// Auto-scheduler functions
function updateAutoPreview() {
  if (!canAutoSchedule.value) {
    autoPreview.value = []
    return
  }

  const selectedFanpages = enabledFanpages.value.filter(f => 
    selectedFanpageIds.value.includes(f.id!)
  )

  autoPreview.value = generateAutoSchedule(
    unpublishedPosts.value,
    selectedFanpages,
    autoConfig.value
  )
}

async function autoScheduleAll() {
  if (!canAutoSchedule.value) return

  // Generate final schedule
  updateAutoPreview()
  
  if (autoPreview.value.length === 0) {
    alert('Không có lịch nào được tạo. Kiểm tra lại cấu hình.')
    return
  }

  const confirmed = confirm(
    `Bạn có chắc muốn tạo ${autoPreview.value.length} lịch đăng?\n\n` +
    `Sẽ đăng ${unpublishedPosts.value.length} bài lên ${selectedFanpageIds.value.length} fanpage ` +
    `với khoảng cách ${autoConfig.value.postInterval} phút.`
  )

  if (!confirmed) return

  // Create all schedules
  for (const slot of autoPreview.value) {
    await schedulesStore.createSchedule(
      slot.postId,
      slot.fanpageId,
      slot.scheduledAt
    )
  }

  alert(`✅ Đã tạo ${autoPreview.value.length} lịch đăng thành công!`)
  
  // Clear selection and preview
  selectedFanpageIds.value = []
  autoPreview.value = []
}

function getFanpageName(fanpageId: number): string {
  const fanpage = enabledFanpages.value.find(f => f.id === fanpageId)
  return fanpage?.name || `#${fanpageId}`
}


async function createSchedule() {
  if (!canCreate.value) return

  await schedulesStore.createSchedule(
    selectedPostId.value as number,
    selectedFanpageId.value as number,
    new Date(scheduledTime.value)
  )

  // Reset form
  selectedPostId.value = ''
  selectedFanpageId.value = ''
  scheduledTime.value = ''

  alert('Đã tạo lịch đăng!')
}

async function publishNow(scheduleId: number) {
  if (confirm('Đăng bài ngay bây giờ?')) {
    const success = await schedulesStore.publishNow(scheduleId)
    if (success) {
      alert('Đã đăng bài thành công!')
    } else {
      // Find the schedule to get the error details
      const schedule = currentSchedules.value.find(s => s.id === scheduleId)
      const errorMsg = schedule?.error || 'Đăng bài thất bại! (Lỗi không xác định)'
      alert(`Đăng bài thất bại!\nLỗi: ${errorMsg}`)
    }
  }
}

async function deleteSchedule(id: number) {
  if (confirm('Xóa lịch đăng này?')) {
    await schedulesStore.deleteSchedule(id)
  }
}

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.schedule-manager {
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

.schedule-form {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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

.form-group select,
.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}

.schedules-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid #e1e4e8;
  padding-bottom: 12px;
}

.tabs button {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  color: #586069;
  transition: all 0.2s;
}

.tabs button:hover {
  color: #0366d6;
}

.tabs button.active {
  color: #0366d6;
  border-bottom-color: #0366d6;
}

.schedules-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 350px;
  overflow-y: auto;
}

.schedule-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f6f8fa;
  border-radius: 6px;
  border-left: 3px solid #e1e4e8;
}

.schedule-item.pending {
  border-left-color: #ffd33d;
}

.schedule-item.success {
  border-left-color: #28a745;
}

.schedule-item.failed {
  border-left-color: #d73a49;
}

.schedule-info {
  flex: 1;
}

.schedule-time {
  font-weight: 500;
  font-size: 13px;
  color: #24292e;
  margin-bottom: 4px;
}

.schedule-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #586069;
}

.error-msg {
  margin-top: 4px;
  font-size: 11px;
  color: #d73a49;
}

.schedule-actions {
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
}

.btn-sm.btn-primary {
  background: #0366d6;
  color: #fff;
}

.btn-sm.btn-danger {
  background: #fff;
  border: 1px solid #e1e4e8;
  color: #24292e;
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

/* Auto-Scheduler Styles */
.auto-scheduler-section {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  border-left: 4px solid #0366d6;
}

.auto-scheduler-section h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.helper-text {
  font-size: 13px;
  color: #586069;
  margin-bottom: 16px;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.fanpage-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: #fff;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.checkbox-label:hover {
  background: #f6f8fa;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  cursor: pointer;
}

.warning-text {
  color: #d73a49;
  font-size: 13px;
  margin-top: 8px;
}

.btn-large {
  padding: 12px 24px;
  font-size: 15px;
  width: 100%;
  margin-top: 12px;
}

.preview-section {
  margin-top: 20px;
  padding: 16px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e1e4e8;
}

.preview-section h3 {
  font-size: 14px;
  margin-bottom: 12px;
  color: #24292e;
}

.preview-list {
  font-size: 12px;
  color: #586069;
}

.preview-item {
  padding: 8px;
  margin-bottom: 6px;
  background: #f6f8fa;
  border-radius: 4px;
}

.preview-item strong {
  color: #0366d6;
}

</style>
