<template>
  <div class="page" v-loading="loading">
    <!-- 顶部欢迎与快捷入口 -->
    <div class="page-card welcome-card">
      <div class="welcome-left">
        <h2 class="hi">{{ greeting }}，{{ realName }}</h2>
        <p class="sub">
          {{ today }} · {{ profile?.dept_name }} · {{ profile?.post }}
          <el-tag size="small" effect="plain" class="ml-8">
            数据范围：{{ data.overview?.data_scope_text || '-' }}
          </el-tag>
        </p>
      </div>
      <div class="shortcuts">
        <div v-for="s in shortcutList" :key="s.code" class="shortcut" @click="go(s.path)">
          {{ s.name }}
        </div>
      </div>
    </div>

    <el-alert
      v-if="notice"
      class="mt-12"
      type="info"
      :closable="false"
      show-icon
      :title="notice"
    />

    <!-- 统计卡片 -->
    <div class="stat-grid mt-12">
      <div class="stat-card">
        <div class="label">客户总数</div>
        <div class="value">{{ ov.customer_total ?? 0 }}</div>
        <div class="sub">公海 {{ ov.public_pool_total ?? 0 }} 个</div>
      </div>
      <div class="stat-card success">
        <div class="label">今日订单</div>
        <div class="value">{{ ov.order_today ?? 0 }}</div>
        <div class="sub">金额 {{ money(ov.amount_today) }}</div>
      </div>
      <div class="stat-card">
        <div class="label">今日跟进</div>
        <div class="value">{{ ov.follow_today ?? 0 }}</div>
        <div class="sub">进行中订单 {{ ov.order_processing ?? 0 }} 笔</div>
      </div>
      <div class="stat-card warn">
        <div class="label">库存预警</div>
        <div class="value">{{ ov.stock_warn_total ?? 0 }}</div>
        <div class="sub">待处理</div>
      </div>
      <div class="stat-card">
        <div class="label">知识库文档</div>
        <div class="value">{{ ov.doc_total ?? 0 }}</div>
        <div class="sub">产品 {{ ov.product_total ?? 0 }} 项</div>
      </div>
      <div class="stat-card">
        <div class="label">在职员工</div>
        <div class="value">{{ ov.user_total ?? 0 }}</div>
        <div class="sub">{{ enterpriseName }}</div>
      </div>
    </div>

    <el-row :gutter="14" class="mt-12">
      <!-- 左：今日待办 -->
      <el-col :xs="24" :lg="14">
        <div class="page-card">
          <h3 class="page-title">
            今日待办
            <el-tag v-if="todoTotal" type="danger" size="small" effect="dark">{{ todoTotal }}</el-tag>
          </h3>
          <p class="page-desc">系统按业务规则自动汇总，点击可直接跳转处理</p>

          <el-tabs v-model="todoTab">
            <el-tab-pane :label="`待跟进客户 ${todo.follow_customers?.total || 0}`" name="follow">
              <div v-if="!todo.follow_customers?.list?.length" class="empty-tip">暂无逾期未跟进客户</div>
              <div
                v-for="c in todo.follow_customers?.list || []"
                :key="c.id"
                class="todo-item"
                @click="go('/crm/customer')"
              >
                <div class="ti-main">
                  <b>{{ c.customer_name }}</b>
                  <span class="text-sub">{{ c.company_name }}</span>
                  <el-tag :type="gradeType(c.grade)" size="small" effect="plain">
                    {{ c.grade }}级 / {{ c.intention_score }}分
                  </el-tag>
                </div>
                <div class="ti-side text-danger">{{ c.reason }}</div>
              </div>
            </el-tab-pane>

            <el-tab-pane :label="`库存预警 ${todo.stock_warns?.total || 0}`" name="stock">
              <div v-if="!todo.stock_warns?.list?.length" class="empty-tip">库存水位正常</div>
              <div
                v-for="w in todo.stock_warns?.list || []"
                :key="w.id"
                class="todo-item"
                @click="go('/erp/stock')"
              >
                <div class="ti-main">
                  <b>{{ w.product_name }}</b>
                  <span class="text-warning">库存 {{ w.stock_num }} / 预警线 {{ w.warn_stock }}</span>
                </div>
                <div class="ti-advice">{{ w.ai_advice }}</div>
              </div>
            </el-tab-pane>

            <el-tab-pane :label="`订单异常 ${todo.abnormal_orders?.total || 0}`" name="order">
              <div v-if="!todo.abnormal_orders?.list?.length" class="empty-tip">暂无异常订单</div>
              <div
                v-for="o in todo.abnormal_orders?.list || []"
                :key="o.id"
                class="todo-item"
                @click="go('/erp/order')"
              >
                <div class="ti-main">
                  <b>{{ o.order_no }}</b>
                  <span class="text-sub">{{ o.customer_name }}</span>
                  <el-tag size="small" effect="plain">{{ o.order_status }}</el-tag>
                  <span>{{ money(o.total_amount) }}</span>
                </div>
                <div class="ti-side text-danger">{{ o.reason }}</div>
              </div>
            </el-tab-pane>

            <el-tab-pane :label="`合伙人风险 ${todo.partner_risks?.total || 0}`" name="risk">
              <div v-if="!todo.partner_risks?.list?.length" class="empty-tip">暂无未处理风险</div>
              <div
                v-for="r in todo.partner_risks?.list || []"
                :key="r.id"
                class="todo-item"
                @click="go('/partner/risk')"
              >
                <div class="ti-main">
                  <b>{{ r.partner_name }}</b>
                  <el-tag :type="riskType(r.risk_level)" size="small" effect="dark">
                    {{ r.risk_level }}
                  </el-tag>
                  <span class="text-sub">{{ r.risk_type }}</span>
                </div>
                <div class="ti-side">{{ r.risk_desc }}</div>
              </div>
            </el-tab-pane>
          </el-tabs>

          <el-alert
            v-if="todo.daily_report_done === false"
            class="mt-12"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #title>
              今日销售日报尚未填写，
              <el-link type="primary" :underline="false" @click="go('/crm/daily')">立即填写</el-link>
            </template>
          </el-alert>
        </div>
      </el-col>

      <!-- 右：AI 经营简报 + 趋势 -->
      <el-col :xs="24" :lg="10">
        <div class="page-card">
          <h3 class="page-title">
            AI 经营简报
            <span class="ai-tag">{{ providerText }}</span>
            <el-button link type="primary" size="small" :loading="briefLoading" @click="refreshBrief">
              重新生成
            </el-button>
          </h3>
          <p class="page-desc">{{ brief.date }} 自动汇总当日经营数据并给出建议</p>
          <div class="ai-box">{{ brief.content || '暂无简报' }}</div>
          <div v-if="brief.fallback_reason" class="fallback-tip">
            注：{{ brief.fallback_reason }}，当前为规则引擎输出
          </div>
        </div>

        <div class="page-card">
          <h3 class="page-title">近 7 日经营趋势</h3>
          <p class="page-desc">新增客户 / 订单笔数 / 订单金额</p>
          <div ref="chartRef" class="chart"></div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { workbenchApi } from '../../api';
