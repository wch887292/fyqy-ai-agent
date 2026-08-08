<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">分利结算流水</h3>
      <p class="page-desc">
        系统自动核算生成的分成台账，支持按合伙人与时间区间对账、手动确认结算与导出对账单
      </p>

      <!-- 统计口径：仅当前页聚合，后端未提供全量汇总接口，翻页后数值会变，勿当作全量口径使用 -->
      <el-row :gutter="12" class="mt-12">
        <el-col :span="6">
          <div class="stat-box">
            <div class="stat-label">本页合计笔数</div>
            <div class="stat-value">{{ stat.count }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <div class="stat-label">待结算金额合计</div>
            <div class="stat-value">{{ money(stat.pending) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <div class="stat-label">已结算金额合计</div>
            <div class="stat-value">{{ money(stat.settled) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-box">
            <div class="stat-label">分成总额</div>
            <div class="stat-value">{{ money(stat.total) }}</div>
          </div>
        </el-col>
      </el-row>

      <div class="filter-bar mt-12">
        <el-select
          v-model="query.user_id"
          placeholder="合伙人"
          clearable
          filterable
          style="width: 180px"
          @change="reload"
        >
          <el-option v-for="u in users" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-select v-model="query.status" placeholder="结算状态" clearable style="width: 150px" @change="reload">
          <el-option v-for="s in statusOpts" :key="s.v" :label="s.l" :value="s.v" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 260px"
          @change="onDateChange"
        />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button type="success" :icon="Download" :loading="exporting" @click="doExport">导出对账单</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="real_name" label="合伙人" width="120" />
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <span :class="{ 'text-sub': sourceText(row) === '—' }">{{ sourceText(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结算模式" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.settle_type === 'order' ? 'primary' : 'success'" size="small" effect="plain">
              {{ row.settle_type === 'order' ? '按订单' : '按业绩' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计算基数" width="130" align="right">
          <template #default="{ row }">{{ money(row.base_amount) }}</template>
        </el-table-column>
        <el-table-column label="分成金额" width="130" align="right">
          <template #default="{ row }">
            <!-- 中国财务语境下收入金额习惯用红色强调 -->
            <span style="color: #f56c6c; font-weight: 600">{{ money(row.settle_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small" effect="dark">
              {{ row.status_text || statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结算时间" width="160">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.settle_time }">{{ row.settle_time ? fmt(row.settle_time) : '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" link type="success" :icon="Check" @click="openSettle(row)">
              确认结算
            </el-button>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无结算流水，订单完成或业绩入账后系统会按分利规则自动生成
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="reload"
          @size-change="reload"
        />
      </div>
    </div>

    <!-- 手动确认结算 -->
    <el-dialog v-model="settleVisible" title="确认结算" width="480px">
      <template v-if="current">
        <el-descriptions :column="1" border class="mb-12">
          <el-descriptions-item label="合伙人">{{ current.real_name }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ sourceText(current) }}</el-descriptions-item>
          <el-descriptions-item label="分成金额">
            <span style="color: #f56c6c; font-weight: 600">{{ money(current.settle_amount) }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <el-input
          v-model="settleRemark"
          type="textarea"
          :rows="3"
          placeholder="填写打款方式、流水号等对账信息，便于后续追溯"
        />
      </template>
      <template #footer>
        <el-button @click="settleVisible = false">取消</el-button>
        <el-button type="success" :loading="settling" @click="confirmSettle">标记已结算</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Check, Download, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { partnerApi, downloadBase64 } from '../../api';

const list = ref<any[]>([]);
const users = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const exporting = ref(false);
const settling = ref(false);

const statusOpts = [
  { v: 'pending', l: '待结算' },
  { v: 'settled', l: '已结算' },
  { v: 'cancel', l: '作废' },
];

const query = reactive<any>({
  page: 1,
  size: 10,
  user_id: '',
  status: '',
  start_date: '',
  end_date: '',
});

const dateRange = ref<any>([]);

const settleVisible = ref(false);
const settleRemark = ref('');
const current = ref<any>(null);

/**
 * 统计条数值由当前页 list 前端聚合得出。
 * 后端未提供汇总接口，所以这里不是全量汇总，翻页 / 改筛选后会随之变化。
 */
const stat = computed(() => {
  let pending = 0;
  let settled = 0;
  let sum = 0;
  for (const r of list.value) {
    const amt = Number(r.settle_amount || 0);
    sum += amt;
    if (r.status === 'pending') pending += amt;
    else if (r.status === 'settled') settled += amt;
  }
  return { count: list.value.length, pending, settled, total: sum };
});

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sourceText(row: any) {
  if (Number(row.order_id) > 0) return `订单 #${row.order_id}`;
  if (Number(row.performance_id) > 0) return `业绩 #${row.performance_id}`;
  return '—';
}

function statusTag(s: string) {
  return s === 'settled' ? 'success' : s === 'cancel' ? 'info' : 'warning';
}

function statusLabel(s: string) {
  return statusOpts.find((x) => x.v === s)?.l || s;
}

function onDateChange(v: any) {
  // el-date-picker 返回 [start, end]，拆成后端要的两个独立字段
  query.start_date = v?.[0] || '';
  query.end_date = v?.[1] || '';
  reload();
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await partnerApi.settlePage({
      page: query.page,
      size: query.size,
      user_id: query.user_id || undefined,
      status: query.status || undefined,
      start_date: query.start_date || undefined,
      end_date: query.end_date || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    users.value = ((await partnerApi.options()) as any) || [];
  } catch (e: any) {
    // 全局拦截
    users.value = [];
  }
}

function openSettle(row: any) {
  current.value = row;
  settleRemark.value = '';
  settleVisible.value = true;
}

async function confirmSettle() {
  if (!current.value) return;
  settling.value = true;
  try {
    await partnerApi.settleManual({ settle_flow_id: current.value.id, remark: settleRemark.value });
    ElMessage.success('已标记为已结算');
    settleVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    settling.value = false;
  }
}

/** 导出走当前筛选条件（不带分页），后端返回 base64 由 api 层统一转下载 */
async function doExport() {
  exporting.value = true;
  try {
    const res: any = await partnerApi.settleExport({
      user_id: query.user_id || undefined,
      status: query.status || undefined,
      start_date: query.start_date || undefined,
      end_date: query.end_date || undefined,
    });
    if (!downloadBase64(res)) {
      ElMessage.warning('没有符合条件的数据可导出');
      return;
    }
    ElMessage.success(`已导出 ${res?.total ?? 0} 条`);
  } catch (e: any) {
    // 全局拦截
  } finally {
    exporting.value = false;
  }
}

loadUsers();
reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}

.stat-box {
  background: #f8f9fb;
  border-radius: 8px;
  padding: 14px 16px;

  .stat-label {
    font-size: 12px;
    color: #909399;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 600;
    margin-top: 6px;
    color: #303133;
  }
}
</style>
