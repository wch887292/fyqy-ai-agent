<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">业绩归属台账</h3>
      <p class="page-desc">
        记录各合伙人归属的鞋材订单业绩与预估分成，落地飞扬企源「分利」体系。V1.0 仅核算预估分成，不作实发分红
      </p>

      <!-- 汇总卡片 -->
      <div class="stat-grid summary-grid">
        <div class="stat-card big">
          <div class="label">业绩总额</div>
          <div class="value">{{ money(summary.total_performance) }}</div>
          <div class="sub">已登记业绩累计</div>
        </div>
        <div class="stat-card success big">
          <div class="label">预估分成总额</div>
          <div class="value">{{ money(summary.total_estimate) }}</div>
          <div class="sub">按各合伙人分成比例估算</div>
        </div>
      </div>
      <el-alert
        v-if="summary.note"
        class="mt-12"
        type="warning"
        :closable="false"
        show-icon
        :title="summary.note"
      />

      <div class="filter-bar mt-12">
        <el-select
          v-model="query.user_id"
          placeholder="合伙人"
          clearable
          filterable
          style="width: 170px"
          @change="reload"
        >
          <el-option v-for="u in partnerOpts" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-date-picker
          v-model="query.period"
          type="month"
          value-format="YYYY-MM"
          placeholder="归属期间"
          style="width: 160px"
          @change="reload"
        />
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Download" @click="doExport">导出 CSV</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">登记业绩</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="real_name" label="合伙人" width="130" />
        <el-table-column label="关联订单号" min-width="150">
          <template #default="{ row }">
            <span v-if="row.order_no">{{ row.order_no }}</span>
            <span v-else class="text-sub">手工录入</span>
          </template>
        </el-table-column>
        <el-table-column label="业绩金额" width="140" align="right">
          <template #default="{ row }">{{ money(row.performance_amount) }}</template>
        </el-table-column>
        <el-table-column label="分成比例" width="100" align="center">
          <template #default="{ row }">{{ row.ratio }}%</template>
        </el-table-column>
        <el-table-column label="预估分成" width="140" align="right">
          <template #default="{ row }">
            <span class="text-success">{{ money(row.estimate_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="period" label="归属期间" width="110" align="center" />
        <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip />
        <el-table-column label="录入时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="danger" :icon="Delete" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

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

    <!-- 登记弹窗 -->
    <el-dialog v-model="addVisible" title="登记业绩归属" width="520px" @closed="resetAdd">
      <el-form :model="form" label-width="96px">
        <el-form-item label="合伙人" required>
          <el-select v-model="form.user_id" filterable placeholder="选择合伙人" style="width: 100%" @change="onUserChange">
            <el-option v-for="u in partnerOpts" :key="u.id" :label="u.real_name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联订单" required>
          <el-input v-model="form.order_no" placeholder="订单编号，无则留空作手工录入" />
        </el-form-item>
        <el-form-item label="业绩金额" required>
          <el-input-number v-model="form.performance_amount" :min="0" :precision="2" :step="100" style="width: 100%" @change="calcPreview" />
        </el-form-item>
        <el-form-item label="分成比例">
          <el-input-number v-model="form.ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" @change="calcPreview" />
          <span class="text-sub ml-8">%，默认取该合伙人配置比例</span>
        </el-form-item>
        <el-form-item label="归属期间">
          <el-date-picker v-model="form.period" type="month" value-format="YYYY-MM" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="如：EVA 中底料大客户返单业绩" />
        </el-form-item>
        <el-alert
          v-if="previewVisible"
          type="success"
          :closable="false"
          show-icon
          :title="`预估分成：${money(previewAmount)}（业绩 ${money(form.performance_amount)} × ${form.ratio}%）`"
        />
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Delete, Download, Plus, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { partnerApi } from '../../api';
import { useUserStore } from '../../store/user';

const store = useUserStore();

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const partnerOpts = ref<any[]>([]);

const summary = reactive({ total_performance: 0, total_estimate: 0, note: '' });

const query = reactive({ page: 1, size: 10, user_id: '', period: '' });

const addVisible = ref(false);
const saving = ref(false);
const form = reactive({
  user_id: '',
  order_no: '',
  performance_amount: 0,
  ratio: 0,
  period: '',
  remark: '',
});
const previewAmount = ref(0);
const previewVisible = ref(false);

function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
}
function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadPartners() {
  const opts: any = await partnerApi.options();
  partnerOpts.value = (opts || []).filter((o: any) => o.is_partner === 1);
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await partnerApi.performancePage({
      page: query.page,
      size: query.size,
      user_id: query.user_id || undefined,
      period: query.period || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
    if (res.summary) {
      summary.total_performance = res.summary.total_performance || 0;
      summary.total_estimate = res.summary.total_estimate || 0;
      summary.note = res.summary.note || '';
    }
  } catch (e: any) {
    // 错误已由全局拦截处理
  } finally {
    loading.value = false;
  }
}

function calcPreview() {
  previewVisible.value = true;
  previewAmount.value = Number(((Number(form.performance_amount) || 0) * (Number(form.ratio) || 0)) / 100).toFixed(2);
}

async function onUserChange(uid: number) {
  if (!uid) return;
  try {
    const cfg: any = await partnerApi.getConfig(uid);
    if (cfg && cfg.default_ratio) form.ratio = Number(cfg.default_ratio);
  } catch {
    // 取不到默认比例则保持 0
  }
  calcPreview();
}

function openAdd() {
  addVisible.value = true;
  if (!form.period) {
    const d = new Date();
    form.period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}

function resetAdd() {
  form.user_id = '';
  form.order_no = '';
  form.performance_amount = 0;
  form.ratio = 0;
  form.period = '';
  form.remark = '';
  previewVisible.value = false;
  previewAmount.value = 0;
}

async function save() {
  if (!form.user_id) return ElMessage.warning('请选择合伙人');
  if (!form.performance_amount || form.performance_amount <= 0) return ElMessage.warning('业绩金额必须大于 0');
  saving.value = true;
  try {
    await partnerApi.savePerformance({
      user_id: form.user_id,
      order_no: form.order_no || '',
      performance_amount: form.performance_amount,
      ratio: form.ratio,
      period: form.period,
      remark: form.remark,
    });
    ElMessage.success('业绩登记成功');
    addVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    saving.value = false;
  }
}

async function remove(row: any) {
  await ElMessageBox.confirm(`确认删除「${row.real_name}」该条业绩台账？`, '删除确认', { type: 'warning' });
  try {
    await partnerApi.removePerformance(row.id);
    ElMessage.success('已删除');
    await reload();
  } catch (e: any) {
    // 全局拦截
  }
}

async function doExport() {
  const rows: any[] = list.value;
  if (!rows.length) return ElMessage.warning('当前页无可导出数据');
  const headers = ['合伙人', '关联订单号', '业绩金额', '分成比例', '预估分成', '归属期间', '备注', '录入时间'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.real_name,
        r.order_no || '手工录入',
        r.performance_amount,
        r.ratio,
        r.estimate_amount,
        r.period,
        r.remark || '',
        fmt(r.created_at),
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  // \ufeff 防止 Excel 打开中文乱码
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `业绩台账_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  ElMessage.success(`已导出 ${rows.length} 条`);
}

onMounted(() => {
  loadPartners();
  reload();
});
</script>

<style scoped lang="scss">
.summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 640px;
}

.stat-card.big .value {
  font-size: 30px;
}

.ml-8 {
  margin-left: 8px;
}
</style>
