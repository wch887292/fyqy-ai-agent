<template>
  <div class="page">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">今日操作数</div>
        <div class="value">{{ todayCount }}</div>
        <div class="sub">仅统计新增、修改、删除等写操作</div>
      </div>
      <div class="stat-card danger">
        <div class="label">累计失败操作</div>
        <div class="value">{{ stat.fail_total ?? 0 }}</div>
        <div class="sub">需关注是否为权限或参数问题</div>
      </div>
      <div class="stat-card success">
        <div class="label">近 7 日操作总数</div>
        <div class="value">{{ weekTotal }}</div>
        <div class="sub">反映系统实际使用活跃度</div>
      </div>
      <div class="stat-card warn">
        <div class="label">本页平均耗时</div>
        <div class="value">{{ avgCost }}<span class="unit">ms</span></div>
        <div class="sub">接口响应耗时，持续偏高需排查</div>
      </div>
    </div>

    <div class="page-card mt-12">
      <h3 class="page-title">近 7 日操作趋势</h3>
      <p class="page-desc">按天统计写操作次数，可用于判断系统使用节奏与异常时段</p>
      <div ref="chartRef" class="chart"></div>
    </div>

    <div class="page-card">
      <h3 class="page-title">操作日志</h3>
      <p class="page-desc">
        完整记录所有数据变更操作的执行人、来源 IP 与入参，用于责任追溯与故障排查；密码、密钥等敏感字段已自动脱敏
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.username"
          placeholder="操作人姓名"
          clearable
          style="width: 180px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.module" placeholder="业务模块" clearable style="width: 160px" @change="reload">
          <el-option v-for="m in modules" :key="m" :label="m" :value="m" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 250px"
          @change="reload"
        />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button type="danger" plain :icon="Delete" @click="doClean">清理日志</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="操作时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="username" label="操作人" width="110">
          <template #default="{ row }">{{ row.username || '匿名' }}</template>
        </el-table-column>
        <el-table-column prop="module" label="业务模块" width="120" />
        <el-table-column prop="action" label="操作动作" min-width="230">
          <template #default="{ row }">
            <span class="mono">{{ row.action }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方法" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="methodType(row.method)" size="small" effect="dark">{{ row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="来源 IP" width="140">
          <template #default="{ row }">
            <span class="mono">{{ row.ip || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="95" align="center">
          <template #default="{ row }">
            <span :class="{ 'text-warning': row.cost_ms > 1000 }">{{ row.cost_ms ?? 0 }} ms</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small" effect="plain">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="参数" width="90" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openParams(row)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 参数详情 -->
    <el-dialog v-model="paramsVisible" title="操作详情" width="680px">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="操作人">{{ current?.username || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作时间">{{ fmt(current?.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="业务模块">{{ current?.module || '-' }}</el-descriptions-item>
        <el-descriptions-item label="来源 IP">{{ current?.ip || '-' }}</el-descriptions-item>
        <el-descriptions-item label="请求地址" :span="2">
          <span class="mono">{{ current?.url || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="current && !current.success" label="错误信息" :span="2">
          <span class="text-danger">{{ current.error_msg || '未记录' }}</span>
        </el-descriptions-item>
      </el-descriptions>

      <h4 class="sec-title mt-12">请求参数</h4>
      <pre class="json-box">{{ prettyParams }}</pre>

      <template #footer>
        <el-button @click="paramsVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Delete, Search } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import { systemApi } from '../../api';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const stat = ref<any>({ trend: [], fail_total: 0 });
const dateRange = ref<[string, string] | null>(null);
const chartRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const query = reactive<any>({ page: 1, username: '', module: '' });

const modules = [
  'AI工作台',
  '组织管理',
  'AI知识库',
  'AI销售CRM',
  'AI-ERP',
  '合伙人管理',
  '系统设置',
  'AI中间层',
  '其他',
];

const todayCount = computed(() => {
  const trend: any[] = stat.value.trend || [];
  return trend.length ? trend[trend.length - 1].count : 0;
});

const weekTotal = computed(() =>
  (stat.value.trend || []).reduce((s: number, d: any) => s + Number(d.count || 0), 0),
);

const avgCost = computed(() => {
  if (!list.value.length) return 0;
  const sum = list.value.reduce((s, r) => s + Number(r.cost_ms || 0), 0);
  return Math.round(sum / list.value.length);
});

async function load() {
  loading.value = true;
  try {
    const params: any = { ...query, size: 20 };
    if (dateRange.value?.length === 2) {
      params.start_date = dateRange.value[0];
      params.end_date = dateRange.value[1];
    }
    const res: any = await systemApi.logPage(params);
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

async function loadStat() {
  stat.value = (await systemApi.logStat()) as any;
  await nextTick();
  renderChart();
}

function renderChart() {
  const trend: any[] = stat.value.trend || [];
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);

  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f0f2f5' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    series: [
      {
        name: '操作次数',
        type: 'line',
        smooth: true,
        data: trend.map((d) => d.count),
        itemStyle: { color: '#2563eb' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37,99,235,0.22)' },
              { offset: 1, color: 'rgba(37,99,235,0.02)' },
            ],
          },
        },
      },
    ],
  });
}

const onResize = () => chart?.resize();

onMounted(() => {
  load();
  loadStat();
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});

/* ---------- 参数详情 ---------- */
const paramsVisible = ref(false);
const current = ref<any>(null);

const prettyParams = computed(() => {
  const raw = current.value?.params;
  if (!raw) return '（无请求参数）';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return String(raw);
  }
});

function openParams(row: any) {
  current.value = row;
  paramsVisible.value = true;
}

/* ---------- 清理日志 ---------- */
function doClean() {
  ElMessageBox.prompt('请输入需要保留的天数，早于该期限的日志将被永久删除，系统最少保留 7 天', '清理历史日志', {
    inputValue: '90',
    inputPattern: /^\d+$/,
    inputErrorMessage: '请输入正整数天数',
    type: 'warning',
    confirmButtonText: '确认清理',
  })
    .then(async ({ value }) => {
      const days = Math.max(7, Number(value));
      await ElMessageBox.confirm(
        `将删除 ${days} 天以前的全部操作日志，该操作不可恢复，确定继续吗？`,
        '二次确认',
        { type: 'warning' },
      );
      const res: any = await systemApi.cleanLog({ days });
      ElMessage.success(`已清理 ${res.deleted} 条日志，保留最近 ${res.keep_days} 天`);
      load();
      loadStat();
    })
    .catch(() => void 0);
}

/* ---------- 工具 ---------- */
function methodType(m: string) {
  if (m === 'POST') return 'primary';
  if (m === 'PUT') return 'warning';
  if (m === 'DELETE') return 'danger';
  return 'info';
}

function fmt(v: any) {
  if (!v) return '-';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.chart {
  height: 240px;
  width: 100%;
}

.unit {
  font-size: 14px;
  font-weight: 400;
  margin-left: 2px;
  color: var(--fae-text-sub);
}

.mono {
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
}

.sec-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.json-box {
  background: #f8fafc;
  border: 1px solid var(--fae-border);
  border-radius: 8px;
  padding: 12px;
  margin: 0;
  max-height: 320px;
  overflow: auto;
  font-family: Consolas, Monaco, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
