<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">经营日报</h3>
      <p class="page-desc">
        按日汇总订单、客户与库存关键指标，并由 AI 生成当日经营解读与次日行动建议，替代人工抄表统计
      </p>

      <div class="filter-bar">
        <el-date-picker
          v-model="date"
          type="date"
          placeholder="选择日期"
          value-format="YYYY-MM-DD"
          :clearable="false"
          style="width: 180px"
          @change="loadDaily"
        />
        <el-button-group>
          <el-button @click="shift(-1)">前一天</el-button>
          <el-button @click="toToday">今天</el-button>
          <el-button :disabled="isToday" @click="shift(1)">后一天</el-button>
        </el-button-group>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" :loading="loading" @click="loadDaily">重新生成</el-button>
      </div>

      <div class="stat-grid" v-loading="loading">
        <div class="stat-card">
          <div class="label">订单数</div>
          <div class="value">{{ daily.order_count ?? 0 }}</div>
          <div class="sub">{{ daily.date || date }} 新增</div>
        </div>
        <div class="stat-card">
          <div class="label">订单金额</div>
          <div class="value">{{ money(daily.order_amount) }}</div>
          <div class="sub">含全部状态订单</div>
        </div>
        <div class="stat-card success">
          <div class="label">已完成</div>
          <div class="value">{{ daily.done_count ?? 0 }}</div>
          <div class="sub">已签收结算</div>
        </div>
        <div class="stat-card danger">
          <div class="label">已取消</div>
          <div class="value">{{ daily.cancel_count ?? 0 }}</div>
          <div class="sub">需复盘流失原因</div>
        </div>
        <div class="stat-card">
          <div class="label">新增客户</div>
          <div class="value">{{ daily.new_customer ?? 0 }}</div>
          <div class="sub">当日建档客户</div>
        </div>
        <div class="stat-card warn">
          <div class="label">库存预警</div>
          <div class="value">{{ daily.stock_warn_count ?? 0 }}</div>
          <div class="sub">待处理补货预警</div>
        </div>
      </div>
    </div>

    <div class="page-card">
      <h3 class="page-title">
        AI 经营分析
        <span class="ai-tag">{{ providerText }}</span>
        <div class="flex-1"></div>
        <el-button link type="primary" size="small" :loading="loading" @click="loadDaily">刷新</el-button>
      </h3>
      <p class="page-desc">结合当日订单、客户与库存数据自动生成，可直接用于早会通报</p>
      <div class="ai-box">{{ daily.ai_content || '暂无分析内容' }}</div>
    </div>

    <div class="page-card">
      <h3 class="page-title">订单状态分布</h3>
      <p class="page-desc">按状态统计企业累计订单的笔数与金额，识别卡在生产或发货环节的订单</p>
      <div ref="chartRef" class="chart"></div>
      <div v-if="!hasDist" class="empty-tip">暂无订单数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import * as echarts from 'echarts';
import { Refresh } from '@element-plus/icons-vue';
import { erpApi } from '../../api';

const loading = ref(false);
const daily = ref<any>({});
const dist = ref<any[]>([]);
const chartRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const date = ref(todayStr());

const isToday = computed(() => date.value === todayStr());
const hasDist = computed(() => dist.value.some((d) => Number(d.count) > 0));
const providerText = computed(() =>
  daily.value.provider === 'mock' ? '规则引擎' : daily.value.provider ? 'OpenClaw' : '',
);

async function loadDaily() {
  loading.value = true;
  try {
    daily.value = (await erpApi.aiDaily(date.value)) as any;
  } finally {
    loading.value = false;
  }
}

async function loadOverview() {
  try {
    const res: any = await erpApi.overview();
    dist.value = res.order_status_dist || [];
  } catch {
    dist.value = [];
  }
  await nextTick();
  renderChart();
}

function shift(offset: number) {
  const d = new Date(date.value + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  const next = todayStr(d);
  if (next > todayStr()) return;
  date.value = next;
  loadDaily();
}

function toToday() {
  date.value = todayStr();
  loadDaily();
}

function renderChart() {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['订单笔数', '订单金额'], bottom: 0, textStyle: { fontSize: 12 } },
    grid: { left: 45, right: 60, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: dist.value.map((d) => d.status),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 12 },
    },
    yAxis: [
      {
        type: 'value',
        name: '笔数',
        nameTextStyle: { color: '#6b7280', fontSize: 11 },
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f0f2f5' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
      },
      {
        type: 'value',
        name: '金额',
        nameTextStyle: { color: '#6b7280', fontSize: 11 },
        splitLine: { show: false },
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : String(v)),
        },
      },
    ],
    series: [
      {
        name: '订单笔数',
        type: 'bar',
        data: dist.value.map((d) => d.count),
        itemStyle: { color: '#2563eb', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 36,
        label: { show: true, position: 'top', fontSize: 11, color: '#374151' },
      },
      {
        name: '订单金额',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: dist.value.map((d) => d.amount),
        itemStyle: { color: '#dc2626' },
        lineStyle: { width: 2 },
      },
    ],
  });
}

const onResize = () => chart?.resize();

onMounted(() => {
  loadDaily();
  loadOverview();
  window.addEventListener('resize', onResize);
});

onActivated(() => chart?.resize());

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});

/* ---------- 工具 ---------- */
function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayStr(d: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
</script>

<style scoped lang="scss">
.chart {
  height: 300px;
  width: 100%;
}
</style>
