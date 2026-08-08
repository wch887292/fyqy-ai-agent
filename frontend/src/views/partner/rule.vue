<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">分利规则配置</h3>
      <p class="page-desc">
        为合伙人配置自动分利规则，订单完成或业绩入账后系统按此规则自动核算分成
      </p>

      <el-alert
        class="mt-12"
        type="info"
        :closable="false"
        show-icon
        title="订单流转到「已完成」时自动按规则核算并生成结算流水，同一合伙人同一结算模式仅允许一条规则"
      />

      <div class="filter-bar mt-12">
        <el-select
          v-model="query.user_id"
          placeholder="合伙人"
          clearable
          filterable
          style="width: 180px"
          @change="reload"
        >
          <el-option v-for="u in users" :key="u.id" :label="u.real_name" :value="u.id" />
        </el-select>
        <el-select v-model="query.settle_type" placeholder="结算模式" clearable style="width: 160px" @change="reload">
          <el-option v-for="t in typeOpts" :key="t.v" :label="t.l" :value="t.v" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增规则</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="real_name" label="合伙人" width="130" />
        <el-table-column label="结算模式" width="120" align="center">
          <template #default="{ row }">
            <el-tag :type="row.settle_type === 'order' ? 'primary' : 'success'" size="small" effect="dark">
              {{ row.settle_type_text || typeLabel(row.settle_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分成比例" width="110" align="center">
          <template #default="{ row }">
            <el-tag type="primary" size="small" effect="plain">{{ Number(row.ratio || 0) }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="生效条件" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !hasCond(row.settle_condition) }">{{ condText(row.settle_condition) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="150" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enable ? 'success' : 'info'" size="small" effect="dark">
              {{ row.enable ? '启用' : '停用' }}
            </el-tag>
            <el-switch
              v-model="row.enable"
              :active-value="1"
              :inactive-value="0"
              size="small"
              style="margin-left: 8px"
              @change="toggleEnable(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !list.length" class="empty-tip mt-16">
        暂无分利规则，点击右上角「新增规则」为合伙人配置自动分成
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

    <!-- 新增 / 编辑规则 -->
    <el-dialog v-model="editVisible" :title="editMode ? '编辑分利规则' : '新增分利规则'" width="560px">
      <!-- 命中已有规则时给出内联提示，避免用户重复新增撞后端 400 -->
      <el-alert
        v-if="dupRule"
        class="mb-12"
        type="warning"
        :closable="false"
        show-icon
        title="该合伙人已存在此模式规则，保存将覆盖为编辑"
      />

      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="合伙人" prop="user_id">
          <el-select
            v-model="form.user_id"
            filterable
            :disabled="editMode"
            placeholder="选择合伙人"
            style="width: 100%"
            @change="checkDup"
          >
            <el-option
              v-for="u in users"
              :key="u.id"
              :label="`${u.real_name}（${u.post || '未设置岗位'}）`"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="结算模式" prop="settle_type">
          <el-radio-group v-model="form.settle_type" :disabled="editMode" @change="checkDup">
            <el-radio value="order">按订单结算</el-radio>
            <el-radio value="performance">按业绩结算</el-radio>
          </el-radio-group>
          <div class="tip">{{ typeDesc(form.settle_type) }}</div>
        </el-form-item>
        <el-form-item label="分成比例" prop="ratio">
          <el-input-number v-model="form.ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 200px" />
          <span class="tip inline">%　核算时按「计算基数 × 该比例」生成分成金额</span>
        </el-form-item>
        <el-form-item label="最低金额门槛">
          <el-input-number v-model="form.min_amount" :min="0" :precision="2" :step="100" style="width: 200px" />
          <span class="tip inline">元　不填表示无门槛，低于该金额的单据不参与自动核算</span>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enable" :active-value="1" :inactive-value="0" />
          <span class="tip inline">停用后新单据不再按此规则核算，历史结算流水保留</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Edit, Plus, Search } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { partnerApi } from '../../api';

const list = ref<any[]>([]);
const users = ref<any[]>([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);

const typeOpts = [
  { v: 'order', l: '按订单结算' },
  { v: 'performance', l: '按业绩结算' },
];

const query = reactive<any>({ page: 1, size: 10, user_id: '', settle_type: '' });

const editVisible = ref(false);
// editMode 只在点「编辑」进入时为 true：用于锁定合伙人与结算模式两个联合唯一键；
// 判重自动转编辑时不锁，用户还能改回来重新选。
const editMode = ref(false);
const dupRule = ref<any>(null);
const formRef = ref<any>(null);

const form = reactive<any>({
  id: 0,
  user_id: '',
  settle_type: 'order',
  ratio: 0,
  min_amount: null,
  enable: 1,
});

const rules = {
  user_id: [{ required: true, message: '请选择合伙人', trigger: 'change' }],
  settle_type: [{ required: true, message: '请选择结算模式', trigger: 'change' }],
  ratio: [{ required: true, message: '请填写分成比例', trigger: 'blur' }],
};

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN')}`;
}

function typeLabel(t: string) {
  return t === 'performance' ? '按业绩结算' : '按订单结算';
}

function typeDesc(t: string) {
  return t === 'performance'
    ? '业绩台账入账后，按业绩金额自动核算分成'
    : '订单流转到「已完成」时，按订单金额自动核算分成';
}

/** settle_condition 后端存的是 JSON 字符串，可能为 null；parse 失败返回 null 交由调用方原样展示 */
function parseCond(v: any): any {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(v) || {};
  } catch {
    return null;
  }
}

function hasCond(v: any) {
  const obj = parseCond(v);
  return !!obj && Object.keys(obj).length > 0;
}

function condText(v: any) {
  const obj = parseCond(v);
  if (obj === null) return String(v); // 脏数据兜底：解析失败原样显示，不吞信息
  const keys = Object.keys(obj);
  if (!keys.length) return '无附加条件';
  const parts: string[] = [];
  for (const k of keys) {
    const val = obj[k];
    if (val === null || val === undefined || val === '') continue;
    // 已知条件做中文友好展示，未知条件原样罗列，后端新增字段时前端不会漏显示
    if (k === 'min_amount') parts.push(`订单金额 ≥ ${money(val)}`);
    else parts.push(`${k}：${val}`);
  }
  return parts.length ? parts.join('；') : '无附加条件';
}

async function reload() {
  loading.value = true;
  try {
    const res: any = await partnerApi.rulePage({
      page: query.page,
      size: query.size,
      user_id: query.user_id || undefined,
      settle_type: query.settle_type || undefined,
    });
    list.value = res.list || [];
    total.value = res.total || 0;
  } catch (e: any) {
    // 全局拦截
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    users.value = ((await partnerApi.options()) as any) || [];
  } catch (e: any) {
    // 全局拦截
    users.value = [];
  }
}

function openEdit(row?: any) {
  const cond = parseCond(row?.settle_condition) || {};
  Object.assign(form, {
    id: row?.id || 0,
    user_id: row?.user_id || '',
    settle_type: row?.settle_type || 'order',
    ratio: Number(row?.ratio || 0),
    min_amount: cond.min_amount ?? null,
    enable: row ? Number(row.enable) : 1,
  });
  editMode.value = !!row;
  dupRule.value = null;
  editVisible.value = true;
  formRef.value?.clearValidate();
}

/**
 * 「合伙人 + 结算模式」是后端的联合唯一键，重复新增会返回 400。
 * 这里先在当前页已加载的规则里查一次，命中就自动带上 id 转成编辑，用户不会莫名撞 400；
 * 若目标规则不在当前页（分页所限），后端 400 仍是最后一道防线。
 */
function checkDup() {
  if (editMode.value) return;
  dupRule.value = null;
  form.id = 0;
  if (!form.user_id || !form.settle_type) return;
  const hit = list.value.find(
    (r) => Number(r.user_id) === Number(form.user_id) && r.settle_type === form.settle_type,
  );
  if (!hit) return;
  dupRule.value = hit;
  const cond = parseCond(hit.settle_condition) || {};
  form.id = hit.id;
  form.ratio = Number(hit.ratio || 0);
  form.min_amount = cond.min_amount ?? null;
  form.enable = Number(hit.enable);
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await partnerApi.saveRule({
      id: form.id || undefined,
      user_id: form.user_id,
      settle_type: form.settle_type,
      ratio: Number(form.ratio || 0),
      // 门槛不填就传空对象，后端序列化后为 "{}"，表示无附加条件
      settle_condition:
        form.min_amount === null || form.min_amount === undefined || form.min_amount === ''
          ? {}
          : { min_amount: Number(form.min_amount) },
      enable: Number(form.enable),
    });
    ElMessage.success('分利规则已保存');
    editVisible.value = false;
    await reload();
  } catch (e: any) {
    // 全局拦截
  } finally {
    saving.value = false;
  }
}

/** 行内快捷启停：saveRule 是全量覆盖保存，必须把该行原有字段一并带上，否则比例与条件会被清空 */
async function toggleEnable(row: any) {
  const next = Number(row.enable);
  try {
    await partnerApi.saveRule({
      id: row.id,
      user_id: row.user_id,
      settle_type: row.settle_type,
      ratio: Number(row.ratio || 0),
      settle_condition: parseCond(row.settle_condition) || {},
      enable: next,
    });
    ElMessage.success(next ? '规则已启用' : '规则已停用');
  } catch (e: any) {
    // 全局拦截
    row.enable = next ? 0 : 1; // 保存失败回滚开关，避免界面状态与后端不一致
  }
}

loadUsers();
reload();
</script>

<style scoped lang="scss">
.mt-16 {
  margin-top: 16px;
}

.tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.7;
  margin-top: 4px;

  &.inline {
    display: inline;
    margin-left: 8px;
  }
}
</style>
