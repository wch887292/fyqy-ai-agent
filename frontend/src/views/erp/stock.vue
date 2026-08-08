<template>
  <div class="page">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">在售产品</div>
        <div class="value">{{ overview.product_total ?? 0 }}</div>
        <div class="sub">已建档的鞋材品类</div>
      </div>
      <div class="stat-card warn">
        <div class="label">缺货预警</div>
        <div class="value">{{ overview.stock_warn_total ?? 0 }}</div>
        <div class="sub">待处理补货预警</div>
      </div>
      <div class="stat-card success">
        <div class="label">今日入库</div>
        <div class="value">{{ todayIn }}</div>
        <div class="sub">按流水统计的到货数量</div>
      </div>
      <div class="stat-card danger">
        <div class="label">今日出库</div>
        <div class="value">{{ todayOut }}</div>
        <div class="sub">车间领用与订单发货</div>
      </div>
    </div>

    <div class="page-card mt-12">
      <h3 class="page-title">库存管理</h3>
      <p class="page-desc">
        管理鞋材原料与成品的到货、领用与发货；库存跌破预警线时由 AI 结合近 30 天出库量给出补货建议，避免旺季断料停线
      </p>

      <el-tabs v-model="tab" @tab-change="onTabChange">
        <!-- 库存预警 -->
        <el-tab-pane name="warn">
          <template #label>
            库存预警
            <el-tag v-if="overview.stock_warn_total" type="danger" size="small" effect="dark" class="ml-6">
              {{ overview.stock_warn_total }}
            </el-tag>
          </template>

          <div class="filter-bar">
            <el-select v-model="warnQuery.handled" style="width: 160px" @change="reloadWarn">
              <el-option label="未处理" :value="0" />
              <el-option label="已处理" :value="1" />
              <el-option label="全部" value="" />
            </el-select>
            <div class="flex-1"></div>
            <el-button :icon="Refresh" @click="loadWarn">刷新</el-button>
          </div>

          <div v-loading="warnLoading">
            <div v-if="!warnList.length" class="empty-tip">当前库存水位正常，暂无缺货预警</div>
            <div v-for="w in warnList" :key="w.id" class="warn-card">
              <div class="wc-head">
                <div class="wc-name">
                  <el-icon class="text-danger"><WarningFilled /></el-icon>
                  <b>{{ w.product_name }}</b>
                  <el-tag :type="w.handled ? 'info' : 'danger'" size="small" effect="plain">
                    {{ w.handled ? '已处理' : '待处理' }}
                  </el-tag>
                </div>
                <div class="wc-num">
                  当前库存 <span class="text-danger">{{ w.stock_num }}</span>
                  / 预警线 {{ w.warn_stock }}
                </div>
              </div>
              <div class="ai-box mt-8">{{ w.ai_advice || '暂无 AI 补货建议，可在系统设置接入大模型后重新触发' }}</div>
              <div class="wc-foot">
                <span class="text-sub">{{ fmt(w.created_at) }}</span>
                <el-button
                  v-if="!w.handled"
                  link
                  type="primary"
                  size="small"
                  :loading="handling === w.id"
                  @click="handle(w)"
                >
                  已处理
                </el-button>
              </div>
            </div>
          </div>

          <div class="pager">
            <el-pagination
              v-model:current-page="warnQuery.page"
              :page-size="warnQuery.size"
              :total="warnTotal"
              layout="total, prev, pager, next"
              @current-change="loadWarn"
            />
          </div>
        </el-tab-pane>

        <!-- 出入库操作 -->
        <el-tab-pane label="出入库操作" name="op">
          <el-row :gutter="14">
            <el-col :xs="24" :lg="12">
              <div class="op-card in">
                <h4 class="op-title">
                  <el-icon><Download /></el-icon>
                  原料 / 成品入库
                </h4>
                <p class="op-desc">供应商到货、生产入库、退货回仓，均在此登记</p>
                <el-form :model="inForm" label-width="90px">
                  <el-form-item label="产品">
                    <el-select v-model="inForm.product_id" filterable placeholder="请选择产品" style="width: 100%">
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
                  </el-form-item>
                  <el-form-item label="入库数量">
                    <el-input-number v-model="inForm.num" :min="1" :precision="0" :step="10" style="width: 200px" />
                    <span class="tip inline">当前库存 {{ stockOf(inForm.product_id) }}</span>
                  </el-form-item>
                  <el-form-item label="备注">
                    <el-input
                      v-model="inForm.remark"
                      type="textarea"
                      :rows="3"
                      placeholder="如 华祥-EVA 批次 20260808、检验合格"
                    />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="success" :loading="inSaving" @click="doIn">确认入库</el-button>
                  </el-form-item>
                </el-form>
                <div v-if="inAdvice" class="ai-box">{{ inAdvice }}</div>
              </div>
            </el-col>

            <el-col :xs="24" :lg="12">
              <div class="op-card out">
                <h4 class="op-title">
                  <el-icon><Upload /></el-icon>
                  车间领用 / 发货出库
                </h4>
                <p class="op-desc">出库数量不得超过当前库存；订单发货时系统会自动出库</p>
                <el-form :model="outForm" label-width="90px">
                  <el-form-item label="产品">
                    <el-select v-model="outForm.product_id" filterable placeholder="请选择产品" style="width: 100%">
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
                  </el-form-item>
                  <el-form-item label="出库数量">
                    <el-input-number v-model="outForm.num" :min="1" :precision="0" :step="10" style="width: 200px" />
                    <span class="tip inline" :class="{ 'text-danger': outOver }">
                      当前库存 {{ stockOf(outForm.product_id) }}{{ outOver ? '，已超出可用库存' : '' }}
                    </span>
                  </el-form-item>
                  <el-form-item label="备注">
                    <el-input
                      v-model="outForm.remark"
                      type="textarea"
                      :rows="3"
                      placeholder="如 成型车间领用、SO20260808001 发货"
                    />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="warning" :loading="outSaving" @click="doOut">确认出库</el-button>
                  </el-form-item>
                </el-form>
                <div v-if="outAdvice" class="ai-box">{{ outAdvice }}</div>
              </div>
            </el-col>
          </el-row>
        </el-tab-pane>

        <!-- 出入库流水 -->
        <el-tab-pane label="出入库流水" name="record">
          <div class="filter-bar">
            <el-select
              v-model="recQuery.product_id"
              placeholder="全部产品"
              clearable
              filterable
              style="width: 220px"
              @change="reloadRecord"
            >
              <el-option
                v-for="p in products"
                :key="p.id"
                :label="`${p.product_name}${p.spec ? ' / ' + p.spec : ''}`"
                :value="p.id"
              />
            </el-select>
            <el-select v-model="recQuery.type" placeholder="全部类型" clearable style="width: 140px" @change="reloadRecord">
              <el-option label="入库" value="in" />
              <el-option label="出库" value="out" />
            </el-select>
            <div class="flex-1"></div>
            <el-button :icon="Refresh" @click="loadRecord">刷新</el-button>
          </div>

          <el-table :data="records" v-loading="recLoading" border stripe>
            <el-table-column label="时间" width="150">
              <template #default="{ row }">{{ fmt(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="产品" min-width="200">
              <template #default="{ row }">
                <div class="prod-cell">
                  <b>{{ row.product_name || '-' }}</b>
                  <span class="text-sub">{{ row.spec || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.type === 'in' ? 'success' : 'warning'" size="small" effect="dark">
                  {{ row.type_text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="110" align="right">
              <template #default="{ row }">
                <b :class="row.type === 'in' ? 'text-success' : 'text-warning'">
                  {{ row.type === 'in' ? '+' : '-' }}{{ row.num }}
                </b>
              </template>
            </el-table-column>
            <el-table-column label="变动后库存" width="110" align="right">
              <template #default="{ row }">{{ row.after_num }}</template>
            </el-table-column>
            <el-table-column label="来源" width="100" align="center">
              <template #default="{ row }">
                <span class="text-sub">{{ row.biz_type === 'order' ? '订单发货' : '手工登记' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="operator_name" label="操作人" width="100" />
            <el-table-column label="备注" min-width="180">
              <template #default="{ row }">
                <span :class="{ 'text-sub': !row.remark }">{{ row.remark || '-' }}</span>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="recQuery.page"
              :page-size="recQuery.size"
              :total="recTotal"
              layout="total, prev, pager, next, jumper"
              @current-change="loadRecord"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Refresh, Upload, WarningFilled } from '@element-plus/icons-vue';
import { erpApi } from '../../api';

const tab = ref('warn');
const overview = ref<any>({});
const products = ref<any[]>([]);
const todayIn = ref(0);
const todayOut = ref(0);

/* ---------- 预警 ---------- */
const warnLoading = ref(false);
const warnList = ref<any[]>([]);
const warnTotal = ref(0);
const handling = ref<number | null>(null);
const warnQuery = reactive<any>({ page: 1, size: 10, handled: 0 });

async function loadWarn() {
  warnLoading.value = true;
  try {
    const params: any = { page: warnQuery.page, size: warnQuery.size };
    if (warnQuery.handled !== '') params.handled = warnQuery.handled;
    const res: any = await erpApi.warnList(params);
    warnList.value = res.list || [];
    warnTotal.value = res.total || 0;
  } finally {
    warnLoading.value = false;
  }
}

function reloadWarn() {
  warnQuery.page = 1;
  loadWarn();
}

function handle(row: any) {
  ElMessageBox.confirm(
    `确认「${row.product_name}」的补货预警已处理吗？确认后该条预警关闭，库存仍低于预警线时下次变动会重新生成。`,
    '处理库存预警',
    { type: 'warning' },
  )
    .then(async () => {
      handling.value = row.id;
      try {
        await erpApi.handleWarn({ id: row.id });
        ElMessage.success('已标记为处理');
        loadWarn();
        loadOverview();
      } finally {
        handling.value = null;
      }
    })
    .catch(() => void 0);
}

/* ---------- 出入库 ---------- */
const inSaving = ref(false);
const outSaving = ref(false);
const inAdvice = ref('');
const outAdvice = ref('');
const inForm = reactive<any>({ product_id: '', num: 1, remark: '' });
const outForm = reactive<any>({ product_id: '', num: 1, remark: '' });

function stockOf(id: any) {
  const p = products.value.find((x) => Number(x.id) === Number(id));
  return p ? `${p.stock_num} ${p.unit}` : '-';
}

const outOver = computed(() => {
  const p = products.value.find((x) => Number(x.id) === Number(outForm.product_id));
  return !!p && Number(outForm.num || 0) > Number(p.stock_num || 0);
});

async function doIn() {
  if (!inForm.product_id) return ElMessage.warning('请选择入库产品');
  if (Number(inForm.num || 0) <= 0) return ElMessage.warning('入库数量必须大于 0');
  inSaving.value = true;
  try {
    const res: any = await erpApi.stockIn({
      product_id: inForm.product_id,
      num: Number(inForm.num),
      remark: inForm.remark,
    });
    ElMessage.success(`入库成功，${res.product_name} 库存 ${res.before_num} → ${res.after_num}`);
    inAdvice.value = res.ai_advice || '';
    inForm.num = 1;
    inForm.remark = '';
    await refreshAll();
  } finally {
    inSaving.value = false;
  }
}

async function doOut() {
  if (!outForm.product_id) return ElMessage.warning('请选择出库产品');
  if (Number(outForm.num || 0) <= 0) return ElMessage.warning('出库数量必须大于 0');
  const p = products.value.find((x) => Number(x.id) === Number(outForm.product_id));
  if (p && Number(outForm.num) > Number(p.stock_num || 0)) {
    return ElMessage.warning(`库存不足，「${p.product_name}」当前库存 ${p.stock_num} ${p.unit}`);
  }
  outSaving.value = true;
  try {
    const res: any = await erpApi.stockOut({
      product_id: outForm.product_id,
      num: Number(outForm.num),
      remark: outForm.remark,
    });
    ElMessage.success(`出库成功，${res.product_name} 库存 ${res.before_num} → ${res.after_num}`);
    outAdvice.value = res.ai_advice || '';
    outForm.num = 1;
    outForm.remark = '';
    await refreshAll();
  } finally {
    outSaving.value = false;
  }
}

/* ---------- 流水 ---------- */
const recLoading = ref(false);
const records = ref<any[]>([]);
const recTotal = ref(0);
const recQuery = reactive<any>({ page: 1, size: 10, product_id: '', type: '' });

async function loadRecord() {
  recLoading.value = true;
  try {
    const params: any = { page: recQuery.page, size: recQuery.size };
    if (recQuery.product_id) params.product_id = recQuery.product_id;
    if (recQuery.type) params.type = recQuery.type;
    const res: any = await erpApi.stockRecord(params);
    records.value = res.list || [];
    recTotal.value = res.total || 0;
  } finally {
    recLoading.value = false;
  }
}

function reloadRecord() {
  recQuery.page = 1;
  loadRecord();
}

/* ---------- 公共 ---------- */
async function loadOverview() {
  try {
    overview.value = (await erpApi.overview()) as any;
  } catch {
    overview.value = {};
  }
}

async function loadProducts() {
  try {
    products.value = ((await erpApi.productOptions()) as any) || [];
  } catch {
    products.value = [];
  }
}

/** 今日出入库合计：接口无按日汇总，取最近 200 条流水在前端按当天过滤 */
async function loadTodaySum() {
  try {
    const res: any = await erpApi.stockRecord({ page: 1, size: 200 });
    const today = fmtDate(new Date());
    let vIn = 0;
    let vOut = 0;
    for (const r of res.list || []) {
      if (fmtDate(new Date(r.created_at)) !== today) continue;
      if (r.type === 'in') vIn += Number(r.num || 0);
      else vOut += Number(r.num || 0);
    }
    todayIn.value = vIn;
    todayOut.value = vOut;
  } catch {
    todayIn.value = 0;
    todayOut.value = 0;
  }
}

async function refreshAll() {
  await Promise.all([loadOverview(), loadProducts(), loadTodaySum()]);
  if (tab.value === 'warn') loadWarn();
  if (tab.value === 'record') loadRecord();
}

function onTabChange(name: any) {
  if (name === 'warn') loadWarn();
  if (name === 'record') loadRecord();
}

onMounted(() => {
  loadOverview();
  loadProducts();
  loadTodaySum();
  loadWarn();
});

/* ---------- 工具 ---------- */
function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
</script>

<style scoped lang="scss">
.ml-6 {
  margin-left: 6px;
}

.warn-card {
  border: 1px solid var(--fae-border);
  border-radius: var(--fae-radius);
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #fff;
}

.wc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.wc-name {
  display: flex;
  align-items: center;
  gap: 6px;

  b {
    font-size: 15px;
  }
}

.wc-num {
  font-size: 13px;
  color: var(--fae-text-sub);

  span {
    font-weight: 600;
  }
}

.wc-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
}

.op-card {
  border: 1px solid var(--fae-border);
  border-radius: var(--fae-radius);
  padding: 14px 16px;
  height: 100%;

  &.in {
    border-top: 3px solid var(--fae-success);
  }

  &.out {
    border-top: 3px solid var(--fae-warning);
  }
}

.op-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 4px;
}

.op-desc {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin: 0 0 14px;
}

.opt-stock {
  float: right;
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-left: 12px;
}

.tip {
  font-size: 12px;
  color: var(--fae-text-sub);

  &.inline {
    display: inline;
    margin-left: 8px;
  }
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
