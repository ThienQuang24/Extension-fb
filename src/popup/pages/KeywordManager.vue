<template>
  <div class="keyword-manager">
    <h1>Quản lý Từ khóa & Bộ lọc</h1>

    <!-- Keywords Section -->
    <div class="section">
      <h2>Từ khóa tìm kiếm</h2>

      <div class="add-form">
        <input
          v-model="newKeyword"
          type="text"
          placeholder="Nhập từ khóa mới..."
          @keyup.enter="addKeyword"
        />
        <input
          v-model="newCategory"
          type="text"
          placeholder="Danh mục (tùy chọn)"
        />
        <button @click="addKeyword" class="btn btn-primary">
          ➕ Thêm
        </button>
      </div>

      <div class="keywords-list">
        <div
          v-for="keyword in keywordsStore.keywords"
          :key="keyword.id"
          class="keyword-item"
        >
          <label class="checkbox">
            <input
              type="checkbox"
              :checked="keyword.enabled"
              @change="toggleKeyword(keyword.id!)"
            />
            <span class="checkmark"></span>
          </label>
          <div class="keyword-text">
            <strong>{{ keyword.text }}</strong>
            <span v-if="keyword.category" class="category">{{ keyword.category }}</span>
          </div>
          <button @click="deleteKeyword(keyword.id!)" class="btn-delete">
            🗑️
          </button>
        </div>
      </div>
    </div>

    <!-- Filters Section -->
    <div class="section">
      <h2>Bộ lọc</h2>

      <div class="filter-form">
        <div class="form-row">
          <label>Tên bộ lọc:</label>
          <input v-model="filterForm.name" type="text" />
        </div>

        <div class="form-row">
          <label>Bài viết trong (ngày):</label>
          <input v-model.number="filterForm.dateRangeInDays" type="number" min="1" />
        </div>

        <div class="form-row">
          <label>Loại bài viết:</label>
          <div class="checkbox-group">
            <label>
              <input type="checkbox" value="text" v-model="filterForm.postTypes" />
              Text
            </label>
            <label>
              <input type="checkbox" value="image" v-model="filterForm.postTypes" />
              Hình ảnh
            </label>
            <label>
              <input type="checkbox" value="video" v-model="filterForm.postTypes" />
              Video
            </label>
          </div>
        </div>

        <div class="form-row">
          <label>Min Likes:</label>
          <input v-model.number="filterForm.minLikes" type="number" min="0" />
        </div>

        <div class="form-row">
          <label>Yêu cầu từ khóa (phân cách bằng dấu phẩy):</label>
          <textarea
            v-model="includeKeywordsText"
            rows="2"
            placeholder="tuyển dụng, việc làm, ..."
          ></textarea>
        </div>

        <div class="form-row">
          <label>Loại trừ từ khóa (phân cách bằng dấu phẩy):</label>
          <textarea
            v-model="excludeKeywordsText"
            rows="2"
            placeholder="spam, quảng cáo, ..."
          ></textarea>
        </div>

        <div v-if="successMsg" class="alert alert-success">
          {{ successMsg }}
        </div>

        <div class="form-actions">
          <button @click="saveFilter" class="btn btn-primary">
            {{ editingFilterId ? '💾 Cập nhật bộ lọc' : '💾 Lưu bộ lọc' }}
          </button>
          <button v-if="editingFilterId" @click="cancelEdit" class="btn btn-secondary">
            Hủy
          </button>
        </div>
      </div>

      <div class="filters-list">
        <div
          v-for="filter in keywordsStore.filters"
          :key="filter.id"
          class="filter-item"
          :class="{ active: filter.enabled }"
        >
          <div class="filter-header">
            <strong>{{ filter.name }}</strong>
            <div class="filter-actions">
              <button
                @click="toggleFilter(filter.id!)"
                class="btn-sm"
                :class="{ active: filter.enabled }"
              >
                {{ filter.enabled ? '✓ Đang dùng' : 'Sử dụng' }}
              </button>
              <button @click="editFilter(filter)" class="btn-sm">
                ✏️ Sửa
              </button>
              <button @click="deleteFilter(filter.id!)" class="btn-delete">
                🗑️
              </button>
            </div>
          </div>
          <div class="filter-details">
            <span v-if="filter.dateRangeInDays">📅 {{ filter.dateRangeInDays }} ngày</span>
            <span v-if="filter.postTypes.length">
              📝 {{ filter.postTypes.join(', ') }}
            </span>
            <span v-if="filter.minLikes">❤️ ≥{{ filter.minLikes }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useKeywordsStore } from '@/stores/keywords'

const keywordsStore = useKeywordsStore()

// Keywords
const newKeyword = ref('')
const newCategory = ref('')

// Filters
const filterForm = ref({
  name: '',
  dateRangeInDays: 7,
  postTypes: ['text', 'image'] as string[],
  minLikes: 0,
  includeKeywords: [] as string[],
  excludeKeywords: [] as string[],
  enabled: false
})

