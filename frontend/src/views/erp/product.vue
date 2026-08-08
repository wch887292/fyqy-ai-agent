<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">产品档案</h3>
      <p class="page-desc">
        统一维护 EVA 中底料、飞织鞋面、橡胶大底等产品的编号、规格与价格；毛利率由售价与成本价实时测算，库存低于预警线时自动生成 AI 补货建议
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="产品编号 / 名称 / 规格"
          clearable
          style="width: 240px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-checkbox v-model="onlyWarn" @change="reload">仅看库存预警</el-checkbox>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增产品</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="product_code" label="产品编号" width="170" />
        <el-table-column label="产品名称" min-width="190">
          <template #default="{ row }">
            <div class="prod-cell">
              <b>{{ row.product_name }}</b>
              <span class="text-sub">{{ row.spec || '未填写规格' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="70" align="center" />
        <el-table-column label="售价" width="120" align="right">
          <template #default="{ row }">{{ money(row.price) }}</template>
        </el-table-column>
        <el-table-column label="成本价" width="120" align="right">
          <template #default="{ row }">
            <span class="text-sub">{{ money(row.cost_price) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="毛利率" width="100" align="center">
          <template #default="{ row }">
            <span :class="profitClass(row)">{{ profitRate(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="当前库存" width="120" align="center">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.is_warn }">
              <el-icon v-if="row.is_warn" class="warn-icon"><WarningFilled /></el-icon>
              {{ row.stock_num }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="warn_stock" label="预警线" width="90" align="center" />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small" effect="plain">
              {{ row.status === 1 ? '在售' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="success" size="small" @click="openStock(row, 'in')">入库</el-button>
            <el-button link type="warning" size="small" @click="openStock(row, 'out')">出库</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
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

    <!-- 新增 / 编辑产品 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑产品' : '新增产品'" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="产品编号">
          <el-input v-model="form.product_code" placeholder="留空由系统自动生成，如 P20260808001" />
        </el-form-item>
        <el-form-item label="产品名称" prop="product_name">
          <el-input v-model="form.product_name" placeholder="如 EVA 一次发泡中底料" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="form.spec" placeholder="如 密度0.18g/cm³ / 硬度55C / 幅宽1.2m" />
        </el-form-item>
        <el-form-item label="计量单位">
          <el-select
            v-model="form.unit"
            filterable
            allow-create
            default-first-option
            placeholder="选择或自定义输入"
            style="width: 100%"
          >
            <el-option v-for="u in unitPreset" :key="u" :label="u" :value="u" />
          </el-select>
        </el-form-item>
        <el-form-item label="销售单价" prop="price">
          <el-input-number v-model="form.price" :min="0" :precision="2" :step="1" style="width: 220px" />
          <span class="tip inline">元 / {{ form.unit || '单位' }}</span>
        </el-form-item>
        <el-form-item label="采购成本" prop="cost_price">
          <el-input-number v-model="form.cost_price" :min="0" :precision="2" :step="1" style="width: 220px" />
          <span class="tip inline">当前毛利率 {{ formProfit }}</span>
        </el-form-item>
        <el-form-item label="库存预警线">
          <el-input-number v-model="form.warn_stock" :min="0" :precision="0" :step="10" style="width: 220px" />
          <span class="tip inline">库存低于或等于该值时自动生成补货预警</span>
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始库存">
          <el-input-number v-model="form.stock_num" :min="0" :precision="0" :step="10" style="width: 220px" />
          <span class="tip inline">建档时的实盘数量，后续变动请走出入库</span>
        </el-form-item>
        <el-form-item label="产品状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">在售</el-radio>
            <el-radio :value="0">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 出入库 -->
    <el-dialog v-model="stockVisible" :title="stockForm.type === 'in' ? '产品入库' : '产品出库'" width="520px">
      <el-form :model="stockForm" label-width="100px">
        <el-form-item label="产品">
          <el-input :model-value="stockForm.product_label" disabled />
        </el-form-item>
        <el-form-item label="当前库存">
          <span class="cur-stock">{{ stockForm.stock_num }} {{ stockForm.unit }}</span>
        </el-form-item>
        <el-form-item label="本次数量">
          <el-input-number v-model="stockForm.num" :min="1" :precision="0" :step="10" style="width: 200px" />
          <span class="tip inline">变动后库存 {{ afterNum }} {{ stockForm.unit }}</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="stockForm.remark"
            type="textarea"
            :rows="3"
            :placeholder="stockForm.type === 'in' ? '如 供应商到货批次、检验单号' : '如 领用车间、发货订单号'"
          />
        </el-form-item>
      </el-form>
      <div v-if="stockAdvice" class="ai-box mt-8">
        <b>AI 补货建议</b><br />{{ stockAdvice }}
      </div>
      <template #footer>
        <el-button @click="stockVisible = false">关闭</el-button>
        <el-button type="primary" :loading="stockSaving" @click="submitStock">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import { Plus, Refresh, Search, WarningFilled } from '@element-plus/icons-vue';
import { erpApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const onlyWarn = ref(false);

const query = reactive<any>({ page: 1, size: 10, keyword: '' });

const unitPreset = ['双', '片', '张', '米', '公斤', '吨', '箱', '件'];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const params: any = { ...query };
    if (onlyWarn.value) params.warn_only = '1';
    const res: any = await erpApi.productPage(params);
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

onMounted(load);

/* ---------- 新增 / 编辑 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  id: 0,
  product_code: '',
  product_name: '',
  spec: '',
  unit: '双',
  price: 0,
  cost_price: 0,
  warn_stock: 0,
  stock_num: 0,
  status: 1,
});

const rules = {
  product_name: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  price: [{ required: true, message: '请输入销售单价', trigger: 'blur' }],
};

const formProfit = computed(() =>
  profitRate({ price: form.price, cost_price: form.cost_price }),
);

function openEdit(row?: any) {
  Object.assign(form, {
    id: row?.id || 0,
    product_code: row?.product_code || '',
    product_name: row?.product_name || '',
    spec: row?.spec || '',
    unit: row?.unit || '双',
    price: Number(row?.price || 0),
    cost_price: Number(row?.cost_price || 0),
    warn_stock: Number(row?.warn_stock || 0),
    stock_num: Number(row?.stock_num || 0),
    status: row ? Number(row.status) : 1,
  });
  editVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    const payload: any = {
      id: form.id || undefined,
      product_code: form.product_code,
      product_name: form.product_name,
      spec: form.spec,
      unit: form.unit,
      price: Number(form.price || 0),
      cost_price: Number(form.cost_price || 0),
      warn_stock: Number(form.warn_stock || 0),
      status: Number(form.status),
    };
    // 初始库存只在建档时提交，后续变动一律走出入库单据
    if (!form.id) payload.stock_num = Number(form.stock_num || 0);
    await erpApi.saveProduct(payload);
    ElMessage.success('保存成功');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

function remove(row: any) {
  ElMessageBox.confirm(
    `确定删除产品「${row.product_name}」吗？其出入库流水与预警记录将一并清除，已被订单引用的产品不允许删除。`,
    '删除产品',
    { type: 'warning' },
  )
    .then(async () => {
      await erpApi.removeProduct(row.id);
      ElMessage.success('已删除');
      load();
    })
    .catch(() => void 0);
}

/* ---------- 出入库 ---------- */
const stockVisible = ref(false);
const stockSaving = ref(false);
const stockAdvice = ref('');
const stockForm = reactive<any>({
  product_id: 0,
  product_label: '',
  unit: '',
  stock_num: 0,
  type: 'in',
  num: 1,
  remark: '',
});

const afterNum = computed(() => {
  const n = Number(stockForm.num || 0);
  return stockForm.type === 'in' ? stockForm.stock_num + n : stockForm.stock_num - n;
});

function openStock(row: any, type: 'in' | 'out') {
  Object.assign(stockForm, {
    product_id: row.id,
    product_label: `${row.product_name}${row.spec ? `（${row.spec}）` : ''}`,
    unit: row.unit || '',
    stock_num: Number(row.stock_num || 0),
    type,
    num: 1,
    remark: '',
  });
  stockAdvice.value = '';
  stockVisible.value = true;
}

async function submitStock() {
  const num = Number(stockForm.num || 0);
  if (num <= 0) return ElMessage.warning('数量必须大于 0');
  if (stockForm.type === 'out' && num > stockForm.stock_num) {
    return ElMessage.warning(`库存不足，当前库存 ${stockForm.stock_num} ${stockForm.unit}`);
  }
  stockSaving.value = true;
  try {
    const payload = { product_id: stockForm.product_id, num, remark: stockForm.remark };
    const res: any =
      stockForm.type === 'in' ? await erpApi.stockIn(payload) : await erpApi.stockOut(payload);
    ElMessage.success(
      `${stockForm.type === 'in' ? '入库' : '出库'}成功，库存 ${res.before_num} → ${res.after_num}`,
    );
    stockForm.stock_num = Number(res.after_num || 0);
    stockAdvice.value = res.ai_advice || '';
    if (!stockAdvice.value) stockVisible.value = false;
    load();
  } finally {
    stockSaving.value = false;
  }
}

/* ---------- 工具 ---------- */
function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function profitRate(row: any) {
  const price = Number(row?.price || 0);
  const cost = Number(row?.cost_price || 0);
  if (price <= 0) return '-';
  return `${(((price - cost) / price) * 100).toFixed(1)}%`;
}

function profitClass(row: any) {
  const price = Number(row?.price || 0);
  const cost = Number(row?.cost_price || 0);
  if (price <= 0) return 'text-sub';
  const rate = (price - cost) / price;
  if (rate < 0.1) return 'text-danger';
  if (rate < 0.25) return 'text-warning';
  return 'text-success';
}
</script>

<style scoped lang="scss">
.prod-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.6;

  span {
    font-size: 12px;
  }
}

.warn-icon {
  vertical-align: -2px;
  margin-right: 2px;
}

.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;

  &.inline {
    display: inline;
    margin-left: 8px;
  }
}

.cur-stock {
  font-size: 16px;
  font-weight: 600;
  color: var(--fae-primary);
}
</style>
