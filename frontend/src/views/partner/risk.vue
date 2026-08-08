<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">风险预警记录</h3>
      <p class="page-desc">
        系统按「分风险」体系每日扫描客户逾期跟进、订单异常、库存缺货三类风险，并推送至对应合伙人
      </p>

      <el-alert
        class="mt-12"
        type="info"
        :closable="false"
        show-icon
        title="风险处理将标记本条预警为已处理，便于台账追溯；未处理项纳入合伙人待办"
      />

      <div class="filter-bar mt-12">
        <el-select v-model="query.risk_type" placeholder="风险类型" clearable style="width: 170px" @change="reload">
          <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
        </el-select>
        <el-select v-model="query.handled" placeholder="处理状态" clearable style="width: 150px" @change="reload">
          <el-option label="待处理" :value="0" />
          <el-option label="已处理" :value="1" />
        </el-select>
        <el-select v-model="query.level" placeholder="风险等级" clearable style="width: 150px" @change="reload">
          <el-option label="高" value="高" />
          <el-option label="中" value="中" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button type="warning" :icon="Refresh" :loading="scanning" @click="scan">立即扫描</el-button>
      </div>

      <el-table :data="shownList" v-loading="loading" border stripe>
        <el-table-column prop="real_name" label="合伙人" width="120" />
        <el-table-column label="风险类型" width="130" align="center">
          <template #default="{ row }">
            <el-tag :type="typeTag(row.risk_type)" size="small" effect="plain">{{ row.risk_type_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.risk_level === '高' ? 'danger' : 'warning'" size="small" effect="dark">{{ row.risk_level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="风险内容" min-width="240" show-overflow-tooltip />
        <el-table-column label="AI 建议" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.ai_advice" class="text-sub">{{ row.ai_advice }}</span>
            <span v-else class="text-sub">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.handled ? 'success' : 'info'" size="small" effect="dark">
              {{ row.handled ? '已处理' : '待处理' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="View" @click="view(row)">查看</el-button>
            <el-button
              v-if="!row.handled"
              link
              type="success"
              :icon="Check"
              @click="handle(row)"
            >处理</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无风险预警记录，可点击「立即扫描」触发一次全量检查
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

    <!-- 风险详情弹窗 -->
    <el-dialog v-model="detailVisible" title="风险预警详情" width="560px">
      <template v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="合伙人">{{ current.real_name }}</el-descriptions-item>
          <el-descriptions-item label="风险类型">{{ current.risk_type_text }}</el-descriptions-item>
          <el-descriptions-item label="风险等级">
            <el-tag :type="current.risk_level === '高' ? 'danger' : 'warning'" size="small" effect="dark">{{ current.risk_level }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ current.handled ? '已处理' : '待处理' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间" :span="2">{{ fmt(current.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="风险内容" :span="2">{{ current.content }}</el-descriptions-item>
          <el-descriptions-item label="AI 处置建议" :span="2">
            <span v-if="current.ai_advice">{{ current.ai_advice }}</span>
            <span v-else class="text-sub">暂无</span>
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="current && !current.handled"
          type="success"
          :loading="handling"
          @click="confirmHandle"
        >标记已处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Check, Refresh, Search, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { partnerApi } from '../../api';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const scanning = ref(false);
const handling = ref(false);

const typeOpts = [
  { v: 'follow_overdue', l: '客户逾期未跟进' },
  { v: 'order_abnormal', l: '订单异常' },
  { v: 'stock_warn', l: '库存缺货' },
];

const query = reactive({ page: 1, size: 10, risk_type: '', handled: '', level: '' });

const detailVisible = ref(false);
const current = ref<any>(null);

// 后端仅支持 risk_type / handled 服务端过滤，等级在前端对当前页做二次筛选
const shownList = computed(() => {
  if (!query.level) return list.value;
  return list.value.filter((r) => r.risk_level === query.level);
});

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function typeTag(t: string) {
  return t === 'order_abnormal' ? 'danger' : t === 'stock_warn' ? 'warning' : 'info';
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await partnerApi.riskPage({
      page: query.page,
      size: query.size,
      risk_type: query.risk_type || undefined,
      handled: query.handled === '' ? undefined : Number(query.handled),
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

function view(row: any) {
  current.value = row;
  detailVisible.value = true;
}

function handle(row: any) {
  current.value = row;
  detailVisible.value = true;
}

async function confirmHandle() {
  if (!current.value) return;
  await ElMessageBox.confirm('确认将该条风险预警标记为已处理？', '处理确认', { type: 'warning' });
  handling.value = true;
  try {
    await partnerApi.handleRisk({ id: current.value.id });
    ElMessage.success('已标记为已处理');
    detailVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    handling.value = false;
  }
}

async function scan() {
  scanning.value = true;
  try {
    const res: any = await partnerApi.scanRisk();
    const created = res?.created ?? 0;
    ElMessage.success(`扫描完成，新增预警 ${created} 条`);
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    scanning.value = false;
  }
}

reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}
</style>
