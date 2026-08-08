<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">客户公海</h3>
      <p class="page-desc">
        长期未跟进的客户会自动退回公海，公海客户全员可见、可认领；认领后立即归属自己，请及时安排首轮触达，避免再次沉睡
      </p>

      <el-alert type="info" :closable="false" show-icon class="mb-12">
        <template #title>
          公海共 {{ total }} 个客户。认领前建议先看客户详情里的历史跟进与 AI 研判，判断是否仍有成交空间
        </template>
      </el-alert>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="客户姓名 / 公司 / 电话"
          clearable
          style="width: 240px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.grade" placeholder="意向等级" clearable style="width: 140px" @change="reload">
          <el-option v-for="g in grades" :key="g.v" :label="g.l" :value="g.v" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="客户" min-width="150">
          <template #default="{ row }">
            <div class="cust-cell">
              <b>{{ row.customer_name }}</b>
              <span class="text-sub">{{ row.remark || '无备注' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="公司名称" min-width="160">
          <template #default="{ row }">{{ row.company_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="phone" label="联系电话" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="意向" width="150" align="center">
          <template #default="{ row }">
            <el-tag :type="gradeType(row.grade)" effect="dark" size="small">
              {{ row.grade }}级 · {{ row.grade_text }}
            </el-tag>
            <div class="score-bar">
              <div class="bar"><i :style="{ width: row.intention_score + '%' }"></i></div>
              <span>{{ row.intention_score }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="150">
          <template #default="{ row }">
            <el-tag v-for="t in row.tags" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
            <span v-if="!row.tags?.length" class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="进入公海时间" width="160">
          <template #default="{ row }">
            {{ fmt(row.contact_time) || fmt(row.created_at) || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="最近跟进" width="160">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.last_follow_time }">
              {{ fmt(row.last_follow_time) || '从未跟进' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="原负责人" width="100">
          <template #default="{ row }">
            <span v-if="row.owner_name">{{ row.owner_name }}</span>
            <span v-else class="text-sub">已释放</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              size="small"
              :loading="claiming === row.id"
              @click="doClaim(row)"
            >
              认领
            </el-button>
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="10"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 客户详情 -->
    <el-drawer v-model="detailVisible" title="公海客户详情" size="620px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="d-head">
            <div>
              <h3 class="d-name">{{ detail.customer_name }}</h3>
              <p class="text-sub">{{ detail.company_name || '未填写公司' }}</p>
            </div>
            <el-tag :type="gradeType(detail.grade)" effect="dark">
              {{ detail.grade }}级 · {{ detail.intention_score }}分
            </el-tag>
          </div>

          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="联系电话">{{ detail.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="原负责人">{{ detail.owner_name || '已释放' }}</el-descriptions-item>
            <el-descriptions-item label="进入公海">{{ fmt(detail.contact_time) || '-' }}</el-descriptions-item>
            <el-descriptions-item label="最近跟进">{{ fmt(detail.last_follow_time) || '从未跟进' }}</el-descriptions-item>
            <el-descriptions-item label="标签" :span="2">
              <el-tag v-for="t in detail.tags" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
              <span v-if="!detail.tags?.length" class="text-sub">-</span>
            </el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
          </el-descriptions>

          <div v-if="detail.ai_analysis" class="mt-12">
            <h4 class="sec-title">AI 意向研判</h4>
            <div class="ai-box">{{ detail.ai_analysis }}</div>
          </div>

          <h4 class="sec-title mt-16">
            历史跟进
            <span class="text-sub tiny">共 {{ detail.follows?.length || 0 }} 条</span>
          </h4>
          <el-timeline v-if="detail.follows?.length">
            <el-timeline-item
              v-for="f in detail.follows"
              :key="f.id"
              :timestamp="fmt(f.created_at)"
              placement="top"
            >
              <div class="follow-card">
                <div class="fc-head">
                  <el-tag size="small" effect="plain">{{ f.follow_type }}</el-tag>
                  <span class="text-sub">{{ f.user_name }}</span>
                </div>
                <div class="fc-content">{{ f.content }}</div>
                <div v-if="f.ai_suggest" class="fc-ai">AI 建议：{{ f.ai_suggest }}</div>
              </div>
            </el-timeline-item>
          </el-timeline>
          <div v-else class="empty-tip">该客户此前没有留下跟进记录</div>

          <div class="mt-16">
            <el-button type="primary" :loading="claiming === detail.id" @click="doClaim(detail)">
              认领该客户
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Search } from '@element-plus/icons-vue';
import { crmApi } from '../../api';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const claiming = ref<number | null>(null);

const query = reactive<any>({ page: 1, keyword: '', grade: '' });

const grades = [
  { v: 'A', l: 'A级 · 高意向' },
  { v: 'B', l: 'B级 · 潜在客户' },
  { v: 'C', l: 'C级 · 普通' },
  { v: 'D', l: 'D级 · 沉睡' },
];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const res: any = await crmApi.customerPage({ ...query, is_public: 1 });
    list.value = res.list || [];
    total.value = res.total || 0;
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  load();
}

onMounted(load);

/* ---------- 认领 ---------- */
function doClaim(row: any) {
  ElMessageBox.confirm(
    `确定认领「${row.customer_name}${row.company_name ? '（' + row.company_name + '）' : ''}」吗？认领后该客户归属你，需由你负责后续跟进。`,
    '认领客户',
    { type: 'warning', confirmButtonText: '确定认领' },
  )
    .then(async () => {
      claiming.value = row.id;
      try {
        // 后端 claim 接收 ids 数组（或单个 id）
        await crmApi.claim({ ids: [row.id] });
        ElMessage.success('已认领，可在客户管理中查看');
        detailVisible.value = false;
        load();
      } finally {
        claiming.value = null;
      }
    })
    .catch(() => void 0);
}

/* ---------- 详情 ---------- */
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

async function openDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await crmApi.customerDetail(row.id);
  } finally {
    detailLoading.value = false;
  }
}

/* ---------- 工具 ---------- */
function gradeType(g: string) {
  return g === 'A' ? 'danger' : g === 'B' ? 'warning' : g === 'C' ? 'primary' : 'info';
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.score-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;

  .bar {
    flex: 1;
    height: 4px;
    background: #eef1f6;
    border-radius: 2px;
    overflow: hidden;

    i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #60a5fa, #2563eb);
    }
  }

  span {
    font-size: 11px;
    color: var(--fae-text-sub);
  }
}

.mr-4 {
  margin-right: 4px;
}

.tiny {
  font-size: 11px;
}

.d-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.d-name {
  margin: 0 0 2px;
  font-size: 18px;
}

.sec-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.follow-card {
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
}

.fc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}

.fc-content {
  font-size: 13px;
  line-height: 1.8;
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
</style>
