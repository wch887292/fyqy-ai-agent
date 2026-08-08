<template>
  <div class="page" v-loading="loading">
    <div class="page-card">
      <h3 class="page-title">销售统计</h3>
      <p class="page-desc">
        按你的数据权限汇总客户与跟进情况，用来判断手上客户结构是否健康、有没有客户被漏跟
      </p>
      <div class="toolbar">
        <span class="text-sub tiny">数据更新至 {{ updatedAt }}</span>
        <el-button :icon="Refresh" @click="load">刷新数据</el-button>
      </div>
    </div>

    <div class="stat-grid mt-12">
      <div class="stat-card">
        <div class="label">客户总数</div>
        <div class="value">{{ stat.customer_total ?? 0 }}</div>
        <div class="sub">名下私有客户</div>
      </div>
      <div class="stat-card success">
        <div class="label">今日新增</div>
        <div class="value">{{ stat.today_new ?? 0 }}</div>
        <div class="sub">当日建档客户</div>
      </div>
      <div class="stat-card">
        <div class="label">公海客户</div>
        <div class="value">{{ stat.public_total ?? 0 }}</div>
        <div class="sub">全员可认领</div>
      </div>
      <div class="stat-card">
        <div class="label">跟进总数</div>
        <div class="value">{{ stat.follow_total ?? 0 }}</div>
        <div class="sub">累计跟进记录</div>
      </div>
      <div class="stat-card success">
        <div class="label">今日跟进</div>
        <div class="value">{{ stat.today_follow ?? 0 }}</div>
        <div class="sub">当日动作量</div>
      </div>
      <div class="stat-card danger">
        <div class="label">逾期未跟进</div>
        <div class="value text-danger">{{ stat.overdue_total ?? 0 }}</div>
        <div class="sub">已过约定时间</div>
      </div>
    </div>

    <el-row :gutter="14" class="mt-12">
      <el-col :xs="24" :lg="12">
        <div class="page-card">
          <h3 class="page-title">客户意向等级分布</h3>
          <p class="page-desc">A 高意向 / B 潜在 / C 普通 / D 沉睡，由 AI 依据跟进频次与沟通内容打分</p>
          <div ref="pieRef" class="chart"></div>
        </div>
      </el-col>
      <el-col :xs="24" :lg="12">
        <div class="page-card">
          <h3 class="page-title">近 7 日新增客户趋势</h3>
          <p class="page-desc">观察获客节奏是否稳定，连续为零说明前端线索供给不足</p>
          <div ref="lineRef" class="chart"></div>
        </div>
      </el-col>
    </el-row>

    <div class="page-card">
      <h3 class="page-title">数据解读</h3>
      <p class="page-desc">根据当前统计结果自动生成的经营提示</p>
      <div class="ai-box">{{ interpretation }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import * as echarts from 'echarts';
import { Refresh } from '@element-plus/icons-vue';
import { crmApi } from '../../api';

const loading = ref(false);
const stat = ref<any>({});
const updatedAt = ref('');
const pieRef = ref<HTMLElement>();
const lineRef = ref<HTMLElement>();
let pieChart: echarts.ECharts | null = null;
let lineChart: echarts.ECharts | null = null;

const gradeColor: Record<string, string> = {
  A: '#dc2626',
  B: '#f59e0b',
  C: '#2563eb',
  D: '#9ca3af',
};

const gradeLabel: Record<string, string> = {
  A: 'A级 高意向',
  B: 'B级 潜在客户',
  C: 'C级 普通',
  D: 'D级 沉睡',
};

async function load() {
  loading.value = true;
  try {
    stat.value = (await crmApi.stat()) || {};
    updatedAt.value = fmt(new Date());
    await nextTick();
    renderPie();
    renderLine();
  } finally {
    loading.value = false;
  }
}

function renderPie() {
  const dist: Array<any> = stat.value.grade_dist || [];
  if (!pieRef.value) return;
  if (!pieChart) pieChart = echarts.init(pieRef.value);

  const data = dist.map((d) => ({
    name: gradeLabel[d.grade] || d.grade,
    value: Number(d.count || 0),
    itemStyle: { color: gradeColor[d.grade] || '#9ca3af' },
  }));

  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}：{c} 个（{d}%）' },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['45%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { formatter: '{b}\n{c}', fontSize: 12, color: '#6b7280' },
        labelLine: { length: 10, length2: 10 },
        data,
      },
    ],
  });
}