const editingFilterId = ref<number | null>(null)
const successMsg = ref('')

const includeKeywordsText = computed({
  get: () => filterForm.value.includeKeywords?.join(', ') || '',
  set: (value: string) => {
    filterForm.value.includeKeywords = value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
  }
})

const excludeKeywordsText = computed({
  get: () => filterForm.value.excludeKeywords.join(', '),
  set: (value: string) => {
    filterForm.value.excludeKeywords = value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
  }
})

onMounted(async () => {
  await keywordsStore.loadKeywords()
  await keywordsStore.loadFilters()
})

async function addKeyword() {
  if (!newKeyword.value.trim()) return

  await keywordsStore.addKeyword(
    newKeyword.value.trim(),
    newCategory.value.trim() || undefined
  )

  newKeyword.value = ''
  newCategory.value = ''
}

async function toggleKeyword(id: number) {
  await keywordsStore.toggleKeyword(id)
}

async function deleteKeyword(id: number) {
  if (confirm('Xóa từ khóa này?')) {
    await keywordsStore.deleteKeyword(id)
  }
}

async function saveFilter() {
  if (!filterForm.value.name.trim()) {
    alert('Vui lòng nhập tên bộ lọc')
    return
  }

  if (editingFilterId.value) {
    await keywordsStore.updateFilter(editingFilterId.value, filterForm.value)
    successMsg.value = 'Đã cập nhật bộ lọc thành công'
  } else {
    await keywordsStore.addFilter(filterForm.value)
    successMsg.value = 'Đã lưu bộ lọc mới thành công'
  }

  // Reset form
  cancelEdit()

  setTimeout(() => {
    successMsg.value = ''
  }, 3000)
}

function editFilter(filter: any) {
  editingFilterId.value = filter.id
  filterForm.value = {
    name: filter.name,
    dateRangeInDays: filter.dateRangeInDays,
    postTypes: [...filter.postTypes],
    minLikes: filter.minLikes,
    includeKeywords: [...(filter.includeKeywords || [])],
    excludeKeywords: [...(filter.excludeKeywords || [])],
    enabled: filter.enabled
  }
}

function cancelEdit() {
  editingFilterId.value = null
  filterForm.value = {
    name: '',
    dateRangeInDays: 7,
    postTypes: ['text', 'image'],
    minLikes: 0,
    includeKeywords: [],
    excludeKeywords: [],
    enabled: false
  }
}

async function toggleFilter(id: number) {
  await keywordsStore.toggleFilter(id)
}

async function deleteFilter(id: number) {
  if (confirm('Xóa bộ lọc này?')) {
    await keywordsStore.deleteFilter(id)
  }
}
</script>

<style scoped>
.keyword-manager {
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

.section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.add-form input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 13px;
}

.keywords-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.keyword-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: #f6f8fa;
  border-radius: 6px;
}

.checkbox {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox input {
  opacity: 0;
  width: 0;
  height: 0;
}

.checkmark {
  width: 20px;
  height: 20px;
  border: 2px solid #e1e4e8;
  border-radius: 4px;
  background: #fff;
  transition: all 0.2s;
}

.checkbox input:checked ~ .checkmark {
  background: #0366d6;
  border-color: #0366d6;
}

.checkmark:after {
  content: "";
  position: absolute;
  display: none;
  left: 7px;
  top: 3px;
  width: 5px;
  height: 10px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox input:checked ~ .checkmark:after {
  display: block;
}

.keyword-text {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.category {
  padding: 2px 8px;
  background: #e1e4e8;
  border-radius: 12px;
  font-size: 11px;
  color: #586069;
}

.btn-delete {
  padding: 4px 8px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.btn-delete:hover {
  opacity: 1;
}

.filter-form {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.form-row {
  margin-bottom: 12px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-row label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #24292e;
}

.form-row input,
.form-row textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
  font-family: inherit;
}

.checkbox-group {
  display: flex;
  gap: 16px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  font-size: 13px;
}

.filters-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-item {
  padding: 12px;
  background: #f6f8fa;
  border-radius: 6px;
  border-left: 3px solid #e1e4e8;
}

.filter-item.active {
  border-left-color: #0366d6;
  background: #f1f8ff;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.filter-actions {
  display: flex;
  gap: 4px;
}

.filter-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #586069;
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

.btn-primary:hover {
  background: #0256c7;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #e1e4e8;
  color: #24292e;
}

.btn-sm:hover {
  background: #f6f8fa;
  border-color: #0366d6;
}

.btn-sm.active {
  background: #0366d6;
  color: #fff;
  border-color: #0366d6;
}

.alert {
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
}

.alert-success {
  background: #dcffe4;
  color: #1a7f37;
  border: 1px solid #abe9b3;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn-secondary {
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  color: #24292e;
}

.btn-secondary:hover {
  background: #e1e4e8;
}
</style>
