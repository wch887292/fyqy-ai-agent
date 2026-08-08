<template>
  <div class="page">
    <div class="stat-grid">
      <div
        v-for="s in statusDist"
        :key="s.status"
        class="stat-card"
        :class="cardClass(s.status)"
      >
        <div class="label">{{ s.status }}</div>
        <div class="value">{{ s.count }}</div>
        <div class="sub">金额 {{ money(s.amount) }}</div>
      </div>
    </div>

    <div class="page-card mt-12">
      <h3 class="page-title">订单管理</h3>
      <p class="page-desc">
        鞋材销售订单全流程跟踪，状态严格按「待审核 → 生产中 → 已发货 → 已完成」的状态机流转；发货自动扣减库存，完成后自动登记合伙人业绩台账
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="订单号 / 客户名称"
          clearable
          style="width: 240px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.order_status" placeholder="订单状态" clearable style="width: 140px" @change="reload">
          <el-option v-for="s in statusList" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建订单</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="订单号" width="180">
          <template #default="{ row }">
            <b>{{ row.order_no }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="customer_name" label="客户" min-width="160" />
        <el-table-column label="订单金额" width="130" align="right">
          <template #default="{ row }">{{ money(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusType(row.order_status)" size="small" effect="dark">
              {{ row.order_status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="交期" width="150">
          <template #default="{ row }">
            <span v-if="!row.delivery_date" class="text-sub">未约定</span>
            <span v-else :class="deliveryClass(row)">
              {{ fmtDate(row.delivery_date) }}
              <em v-if="deliveryTip(row)" class="d-tip">{{ deliveryTip(row) }}</em>
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="owner_name" label="负责人" width="90" />
        <el-table-column label="AI风险" width="80" align="center">
          <template #default="{ row }">
            <el-tooltip v-if="row.ai_warn_msg" placement="top" :content="row.ai_warn_msg">
              <el-icon class="text-danger risk-icon" @click="openWarn(row)"><WarningFilled /></el-icon>
            </el-tooltip>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              link
              type="primary"
              size="small"
              :disabled="!row.next_status?.length"
              @click="openFlow(row)"
            >
              流转状态
            </el-button>
            <el-button
              link
              type="danger"
              size="small"
              :disabled="!row.next_status?.includes('已取消')"
              @click="cancel(row)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="query.size"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 状态流转 -->
    <el-dialog v-model="flowVisible" title="订单状态流转" width="560px">
      <div class="flow-head">
        <span class="text-sub">{{ flowRow.order_no }}</span>
        <b>{{ flowRow.customer_name }}</b>
        <span>{{ money(flowRow.total_amount) }}</span>
      </div>

      <el-steps :active="stepIndex" align-center class="mt-12" finish-status="success">
        <el-step v-for="s in mainFlow" :key="s" :title="s" />
      </el-steps>

      <el-form label-width="100px" class="mt-16">
        <el-form-item label="当前状态">
          <el-tag :type="statusType(flowRow.order_status)" effect="dark" size="small">
            {{ flowRow.order_status }}
          </el-tag>
        </el-form-item>
        <el-form-item label="流转到">
          <el-radio-group v-model="targetStatus">
            <el-radio-button v-for="s in nextOptions" :key="s" :value="s">{{ s }}</el-radio-button>
          </el-radio-group>
          <div v-if="!nextOptions.length" class="tip">该状态为终态，无法继续流转</div>
        </el-form-item>
      </el-form>

      <div class="ai-box">{{ flowDesc }}</div>

      <template #footer>
        <el-button @click="flowVisible = false">取消</el-button>
        <el-button type="primary" :loading="flowSaving" :disabled="!targetStatus" @click="submitFlow">
          确认流转
        </el-button>
      </template>
    </el-dialog>

    <!-- 新建订单 -->
    <el-dialog v-model="createVisible" title="新建销售订单" width="860px">
      <el-form :model="createForm" label-width="90px">
        <el-form-item label="客户">
          <el-select v-model="createForm.customer_id" filterable placeholder="请选择客户" style="width: 320px">
            <el-option
              v-for="c in customers"
              :key="c.id"
              :label="`${c.customer_name}${c.company_name ? ' / ' + c.company_name : ''}`"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="交货日期">
          <el-date-picker
            v-model="createForm.delivery_date"
            type="date"
            placeholder="与客户约定的交货日期"
            value-format="YYYY-MM-DD"
            style="width: 320px"
          />
        </el-form-item>

        <el-form-item label="订单明细">
          <div class="items-box">
            <el-table :data="createForm.items" border size="small">
              <el-table-column label="产品" min-width="240">
                <template #default="{ row }">
                  <el-select
                    v-model="row.product_id"
                    filterable
                    placeholder="请选择产品"
                    style="width: 100%"
                    @change="(v: any) => onPickProduct(row, v)"
                  >
                    <el-option
                      v-for="p in products"
                      :key="p.id"
                      :label="`${p.product_name}${p.spec ? ' / ' + p.spec : ''}`"
                      :value="p.id"
                    >
                      <span>{{ p.product_name }}{{ p.spec ? ' / ' + p.spec : '' }}</span>
                      <span class="opt-stock">库存 {{ p.stock_num }} {{ p.unit }}</span>
                    </el-option>
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.num" :min="1" :precision="0" :step="10" size="small" style="width: 120px" />
                </template>
              </el-table-column>
              <el-table-column label="单价" width="140">
                <template #default="{ row }">
                  <el-input-number v-model="row.price" :min="0" :precision="2" :step="1" size="small" style="width: 120px" />
                </template>
              </el-table-column>
              <el-table-column label="小计" width="130" align="right">
                <template #default="{ row }">{{ money(rowAmount(row)) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="70" align="center">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="removeItem($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="items-foot">
              <el-button link type="primary" :icon="Plus" @click="addItem">添加明细行</el-button>
              <div class="total-amount">订单总额：<b>{{ money(createTotal) }}</b></div>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="createForm.remark"
            type="textarea"
            :rows="3"
            placeholder="如 颜色色号、包装要求、分批交货安排等"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="submitCreate">提交订单</el-button>
      </template>
    </el-dialog>

    <!-- 订单详情 -->
    <el-drawer v-model="detailVisible" title="订单详情" size="640px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="d-head">
          <div>
            <h3 class="d-name">{{ detail.order_no }}</h3>
            <p class="text-sub">{{ detail.customer_name }}</p>
          </div>
          <el-tag :type="statusType(detail.order_status)" effect="dark">{{ detail.order_status }}</el-tag>
        </div>

        <el-descriptions :column="2" border size="small" class="mt-12">
          <el-descriptions-item label="订单金额">{{ money(detail.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="交货日期">{{ fmtDate(detail.delivery_date) || '未约定' }}</el-descriptions-item>
          <el-descriptions-item label="下一步状态">
            {{ detail.next_status?.length ? detail.next_status.join(' / ') : '终态' }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ fmt(detail.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="detail.ai_warn_msg" class="mt-12">
          <h4 class="sec-title">AI 订单风险提示</h4>
          <div class="ai-box">{{ detail.ai_warn_msg }}</div>
        </div>

        <h4 class="sec-title mt-16">订单明细</h4>
        <el-table :data="detail.items || []" border size="small">
          <el-table-column label="产品" min-width="180">
            <template #default="{ row }">
              <div class="prod-cell">
                <b>{{ row.product_name }}</b>
                <span class="text-sub">{{ row.spec || '-' }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="num" label="数量" width="80" align="right" />
          <el-table-column label="单价" width="110" align="right">
            <template #default="{ row }">{{ money(row.price) }}</template>
          </el-table-column>
          <el-table-column label="小计" width="120" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search, WarningFilled } from '@element-plus/icons-vue';
import { crmApi, erpApi } from '../../api';

const loading = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const overview = ref<any>({});
const statusList = ref<string[]>([]);
const flowMap = ref<Record<string, string[]>>({});
const products = ref<any[]>([]);
const customers = ref<any[]>([]);

const query = reactive<any>({ page: 1, size: 10, keyword: '', order_status: '' });

const mainFlow = ['待审核', '生产中', '已发货', '已完成'];

const statusDist = computed<any[]>(() => overview.value.order_status_dist || []);

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const res: any = await erpApi.orderPage({ ...query });
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

async function loadOverview() {
  try {
    overview.value = (await erpApi.overview()) as any;
  } catch {
    overview.value = {};
  }
}

onMounted(async () => {
  load();
  loadOverview();
  try {
    const flow: any = await erpApi.statusFlow();
    statusList.value = flow.status_list || [];
    flowMap.value = flow.flow || {};
  } catch {
    statusList.value = [];
  }
  try {
    products.value = ((await erpApi.productOptions()) as any) || [];
  } catch {
    products.value = [];
  }
  try {
    const res: any = await crmApi.customerPage({ page: 1, size: 200 });
    customers.value = res.list || [];
  } catch {
    customers.value = [];
  }
});

/* ---------- 状态流转 ---------- */
const flowVisible = ref(false);
const flowSaving = ref(false);
const flowRow = ref<any>({});
const targetStatus = ref('');

const stepIndex = computed(() => {
  const i = mainFlow.indexOf(flowRow.value.order_status);
  return i < 0 ? 0 : i;
});

/** 目标状态候选：优先用行内 next_status，兜底查后端下发的状态机 */
const nextOptions = computed<string[]>(() => {
  const inline: string[] = flowRow.value.next_status || [];
  if (inline.length) return inline;
  return flowMap.value[flowRow.value.order_status] || [];
});

const flowDesc = computed(() => {
  const cur = flowRow.value.order_status;
  const next = nextOptions.value.join(' / ') || '无';
  const rules: Record<string, string> = {
    待审核: '审核通过后转「生产中」，排产前请确认原料库存与交期是否可满足。',
    生产中: '生产完成后转「已发货」，系统会按订单明细自动出库并写入库存流水。',
    已发货: '客户签收结算后转「已完成」，若归属人是合伙人将自动登记业绩台账（仅预估分成，不产生实发）。',
    已完成: '订单已闭环，不可再流转。',
    已取消: '订单已终止，不可再流转。',
  };
  return `状态机规则：当前「${cur}」允许流转到：${next}。\n${rules[cur] || ''}`;
});

function openFlow(row: any) {
  flowRow.value = row;
  targetStatus.value = nextOptions.value[0] || '';
  flowVisible.value = true;
}

async function submitFlow() {
  if (!targetStatus.value) return;
  flowSaving.value = true;
  try {
    const res: any = await erpApi.updateStatus({
      id: flowRow.value.id,
      order_id: flowRow.value.id,
      order_status: targetStatus.value,
    });
    if (res?.performance?.estimate_amount !== undefined) {
      ElMessage.success(
        `订单已完成，已登记业绩 ${money(res.performance.performance_amount)}，预估分成 ${money(res.performance.estimate_amount)}`,
      );
    } else {
      ElMessage.success(`状态已流转为「${targetStatus.value}」`);
    }
    flowVisible.value = false;
    load();
    loadOverview();
  } finally {
    flowSaving.value = false;
  }
}

function cancel(row: any) {
  ElMessageBox.confirm(
    `确定取消订单「${row.order_no}」吗？取消后不可恢复，已发货订单不允许取消。`,
    '取消订单',
    { type: 'warning' },
  )
    .then(async () => {
      await erpApi.updateStatus({ id: row.id, order_id: row.id, order_status: '已取消' });
      ElMessage.success('订单已取消');
      load();
      loadOverview();
    })
    .catch(() => void 0);
}

function openWarn(row: any) {
  ElMessageBox.alert(row.ai_warn_msg, `AI 风险提示 · ${row.order_no}`, { type: 'warning' }).catch(
    () => void 0,
  );
}

/* ---------- 新建订单 ---------- */
const createVisible = ref(false);
const createSaving = ref(false);
const createForm = reactive<any>({
  customer_id: '',
  delivery_date: '',
  remark: '',
  items: [] as any[],
});

const createTotal = computed(() =>
  createForm.items.reduce((s: number, r: any) => s + rowAmount(r), 0),
);

function rowAmount(row: any) {
  return Number(((Number(row.price) || 0) * (Number(row.num) || 0)).toFixed(2));
}

function addItem() {
  createForm.items.push({ product_id: '', num: 1, price: 0 });
}

function removeItem(index: number) {
  createForm.items.splice(index, 1);
}

function onPickProduct(row: any, val: any) {
  const p = products.value.find((x) => Number(x.id) === Number(val));
  if (p) row.price = Number(p.price || 0);
}

function openCreate() {
  Object.assign(createForm, { customer_id: '', delivery_date: '', remark: '', items: [] });
  addItem();
  createVisible.value = true;
}

async function submitCreate() {
  if (!createForm.customer_id) return ElMessage.warning('请选择客户');
  const items = createForm.items.filter((r: any) => r.product_id && Number(r.num) > 0);
  if (!items.length) return ElMessage.warning('请至少添加一条有效的订单明细');
  createSaving.value = true;
  try {
    const res: any = await erpApi.createOrder({
      customer_id: createForm.customer_id,
      delivery_date: createForm.delivery_date || undefined,
      remark: createForm.remark,
      items: items.map((r: any) => ({
        product_id: r.product_id,
        num: Number(r.num),
        price: Number(r.price || 0),
      })),
    });
    ElMessage.success(`订单 ${res.order_no} 创建成功`);
    if (res.ai_warn_msg) {
      ElMessageBox.alert(res.ai_warn_msg, 'AI 订单风险提示', { type: 'warning' }).catch(() => void 0);
    }
    createVisible.value = false;
    load();
    loadOverview();
  } finally {
    createSaving.value = false;
  }
}

/* ---------- 详情 ---------- */
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

async function openDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await erpApi.orderDetail(row.id);
  } finally {
    detailLoading.value = false;
  }
}

/* ---------- 工具 ---------- */
function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusType(s: string) {
  if (s === '生产中') return 'primary';
  if (s === '已发货') return 'warning';
  if (s === '已完成') return 'success';
  if (s === '已取消') return 'danger';
  return 'info';
}

function cardClass(s: string) {
  if (s === '已完成') return 'success';
  if (s === '已发货') return 'warn';
  if (s === '已取消') return 'danger';
  return '';
}

/** 交期天数差：负数为已超期 */
function deliveryDays(row: any) {
  if (!row.delivery_date) return null;
  const d = new Date(fmtDate(row.delivery_date) + 'T23:59:59').getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}

function deliveryClass(row: any) {
  if (['已完成', '已取消'].includes(row.order_status)) return 'text-sub';
  const days = deliveryDays(row);
  if (days === null) return '';
  if (days < 0) return 'text-danger';
  if (days <= 3) return 'text-warning';
  return '';
}

function deliveryTip(row: any) {
  if (['已完成', '已取消'].includes(row.order_status)) return '';
  const days = deliveryDays(row);
  if (days === null) return '';
  if (days < 0) return `超期${-days}天`;
  if (days <= 3) return `剩${days}天`;
  return '';
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(v: any) {
  return v ? fmt(v).slice(0, 10) : '';
}
</script>

<style scoped lang="scss">
.risk-icon {
  cursor: pointer;
  font-size: 16px;
}

.d-tip {
  display: block;
  font-style: normal;
  font-size: 11px;
}

.flow-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;

  b {
    font-size: 15px;
  }
}

.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;
}

.items-box {
  width: 100%;
}

.items-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.total-amount {
  font-size: 13px;
  color: var(--fae-text-sub);

  b {
    font-size: 17px;
    color: var(--fae-danger);
    margin-left: 4px;
  }
}

.opt-stock {
  float: right;
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-left: 12px;
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
}

.prod-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.6;

  span {
    font-size: 12px;
  }
}
</style>
