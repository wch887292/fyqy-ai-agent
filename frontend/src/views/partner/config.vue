<template>
  <div class="page">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">生效合伙人</div>
        <div class="value">{{ overview.partner_total ?? 0 }}</div>
        <div class="sub">已完成分权配置</div>
      </div>
      <div class="stat-card">
        <div class="label">业绩笔数</div>
        <div class="value">{{ overview.performance_count ?? 0 }}</div>
        <div class="sub">台账累计记录</div>
      </div>
      <div class="stat-card success">
        <div class="label">业绩总额</div>
        <div class="value">{{ money(overview.performance_amount) }}</div>
        <div class="sub">归属合伙人的订单金额</div>
      </div>
      <div class="stat-card warn">
        <div class="label">预估分成</div>
        <div class="value">{{ money(overview.estimate_amount) }}</div>
        <div class="sub">仅预估，非实发</div>
      </div>
      <div class="stat-card danger">
        <div class="label">待处理风险</div>
        <div class="value">{{ overview.risk_pending ?? 0 }}</div>
        <div class="sub">需合伙人跟进</div>
      </div>
    </div>

    <div class="page-card mt-12">
      <h3 class="page-title">分权配置</h3>
      <p class="page-desc">
        飞扬企源「分权 / 分利 / 分风险」三分体系的分权环节：为区域与业务合伙人设定可见数据范围、授权菜单与预估分成比例
      </p>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="V1.0 的分权配置用于控制合伙人的可见范围与预估分成，实际分红发放以 V2.0 自动核算为准"
        class="mb-12"
      />

      <div class="filter-bar">
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增合伙人配置</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="合伙人" min-width="130">
          <template #default="{ row }">
            <b>{{ row.real_name || '-' }}</b>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="130">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.phone }">{{ row.phone || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="partner_type" label="合伙人类型" width="130" />
        <el-table-column label="数据权限" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="scopeType(row.data_scope)" size="small" effect="plain">
              {{ row.data_scope_text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分成比例" width="110" align="center">
          <template #default="{ row }">
            <b class="ratio">{{ Number(row.default_ratio || 0).toFixed(2) }}%</b>
          </template>
        </el-table-column>
        <el-table-column label="授权菜单" width="110" align="center">
          <template #default="{ row }">
            <el-button v-if="row.menu_codes?.length" link type="primary" size="small" @click="showMenus(row)">
              {{ row.menu_codes.length }} 项
            </el-button>
            <span v-else class="text-sub">未授权</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enable ? 'success' : 'info'" size="small" effect="dark">
              {{ row.enable ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.remark }">{{ row.remark || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
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

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑分权配置' : '新增合伙人配置'" width="680px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="合伙人">
          <el-select
            v-model="form.user_id"
            filterable
            :disabled="!!form.id"
            placeholder="选择企业员工"
            style="width: 100%"
            @change="onPickUser"
          >
            <el-option
              v-for="u in users"
              :key="u.id"
              :label="`${u.real_name}${u.post ? ' / ' + u.post : ''}`"
              :value="u.id"
            >
              <span>{{ u.real_name }}{{ u.post ? ' / ' + u.post : '' }}</span>
              <span v-if="u.is_partner" class="opt-tag">已是合伙人</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="合伙人类型">
          <el-select
            v-model="form.partner_type"
            filterable
            allow-create
            default-first-option
            placeholder="选择或自定义输入"
            style="width: 100%"
          >
            <el-option v-for="t in partnerTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据权限">
          <el-radio-group v-model="form.data_scope">
            <el-radio :value="1">本人</el-radio>
            <el-radio :value="2">本部门</el-radio>
            <el-radio :value="3">全企业</el-radio>
          </el-radio-group>
          <div class="tip">{{ scopeDesc(form.data_scope) }}</div>
        </el-form-item>
        <el-form-item label="分成比例">
          <el-input-number v-model="form.default_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 200px" />
          <span class="tip inline">%　业绩台账按该比例自动测算预估分成</span>
        </el-form-item>
        <el-form-item label="授权菜单">
          <div class="tree-box">
            <el-tree
              ref="treeRef"
              :data="menuTree"
              show-checkbox
              node-key="code"
              :props="{ label: 'name', children: 'children' }"
              default-expand-all
            />
          </div>
          <div class="tip">合伙人登录后仅能看到勾选的功能菜单，建议至少授权业绩台账与风险预警</div>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="form.enable" :active-value="1" :inactive-value="0" />
          <span class="tip inline">停用后立即收回合伙人身份与菜单，历史业绩台账保留</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="合作区域、结算周期、约定事项等，便于后续对账追溯"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 授权菜单明细 -->
    <el-dialog v-model="menuVisible" :title="`授权菜单明细 · ${menuRow.real_name}`" width="520px">
      <div v-if="menuRow.menu_codes?.length" class="menu-list">
        <el-tag v-for="c in menuRow.menu_codes" :key="c" size="small" effect="plain" class="menu-tag">
          {{ menuName(c) }}
        </el-tag>
      </div>
      <div v-else class="empty-tip">未授权任何菜单</div>
      <template #footer>
        <el-button @click="menuVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElTree } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { partnerApi, roleApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const overview = ref<any>({});
const users = ref<any[]>([]);
const menuTree = ref<any[]>([]);

const query = reactive<any>({ page: 1, size: 10 });

const partnerTypes = ['业务合伙人', '区域合伙人', '资源合伙人', '技术合伙人', '渠道合伙人'];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const res: any = await partnerApi.configPage({ ...query });
    list.value = res.list || [];
    total.value = res.total || 0;
  } finally {
    loading.value = false;
  }
}

async function loadOverview() {
  try {
    overview.value = (await partnerApi.overview()) as any;
  } catch {
    overview.value = {};
  }
}

onMounted(async () => {
  load();
  loadOverview();
  try {
    users.value = ((await partnerApi.options()) as any) || [];
  } catch {
    users.value = [];
  }
  try {
    menuTree.value = ((await roleApi.menuTree()) as any) || [];
  } catch {
    menuTree.value = [];
  }
});

/* ---------- 新增 / 编辑 ---------- */
const editVisible = ref(false);
const treeRef = ref<InstanceType<typeof ElTree>>();
const form = reactive<any>({
  id: 0,
  user_id: '',
  partner_type: '业务合伙人',
  data_scope: 2,
  default_ratio: 0,
  enable: 1,
  remark: '',
});

/** 有子节点的编码集合：回显时只勾选叶子，避免 el-tree 联动误判 */
const parentCodes = computed(() => {
  const set = new Set<string>();
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      if (n.children?.length) {
        set.add(n.code);
        walk(n.children);
      }
    }
  };
  walk(menuTree.value);
  return set;
});

