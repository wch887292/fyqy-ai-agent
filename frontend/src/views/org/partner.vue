<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">合伙人设置</h3>
      <p class="page-desc">
        在员工名册上直接开通或关闭合伙人身份，并配置其可见数据范围、授权模块与预估分成比例；配置结果与「合伙人管理 · 分权配置」共用同一份数据
      </p>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="V1.0 的分成比例仅用于生成预估分成台账，供内部对账参考；实际发放金额以 V2.0 自动核算结果为准"
        class="mb-12"
      />

      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="员工姓名 / 岗位"
          clearable
          style="width: 220px"
        />
        <el-select v-model="onlyPartner" style="width: 160px">
          <el-option label="全部员工" :value="0" />
          <el-option label="仅看合伙人" :value="1" />
        </el-select>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <div class="stat-grid mb-12">
        <div class="stat-card">
          <div class="label">在职员工</div>
          <div class="value">{{ users.length }}</div>
          <div class="sub">可开通合伙人身份</div>
        </div>
        <div class="stat-card success">
          <div class="label">生效中的合伙人</div>
          <div class="value">{{ activeCount }}</div>
          <div class="sub">已完成分权配置</div>
        </div>
        <div class="stat-card warn">
          <div class="label">平均分成比例</div>
          <div class="value">{{ avgRatio }}%</div>
          <div class="sub">按生效中的合伙人计算</div>
        </div>
      </div>

      <el-table :data="showList" v-loading="loading" border stripe>
        <el-table-column label="员工" min-width="140">
          <template #default="{ row }">
            <b>{{ row.real_name }}</b>
          </template>
        </el-table-column>
        <el-table-column label="岗位" width="130">
          <template #default="{ row }">{{ row.post || '-' }}</template>
        </el-table-column>
        <el-table-column label="合伙人身份" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="isActive(row)" type="success" size="small" effect="dark">已开通</el-tag>
            <span v-else class="text-sub">未开通</span>
          </template>
        </el-table-column>
        <el-table-column label="合伙人类型" width="130">
          <template #default="{ row }">
            <span v-if="cfg(row)">{{ cfg(row).partner_type }}</span>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="数据范围" width="110" align="center">
          <template #default="{ row }">
            <el-tag v-if="cfg(row)" :type="scopeType(cfg(row).data_scope)" size="small" effect="plain">
              {{ cfg(row).data_scope_text }}
            </el-tag>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="分成比例" width="110" align="center">
          <template #default="{ row }">
            <b v-if="cfg(row)" class="ratio">{{ cfg(row).default_ratio }}%</b>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="授权模块" width="110" align="center">
          <template #default="{ row }">
            <span v-if="cfg(row)?.menu_codes?.length">{{ cfg(row).menu_codes.length }} 项</span>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !cfg(row)?.remark }">{{ cfg(row)?.remark || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!isActive(row)" link type="primary" size="small" @click="openConfig(row)">
              开通合伙人
            </el-button>
            <template v-else>
              <el-button link type="primary" size="small" @click="openConfig(row)">编辑分权</el-button>
              <el-button link type="danger" size="small" @click="disable(row)">关闭身份</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分权配置 -->
    <el-dialog v-model="editVisible" :title="`合伙人分权配置 · ${form.real_name}`" width="640px">
      <el-form :model="form" label-width="110px">
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
        <el-form-item label="数据范围">
          <el-radio-group v-model="form.data_scope">
            <el-radio :value="1">本人</el-radio>
            <el-radio :value="2">本部门</el-radio>
            <el-radio :value="3">全企业</el-radio>
          </el-radio-group>
          <div class="tip">{{ scopeDesc(form.data_scope) }}</div>
        </el-form-item>
        <el-form-item label="分成比例">
          <el-input-number v-model="form.default_ratio" :min="0" :max="100" :precision="2" :step="1" />
          <span class="tip inline">%　用于业绩台账的预估分成计算，可精确到小数点后两位</span>
        </el-form-item>
        <el-form-item label="授权模块">
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
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="合作方式、结算周期、约定事项等，便于后续对账追溯"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存并开通</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElTree } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { partnerApi, roleApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const users = ref<any[]>([]);
const configs = ref<any[]>([]);
const menuTree = ref<any[]>([]);
const keyword = ref('');
const onlyPartner = ref(0);

const partnerTypes = ['业务合伙人', '区域合伙人', '资源合伙人', '技术合伙人', '渠道合伙人'];

const cfgMap = computed(() => new Map(configs.value.map((c) => [Number(c.user_id), c])));

function cfg(row: any) {
  return cfgMap.value.get(Number(row.id));
}

function isActive(row: any) {
  const c = cfg(row);
  return Number(row.is_partner) === 1 || (c && Number(c.enable) === 1);
}

const showList = computed(() => {
  const kw = keyword.value.trim();
  return users.value.filter((u) => {
    if (onlyPartner.value && !isActive(u)) return false;
    if (!kw) return true;
    return (u.real_name || '').includes(kw) || (u.post || '').includes(kw);
  });
});

const activeCount = computed(() => users.value.filter((u) => isActive(u)).length);

const avgRatio = computed(() => {
  const rows = configs.value.filter((c) => Number(c.enable) === 1);
  if (!rows.length) return '0.00';
  const sum = rows.reduce((s, c) => s + Number(c.default_ratio || 0), 0);
  return (sum / rows.length).toFixed(2);
});

async function load() {
  loading.value = true;
  try {
    const [opts, page]: any = await Promise.all([
      partnerApi.options(),
      partnerApi.configPage({ page: 1, size: 200 }),
    ]);
    users.value = opts || [];
    configs.value = page?.list || [];
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  load();
  try {
    menuTree.value = (await roleApi.menuTree()) as any;
  } catch {
    menuTree.value = [];
  }
});

/* ---------- 分权配置 ---------- */
const editVisible = ref(false);
const treeRef = ref<InstanceType<typeof ElTree>>();
const form = reactive<any>({
  user_id: 0,
  real_name: '',
  partner_type: '业务合伙人',
  data_scope: 2,
  default_ratio: 0,
  remark: '',
});

/** 拥有子节点的编码集合，回显时只勾选叶子节点 */
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

function openConfig(row: any) {
  const c = cfg(row);
  Object.assign(form, {
    user_id: row.id,
    real_name: row.real_name,
    partner_type: c?.partner_type || '业务合伙人',
    data_scope: c?.data_scope || 2,
    default_ratio: Number(c?.default_ratio || 0),
    remark: c?.remark || '',
  });
  editVisible.value = true;
  setTimeout(() => {
    const leafCodes = (c?.menu_codes || []).filter((k: string) => !parentCodes.value.has(k));
    treeRef.value?.setCheckedKeys(leafCodes, false);
  }, 0);
}

function collectCodes(): string[] {
  const checked = (treeRef.value?.getCheckedKeys(false) || []) as string[];
  const half = (treeRef.value?.getHalfCheckedKeys() || []) as string[];
  return Array.from(new Set([...checked, ...half]));
}

async function submit() {
  saving.value = true;
  try {
    await partnerApi.saveConfig({
      user_id: form.user_id,
      partner_type: form.partner_type,
      data_scope: form.data_scope,
      default_ratio: Number(form.default_ratio || 0),
      menu_codes: collectCodes(),
      remark: form.remark,
      enable: 1,
    });
    ElMessage.success('合伙人分权配置已保存');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

function disable(row: any) {
  const c = cfg(row);
  ElMessageBox.confirm(
    `确定关闭「${row.real_name}」的合伙人身份吗？关闭后其合伙人相关菜单立即收回，历史业绩台账保留。`,
    '关闭合伙人身份',
    { type: 'warning' },
  )
    .then(async () => {
      await partnerApi.saveConfig({
        user_id: row.id,
        partner_type: c?.partner_type || '业务合伙人',
        data_scope: c?.data_scope || 1,
        default_ratio: Number(c?.default_ratio || 0),
        menu_codes: c?.menu_codes || [],
        remark: c?.remark || '',
        enable: 0,
      });
      ElMessage.success('已关闭合伙人身份');
      load();
    })
    .catch(() => void 0);
}

/* ---------- 工具 ---------- */
function scopeType(s: number) {
  return s === 3 ? 'danger' : s === 2 ? 'warning' : 'info';
}

function scopeDesc(s: number) {
  if (s === 3) return '全企业：可查看企业全量业务数据，仅建议授予核心创始合伙人';
  if (s === 2) return '本部门：可查看所在部门及下级部门的客户与订单，适用于区域负责人';
  return '本人：仅能查看自己名下的客户与业绩，适用于个人业务合伙人';
}
</script>

<style scoped lang="scss">
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

.ratio {
  color: var(--fae-primary);
}
</style>