function renderLine() {
  const trend: Array<any> = stat.value.trend_7d || [];
  if (!lineRef.value) return;
  if (!lineChart) lineChart = echarts.init(lineRef.value);

  lineChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 24, bottom: 30 },
    xAxis: {
      type: 'category',
      data: trend.map((d) => String(d.date || '').slice(5)),
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
        name: '新增客户',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        data: trend.map((d) => Number(d.count || 0)),
        itemStyle: { color: '#2563eb' },
        lineStyle: { width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(37,99,235,0.22)' },
            { offset: 1, color: 'rgba(37,99,235,0.02)' },
          ]),
        },
      },
    ],
  });
}

/* ---------- 文字解读 ---------- */
const interpretation = computed(() => {
  const s = stat.value;
  if (!s || !Object.keys(s).length) return '暂无统计数据。';

  const dist: Array<any> = s.grade_dist || [];
  const trend: Array<any> = s.trend_7d || [];
  const total = Number(s.customer_total || 0);
  const cnt = (g: string) => Number(dist.find((d) => d.grade === g)?.count || 0);
  const ab = cnt('A') + cnt('B');
  const weekNew = trend.reduce((a, b) => a + Number(b.count || 0), 0);
  const lines: string[] = [];

  lines.push(
    `当前名下私有客户 ${total} 个，公海 ${s.public_total || 0} 个，累计跟进 ${s.follow_total || 0} 次，今日新增客户 ${s.today_new || 0} 个、跟进 ${s.today_follow || 0} 次。`,
  );

  if (total > 0) {
    const rate = ((ab / total) * 100).toFixed(1);
    lines.push(
      `A/B 类高潜客户 ${ab} 个，占比 ${rate}%；C 类 ${cnt('C')} 个、D 类沉睡 ${cnt('D')} 个。` +
        (ab / total < 0.3
          ? '高潜占比偏低，建议加密对 C 类客户的价值沟通，把样品测试、打样反馈这类推进动作做实。'
          : '客户结构较为健康，注意维持对 A/B 类客户的跟进节奏，避免临门一脚掉链子。'),
    );
    if (cnt('D') > 0 && cnt('D') / total >= 0.3) {
      lines.push(`沉睡客户已占 ${((cnt('D') / total) * 100).toFixed(1)}%，可挑选有过打样记录的批量做一轮唤醒触达，长期无进展的建议主动移入公海。`);
    }
  } else {
    lines.push('目前名下还没有客户，先从公海认领或新建客户开始。');
  }

  if (Number(s.overdue_total || 0) > 0) {
    lines.push(`当前有 ${s.overdue_total} 个客户逾期未跟进，建议优先安排触达，逾期越久客户流失与退回公海的风险越高。`);
  } else {
    lines.push('所有客户均在约定时间内完成跟进，暂无逾期。');
  }

  if (Number(s.today_follow || 0) === 0) {
    lines.push('今天还没有任何跟进记录，记得把电话与微信沟通及时补录，日报数据会据此自动统计。');
  }

  lines.push(
    `近 7 日累计新增客户 ${weekNew} 个` +
      (weekNew === 0 ? '，获客处于停滞状态，需要补充线索来源。' : `，日均 ${(weekNew / 7).toFixed(1)} 个。`),
  );

  return lines.join('\n');
});

const onResize = () => {
  pieChart?.resize();
  lineChart?.resize();
};

onMounted(() => {
  load();
  window.addEventListener('resize', onResize);
});

onActivated(() => {
  pieChart?.resize();
  lineChart?.resize();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  pieChart?.dispose();
  lineChart?.dispose();
  pieChart = null;
  lineChart = null;
});

/* ---------- 工具 ---------- */
function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.chart {
  height: 300px;
  width: 100%;
}

.tiny {
  font-size: 11px;
}
</style>