import { useUserStore } from '../../store/user';

const router = useRouter();
const store = useUserStore();

const loading = ref(false);
const briefLoading = ref(false);
const todoTab = ref('follow');
const data = ref<any>({});
const chartRef = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

const profile = computed(() => store.profile);
const realName = computed(() => store.realName);
const enterpriseName = computed(() => store.enterpriseName);
const ov = computed(() => data.value.overview || {});
const todo = computed(() => data.value.todo || {});
const brief = computed(() => data.value.briefing || {});
const shortcutList = computed(() => data.value.shortcuts?.list || []);
const notice = computed(() => data.value.shortcuts?.notice || '');
const providerText = computed(() =>
  brief.value.provider === 'mock' ? '规则引擎' : brief.value.provider ? 'OpenClaw' : '',
);

const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const greeting = (() => {
  const h = new Date().getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
})();

const todoTotal = computed(() => {
  const t = todo.value;
  return (
    (t.follow_customers?.total || 0) +
    (t.stock_warns?.total || 0) +
    (t.abnormal_orders?.total || 0) +
    (t.partner_risks?.total || 0)
  );
});

function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
}

function gradeType(g: string) {
  return g === 'A' ? 'danger' : g === 'B' ? 'warning' : g === 'C' ? 'info' : 'info';
}

function riskType(l: string) {
  return l === '高' ? 'danger' : l === '中' ? 'warning' : 'info';
}

function go(path: string) {
  router.push(path);
}

async function load() {
  loading.value = true;
  try {
    data.value = await workbenchApi.index();
    await nextTick();
    renderChart();
  } finally {
    loading.value = false;
  }
}

async function refreshBrief() {
  briefLoading.value = true;
  try {
    const res: any = await workbenchApi.aiBriefing();
    data.value.briefing = res;
  } finally {
    briefLoading.value = false;
  }
}

function renderChart() {
  // 后端 trend 为 [{ date, customer, order, amount }]
  const trend: Array<any> = data.value.trend || [];
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['新增客户', '订单笔数', '订单金额'], bottom: 0, textStyle: { fontSize: 12 } },
    grid: { left: 40, right: 50, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: trend.map((d) => d.date),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        splitLine: { lineStyle: { color: '#f0f2f5' } },
        axisLabel: { color: '#6b7280', fontSize: 11 },
      },
      {
        type: 'value',
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
        name: '新增客户',
        type: 'bar',
        data: trend.map((d) => d.customer),
        itemStyle: { color: '#93c5fd', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 18,
      },
      {
        name: '订单笔数',
        type: 'bar',
        data: trend.map((d) => d.order),
        itemStyle: { color: '#2563eb', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 18,
      },
      {
        name: '订单金额',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: trend.map((d) => d.amount),
        itemStyle: { color: '#dc2626' },
        lineStyle: { width: 2 },
      },
    ],
  });
}

const onResize = () => chart?.resize();

onMounted(() => {
  load();
  window.addEventListener('resize', onResize);
});

onActivated(() => chart?.resize());

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
  chart = null;
});
</script>

<style scoped lang="scss">
.welcome-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.hi {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 4px;
}

.sub {
  font-size: 13px;
  color: var(--fae-text-sub);
  margin: 0;
}

.ml-8 {
  margin-left: 8px;
}

.shortcuts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.shortcut {
  padding: 7px 14px;
  border: 1px solid var(--fae-border);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;

  &:hover {
    border-color: var(--fae-primary);
    color: var(--fae-primary);
    background: var(--fae-primary-light);
  }
}

.todo-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fafbfc;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--fae-primary-light);
  }
}

.ti-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;

  b {
    font-size: 14px;
  }
}

.ti-side {
  font-size: 12px;
  margin-top: 4px;
  color: var(--fae-text-sub);
}

.ti-advice {
  font-size: 12px;
  margin-top: 6px;
  color: #1d4ed8;
  background: #eff6ff;
  padding: 6px 8px;
  border-radius: 6px;
  line-height: 1.7;
}

.fallback-tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-top: 8px;
}

.chart {
  height: 260px;
  width: 100%;
}
</style>