function openEdit(row?: any) {
  Object.assign(form, {
    id: row?.id || 0,
    user_id: row?.user_id || '',
    partner_type: row?.partner_type || '业务合伙人',
    data_scope: Number(row?.data_scope || 2),
    default_ratio: Number(row?.default_ratio || 0),
    enable: row ? Number(row.enable) : 1,
    remark: row?.remark || '',
  });
  editVisible.value = true;
  setTimeout(() => {
    const leaf = (row?.menu_codes || []).filter((c: string) => !parentCodes.value.has(c));
    treeRef.value?.setCheckedKeys(leaf, false);
  }, 0);
}

function onPickUser(val: any) {
  const u = users.value.find((x) => Number(x.id) === Number(val));
  if (u?.post?.includes('区域')) form.partner_type = '区域合伙人';
}

function collectCodes(): string[] {
  const checked = (treeRef.value?.getCheckedKeys(false) || []) as string[];
  const half = (treeRef.value?.getHalfCheckedKeys() || []) as string[];
  return Array.from(new Set([...checked, ...half]));
}

async function submit() {
  if (!form.user_id) return ElMessage.warning('请选择合伙人');
  saving.value = true;
  try {
    await partnerApi.saveConfig({
      user_id: form.user_id,
      partner_type: form.partner_type,
      data_scope: Number(form.data_scope),
      default_ratio: Number(form.default_ratio || 0),
      menu_codes: collectCodes(),
      enable: Number(form.enable),
      remark: form.remark,
    });
    ElMessage.success('分权配置已保存');
    editVisible.value = false;
    load();
    loadOverview();
  } finally {
    saving.value = false;
  }
}

function remove(row: any) {
  ElMessageBox.confirm(
    `确定删除「${row.real_name}」的分权配置吗？删除后其合伙人身份同步关闭，历史业绩台账保留。`,
    '删除分权配置',
    { type: 'warning' },
  )
    .then(async () => {
      await partnerApi.removeConfig(row.id);
      ElMessage.success('已删除');
      load();
      loadOverview();
    })
    .catch(() => void 0);
}

/* ---------- 授权菜单明细 ---------- */
const menuVisible = ref(false);
const menuRow = ref<any>({});

function showMenus(row: any) {
  menuRow.value = row;
  menuVisible.value = true;
}

const menuNameMap = computed(() => {
  const map = new Map<string, string>();
  const walk = (nodes: any[], prefix = '') => {
    for (const n of nodes) {
      const name = prefix ? `${prefix} / ${n.name}` : n.name;
      map.set(n.code, name);
      if (n.children?.length) walk(n.children, n.name);
    }
  };
  walk(menuTree.value);
  return map;
});

function menuName(code: string) {
  return menuNameMap.value.get(code) || code;
}

/* ---------- 工具 ---------- */
function money(v: any) {
  return `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function scopeType(s: number) {
  return s === 3 ? 'danger' : s === 2 ? 'warning' : 'info';
}

function scopeDesc(s: number) {
  if (Number(s) === 3) return '全企业：可查看企业全量客户与订单数据，仅建议授予核心创始合伙人';
  if (Number(s) === 2) return '本部门：可查看所在部门及下级部门的客户与订单，适用于区域负责人';
  return '本人：仅能查看自己名下的客户与业绩，适用于个人业务合伙人';
}
</script>

<style scoped lang="scss">
.ratio {
  color: var(--fae-primary);
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

.tree-box {
  width: 100%;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--fae-border);
  border-radius: 8px;
  padding: 8px 10px;
}

.opt-tag {
  float: right;
  font-size: 12px;
  color: var(--fae-success);
  margin-left: 12px;
}

.menu-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.menu-tag {
  margin: 0;
}
</style>
