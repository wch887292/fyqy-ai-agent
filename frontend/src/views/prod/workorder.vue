<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">生产工单</h3>
      <p class="page-desc">
        销售订单审核通过后自动生成工单，支持排产流转、完工登记与一键入库
      </p>

      <el-alert
        class="mt-12"
        type="info"
        :closable="false"
        show-icon
        title="工单状态严格按「待排产 → 生产中 → 部分完成 → 全部完工」流转，完工数量不可超过生产数量；全部完工后可一键入库增加成品库存"
      />

      <div class="filter-bar mt-12">
        <el-input
          v-model="query.product_name"
          placeholder="产品名称"
          clearable
          style="width: 200px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="query.status" placeholder="工单状态" clearable style="width: 150px" @change="search">
          <el-option label="全部" value="" />
          <el-option v-for="s in statusOpts" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Download" :loading="exporting" @click="exportList">导出工单</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建工单</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="工单号" width="180">
          <template #default="{ row }">
            <b>{{ row.work_no }}</b>
          </template>
        </el-table-column>
        <el-table-column label="关联订单" width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.order_id">#{{ row.order_id }}</span>
            <span v-else class="text-sub">手工创建</span>
          </template>
        </el-table-column>
        <el-table-column prop="product_name" label="产品名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="produce_num" label="生产数量" width="90" align="right" />
        <el-table-column label="完工数量" width="150">
          <template #default="{ row }">
            <div class="prog-cell">
              <span>{{ row.finish_num || 0 }} / {{ row.produce_num }}</span>
              <el-progress :percentage="pct(row)" :stroke-width="4" :show-text="false" />
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small" effect="dark">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="计划完工" width="120">
          <template #default="{ row }">
            <span v-if="row.plan_finish_time">{{ fmtDate(row.plan_finish_time) }}</span>
            <span v-else class="text-sub">未排期</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-dropdown v-if="nextOf(row.status).length" trigger="click" @command="(c: any) => onFlow(row, c)">
              <el-button link type="primary" size="small">
                状态流转<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="s in nextOf(row.status)" :key="s" :command="s">{{ s }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button v-else link size="small" disabled>已终态</el-button>

            <el-button
              link
              type="primary"
              size="small"
              :loading="tipId === row.id"
              @click="showTip(row)"
            >AI提示</el-button>

            <el-button
              v-if="row.status === '全部完工' && !stockedIds.includes(row.id)"
              link
              type="success"
              size="small"
              @click="stockIn(row)"
            >完工入库</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无生产工单，可点击「新建工单」手工排产，或等待销售订单审核通过后自动生成
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

    <!-- 部分完成需要登记完工数量，其余状态直接流转 -->
    <el-dialog v-model="flowVisible" title="登记完工数量" width="460px">
      <el-form label-width="100px">
        <el-form-item label="工单号">
          <span>{{ flowRow.work_no }}</span>
        </el-form-item>
        <el-form-item label="生产数量">
          <span>{{ flowRow.produce_num }}</span>
        </el-form-item>
        <el-form-item label="完工数量">
          <el-input-number
            v-model="flowNum"
            :min="1"
            :max="flowRow.produce_num"
            :precision="0"
            style="width: 180px"
          />
        </el-form-item>
      </el-form>
      <div class="tip">完工数量不得超过生产数量；若已全部完成请直接流转为「全部完工」。</div>
      <template #footer>
        <el-button @click="flowVisible = false">取消</el-button>
        <el-button type="primary" :loading="flowSaving" @click="submitPartial">确认登记</el-button>
      </template>
    </el-dialog>

    <!-- 新建工单 -->
    <el-dialog v-model="createVisible" title="新建生产工单" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="产品" required>
          <el-select v-model="form.product_id" filterable placeholder="请选择产品" style="width: 360px">
            <el-option
              v-for="p in products"
              :key="p.id"
              :label="`${p.product_name}（库存 ${p.stock_num} ${p.unit}）`"
              :value="p.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="生产数量" required>
          <el-input-number v-model="form.produce_num" :min="1" :precision="0" :step="10" style="width: 180px" />
        </el-form-item>
        <el-form-item label="计划完工时间">
          <el-date-picker
            v-model="form.plan_finish_time"
            type="date"
            placeholder="计划完工日期"
            value-format="YYYY-MM-DD"
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item label="负责人">
          <el-input-number
            v-model="form.owner_user_id"
            :min="1"
            :precision="0"
            :controls="false"
            placeholder="负责人用户 ID，可不填"
            style="width: 180px"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="如 工艺要求、优先级、原料备注等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">提交工单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ArrowDown, Download, Plus, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { prodApi, erpApi, commonApi, downloadBase64 } from '../../api';

const list = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const exporting = ref(false);
const saving = ref(false);
const products = ref<any[]>([]);

// 后端对状态流转做强校验，前端必须按同一张表裁剪可选项，否则用户会撞 400
const FLOW: Record<string, string[]> = {
  待排产: ['生产中', '已取消'],
  生产中: ['部分完成', '全部完工', '已取消'],
  部分完成: ['全部完工', '已取消'],
  全部完工: [],
  已取消: [],
};

const statusOpts = ['待排产', '生产中', '部分完成', '全部完工', '已取消'];

const query = reactive<any>({ page: 1, size: 10, status: '', product_name: '' });

// 列表未下发入库标记，用本次会话内已入库的工单 id 兜底隐藏按钮，避免重复入库
const stockedIds = ref<any[]>([]);
const tipId = ref<any>(0);

const flowVisible = ref(false);
const flowSaving = ref(false);
const flowRow = ref<any>({});
const flowNum = ref(1);

const createVisible = ref(false);
const form = reactive<any>({
  product_id: '',
  produce_num: 1,
  plan_finish_time: '',
  owner_user_id: undefined,
  remark: '',
});

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(v: any) {
  return v ? fmt(v).slice(0, 10) : '';
}

function nextOf(status: string): string[] {
  return FLOW[status] || [];
}

function statusType(s: string) {
  if (s === '全部完工') return 'success';
  if (s === '已取消') return 'danger';
  if (s === '生产中' || s === '部分完成') return 'warning';
  return 'info';
}

function pct(row: any) {
  const num = Number(row.produce_num) || 0;
  if (!num) return 0;
  return Math.min(100, Math.round(((Number(row.finish_num) || 0) * 100) / num));
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await prodApi.workorderPage({
      page: query.page,
      size: query.size,
      status: query.status || undefined,
      product_name: query.product_name || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

// 条件变化后回到首页，避免停在越界页码上看到空列表
function search() {
  query.page = 1;
  reload();
}

async function loadProducts() {
  try {
    products.value = ((await erpApi.productOptions()) as any) || [];
  } catch (e: any) {
    // 全局拦截
  }
}

/* ---------- 状态流转 ---------- */
async function onFlow(row: any, target: string) {
  if (target === '部分完成') {
    flowRow.value = row;
    flowNum.value = Math.min(Number(row.finish_num) || 1, Number(row.produce_num) || 1) || 1;
    flowVisible.value = true;
    return;
  }
  const ok = await ElMessageBox.confirm(
    `确认将工单「${row.work_no}」流转为「${target}」？`,
    '状态流转',
    { type: 'warning' },
  ).catch(() => false);
  if (!ok) return;
  // 全部完工时按生产数量补齐完工数，避免进度条与状态不一致
  await submitStatus(row, target, target === '全部完工' ? Number(row.produce_num) : undefined);
}

async function submitPartial() {
  await submitStatus(flowRow.value, '部分完成', Number(flowNum.value));
}

async function submitStatus(row: any, status: string, finishNum?: number) {
  flowSaving.value = true;
  try {
    await prodApi.updateStatus({
      workorder_id: row.id,
      status,
      finish_num: finishNum,
    });
    ElMessage.success(`状态已流转为「${status}」`);
    flowVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    flowSaving.value = false;
  }
}

/* ---------- AI 提示 / 入库 ---------- */
async function showTip(row: any) {
  tipId.value = row.id;
  try {
    const res: any = await prodApi.aiTip(row.id);
    ElMessageBox.alert(res?.tip || '暂无提示', 'AI 生产提示', { type: 'info' }).catch(() => void 0);
  } catch (e: any) {
    // 全局拦截
  } finally {
    tipId.value = 0;
  }
}

async function stockIn(row: any) {
  const ok = await ElMessageBox.confirm(
    `确认将工单「${row.work_no}」的 ${row.finish_num} 件成品入库？入库后将增加「${row.product_name}」的库存，且不可撤销。`,
    '完工入库',
    { type: 'warning' },
  ).catch(() => false);
  if (!ok) return;
  try {
    const res: any = await prodApi.stockIn({ workorder_id: row.id });
    ElMessage.success(`已入库 ${res?.add ?? 0} 件，当前库存 ${res?.stock_num ?? 0}`);
    stockedIds.value.push(row.id);
    await reload();
  } catch (e: any) {
    // 全局拦截
  }
}

/* ---------- 新建 / 导出 ---------- */
function openCreate() {
  Object.assign(form, {
    product_id: '',
    produce_num: 1,
    plan_finish_time: '',
    owner_user_id: undefined,
    remark: '',
  });
  createVisible.value = true;
}

async function submitCreate() {
  if (!form.product_id) return ElMessage.warning('请选择产品');
  if (!form.produce_num || Number(form.produce_num) < 1) return ElMessage.warning('请填写生产数量');
  saving.value = true;
  try {
    await prodApi.saveWorkorder({
      product_id: form.product_id,
      produce_num: Number(form.produce_num),
      plan_finish_time: form.plan_finish_time || undefined,
      order_id: 0, // 手工建单不关联销售订单
      owner_user_id: form.owner_user_id || undefined,
      remark: form.remark,
    });
    ElMessage.success('工单创建成功');
    createVisible.value = false;
    search();
  } catch (e: any) {
    // 全局拦截
  } finally {
    saving.value = false;
  }
}

async function exportList() {
  exporting.value = true;
  try {
    const res: any = await commonApi.exportWorkorder({ status: query.status || undefined });
    if (downloadBase64(res)) ElMessage.success(`已导出 ${res?.total ?? 0} 条`);
  } catch (e: any) {
    // 全局拦截
  } finally {
    exporting.value = false;
  }
}

reload();
loadProducts();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}

.prog-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.4;
}

.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;
}
</style>
