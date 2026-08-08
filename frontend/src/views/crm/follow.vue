<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">跟进记录</h3>
      <p class="page-desc">
        全公司的客户沟通过程都沉淀在这里；每条记录都会自动生成 AI 跟进建议，主管可据此复盘话术、排查久未推进的客户
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="客户 / 公司 / 跟进内容"
          clearable
          style="width: 220px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.follow_type" placeholder="跟进方式" clearable style="width: 130px" @change="reload">
          <el-option v-for="t in followTypes" :key="t" :label="t" :value="t" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
        <el-select v-model="userName" placeholder="跟进人" clearable filterable style="width: 140px">
          <el-option v-for="u in users" :key="u.id" :label="u.real_name || u.username" :value="u.real_name || u.username" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-radio-group v-model="viewMode">
          <el-radio-button value="timeline">时间轴</el-radio-button>
          <el-radio-button value="table">表格</el-radio-button>
        </el-radio-group>
        <el-button :icon="Download" @click="doExport">导出</el-button>
      </div>

      <div class="text-sub tiny mb-12">
        跟进方式由服务端过滤；关键词、日期与跟进人为当前页内筛选，共 {{ total }} 条记录、本页命中 {{ showList.length }} 条
      </div>

      <!-- 表格视图 -->
      <el-table
        v-if="viewMode === 'table'"
        :data="showList"
        v-loading="loading"
        border
        stripe
        row-key="id"
        :expand-row-keys="expandKeys"
        @row-click="toggleRow"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-box">
              <h5 class="ex-title">完整跟进内容</h5>
              <div class="ex-content">{{ row.content }}</div>
              <template v-if="row.ai_suggest">
                <h5 class="ex-title mt-12">AI 跟进建议</h5>
                <div class="ai-box">{{ row.ai_suggest }}</div>
              </template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="跟进时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="客户" min-width="170">
          <template #default="{ row }">
            <div class="cust-cell">
              <b>{{ row.customer_name || '客户已删除' }}</b>
              <span class="text-sub">{{ row.company_name || '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="方式" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="typeColor(row.follow_type)" size="small" effect="plain">{{ row.follow_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="跟进内容" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">{{ row.content }}</template>
        </el-table-column>
        <el-table-column label="AI建议" width="90" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.ai_suggest"
              link
              type="primary"
              size="small"
              :icon="MagicStick"
              @click.stop="openSuggest(row)"
            >
              查看
            </el-button>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="下次跟进" width="150">
          <template #default="{ row }">
            <span :class="{ 'text-danger': isOverdue(row.next_follow_time) }">
              {{ fmt(row.next_follow_time) || '未约定' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="user_name" label="跟进人" width="90">
          <template #default="{ row }">{{ row.user_name || '-' }}</template>
        </el-table-column>
      </el-table>

      <!-- 时间轴视图 -->
      <div v-else v-loading="loading" class="tl-wrap">
        <div v-if="!showList.length" class="empty-tip">当前条件下没有跟进记录</div>
        <el-timeline v-else>
          <el-timeline-item
            v-for="f in showList"
            :key="f.id"
            :timestamp="fmt(f.created_at)"
            :type="dotType(f.follow_type)"
            placement="top"
          >
            <div class="tl-card" @click="toggleRow(f)">
              <div class="tc-head">
                <b>{{ f.customer_name || '客户已删除' }}</b>
                <span class="text-sub">{{ f.company_name || '-' }}</span>
                <el-tag :type="typeColor(f.follow_type)" size="small" effect="plain">{{ f.follow_type }}</el-tag>
                <div class="flex-1"></div>
                <span class="text-sub tiny">{{ f.user_name }}</span>
              </div>
              <div class="tc-content" :class="{ folded: !expandKeys.includes(String(f.id)) }">
                {{ f.content }}
              </div>
              <div v-if="f.ai_suggest && expandKeys.includes(String(f.id))" class="fc-ai">
                AI 建议：{{ f.ai_suggest }}
              </div>
              <div class="tc-foot">
                <span :class="isOverdue(f.next_follow_time) ? 'text-danger' : 'text-sub'">
                  下次跟进：{{ fmt(f.next_follow_time) || '未约定' }}
                </span>
                <el-button link type="primary" size="small">
                  {{ expandKeys.includes(String(f.id)) ? '收起' : '展开全文' }}
                </el-button>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </div>

    <!-- AI 建议 -->
    <el-dialog v-model="suggestVisible" title="AI 跟进建议" width="600px">
      <div class="text-sub mb-12">
        {{ current?.customer_name }}（{{ current?.company_name || '-' }}） · {{ fmt(current?.created_at) }}
      </div>
      <h5 class="ex-title">本次跟进内容</h5>
      <div class="ex-content">{{ current?.content }}</div>
      <h5 class="ex-title mt-12">AI 建议</h5>
      <div class="ai-box">{{ current?.ai_suggest }}</div>
      <template #footer>
        <el-button type="primary" @click="suggestVisible = false">知道了</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, MagicStick, Search } from '@element-plus/icons-vue';
import { crmApi, userApi } from '../../api';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const users = ref<any[]>([]);
const viewMode = ref<'timeline' | 'table'>('timeline');
const expandKeys = ref<string[]>([]);
const dateRange = ref<[string, string] | null>(null);
const userName = ref('');

const query = reactive<any>({ page: 1, size: 10, keyword: '', follow_type: '' });

const followTypes = ['电话', '微信', '拜访', '邮件', '其他'];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const res: any = await crmApi.followPage({
      page: query.page,
      size: query.size,
      follow_type: query.follow_type || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
    expandKeys.value = [];
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  load();
}

/** 关键词 / 日期 / 跟进人后端未提供过滤参数，这里在当前页数据上二次筛选 */
const showList = computed(() => {
  const kw = query.keyword.trim().toLowerCase();
  const [s, e] = dateRange.value || [];
  return list.value.filter((f) => {
    if (kw) {
      const text = `${f.customer_name || ''}${f.company_name || ''}${f.content || ''}`.toLowerCase();
      if (!text.includes(kw)) return false;
    }
    if (userName.value && f.user_name !== userName.value) return false;
    if (s || e) {
      const d = f.created_at ? fmt(f.created_at).slice(0, 10) : '';
      if (s && d < s) return false;
      if (e && d > e) return false;
    }
    return true;
  });
});

onMounted(async () => {
  load();
  try {
    users.value = (await userApi.options()) as any;
  } catch {
    users.value = [];
  }
});

/* ---------- 展开 / AI 建议 ---------- */
function toggleRow(row: any) {
  const key = String(row.id);
  const i = expandKeys.value.indexOf(key);
  if (i >= 0) expandKeys.value.splice(i, 1);
  else expandKeys.value.push(key);
}

const suggestVisible = ref(false);
const current = ref<any>(null);

function openSuggest(row: any) {
  current.value = row;
  suggestVisible.value = true;
}

/* ---------- 导出 ---------- */
function doExport() {
  const data = showList.value;
  if (!data.length) return ElMessage.warning('无可导出数据');

  const headers = ['跟进时间', '客户姓名', '公司名称', '跟进方式', '跟进内容', '下次跟进', '跟进人', 'AI建议'];
  const lines = [headers.join(',')];
  for (const r of data) {
    lines.push(
      [
        fmt(r.created_at),
        r.customer_name,
        r.company_name,
        r.follow_type,
        r.content,
        fmt(r.next_follow_time),
        r.user_name,
        r.ai_suggest,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  // \ufeff 防止 Excel 打开中文乱码
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `跟进记录_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success(`已导出 ${data.length} 条`);
}

/* ---------- 工具 ---------- */
function typeColor(t: string) {
  return t === '拜访' ? 'danger' : t === '电话' ? 'primary' : t === '微信' ? 'success' : 'info';
}

function dotType(t: string) {
  return t === '拜访' ? 'danger' : t === '电话' ? 'primary' : t === '微信' ? 'success' : 'info';
}

function isOverdue(v: any) {
  return !!v && new Date(v).getTime() < Date.now();
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.cust-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.6;

  span {
    font-size: 12px;
  }
}

.tiny {
  font-size: 11px;
}

.tl-wrap {
  min-height: 200px;
  padding-top: 4px;
}

.tl-card {
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--fae-primary-light);
  }
}

.tc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}

.tc-content {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;

  &.folded {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.tc-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
}

.fc-ai {
  margin-top: 8px;
  font-size: 12px;
  color: #1d4ed8;
  background: #eff6ff;
  padding: 8px 10px;
  border-radius: 6px;
  line-height: 1.8;
}

.expand-box {
  padding: 8px 16px 12px;
}

.ex-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 6px;
}

.ex-content {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
}
</style>
