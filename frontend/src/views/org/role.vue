<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">角色与权限</h3>
      <p class="page-desc">
        角色统一控制两件事：能进哪些功能菜单（菜单权限）、能看到谁的业务数据（数据权限）；员工可同时拥有多个角色，权限取并集
      </p>

      <div class="filter-bar">
        <el-input v-model="keyword" placeholder="角色名称 / 编码" clearable style="width: 220px" />
        <div class="flex-1"></div>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增角色</el-button>
      </div>

      <el-table :data="showList" v-loading="loading" border stripe>
        <el-table-column label="角色名称" min-width="150">
          <template #default="{ row }">
            <b>{{ row.role_name }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="role_code" label="角色编码" width="150" />
        <el-table-column label="数据权限" width="130" align="center">
          <template #default="{ row }">
            <el-tag :type="scopeType(row.data_scope)" size="small" effect="dark">
              {{ row.data_scope_text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="已授权菜单" width="130" align="center">
          <template #default="{ row }">
            <span v-if="row.menu_codes?.length">{{ row.menu_codes.length }} 项</span>
            <span v-else class="text-sub">未授权</span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="200">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.remark }">{{ row.remark || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="openPerm(row)">配置权限</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增/编辑角色 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑角色' : '新增角色'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="角色名称" prop="role_name">
          <el-input v-model="form.role_name" placeholder="如：区域销售主管" maxlength="20" />
        </el-form-item>
        <el-form-item label="角色编码">
          <el-input
            v-model="form.role_code"
            :disabled="!!form.id"
            placeholder="英文标识，留空由系统自动生成"
            maxlength="30"
          />
        </el-form-item>
        <el-form-item label="数据权限">
          <el-radio-group v-model="form.data_scope">
            <el-radio v-for="s in scopes" :key="s.v" :value="s.v">{{ s.l }}</el-radio>
          </el-radio-group>
          <div class="scope-tip">{{ scopeDesc(form.data_scope) }}</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="3"
            placeholder="说明该角色适用的岗位与职责范围，便于后续交接"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 权限配置抽屉 -->
    <el-drawer v-model="permVisible" :title="`配置权限 · ${current?.role_name || ''}`" size="520px">
      <div v-loading="permLoading">
        <h4 class="sec-title">数据权限</h4>
        <el-radio-group v-model="permForm.data_scope">
          <el-radio v-for="s in scopes" :key="s.v" :value="s.v">{{ s.l }}</el-radio>
        </el-radio-group>
        <div class="scope-tip">{{ scopeDesc(permForm.data_scope) }}</div>

        <h4 class="sec-title mt-16">
          菜单权限
          <span class="text-sub tiny">已勾选 {{ checkedCount }} 项</span>
          <el-button link type="primary" size="small" @click="checkAll(true)">全选</el-button>
          <el-button link type="info" size="small" @click="checkAll(false)">清空</el-button>
        </h4>
        <p class="text-sub tiny mb-12">
          勾选子菜单后，其所属的一级模块会自动一并授权；未勾选的菜单在该角色登录后不会出现在左侧导航
        </p>
        <el-tree
          ref="treeRef"
          :data="menuTree"
          show-checkbox
          node-key="code"
          :props="{ label: 'name', children: 'children' }"
          default-expand-all
          @check="onCheck"
        />
      </div>
      <template #footer>
        <el-button @click="permVisible = false">取消</el-button>
        <el-button type="primary" :loading="permSaving" @click="submitPerm">保存权限</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, ElTree, FormInstance } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { roleApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const menuTree = ref<any[]>([]);
const keyword = ref('');

const scopes = [
  { v: 1, l: '本人' },
  { v: 2, l: '本部门' },
  { v: 3, l: '全企业' },
];

const showList = computed(() => {
  const kw = keyword.value.trim();
  if (!kw) return list.value;
  return list.value.filter((r) => (r.role_name || '').includes(kw) || (r.role_code || '').includes(kw));
});

async function load() {
  loading.value = true;
  try {
    list.value = (await roleApi.list()) as any;
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

/* ---------- 新增/编辑角色 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({ id: 0, role_name: '', role_code: '', data_scope: 1, remark: '' });

const rules = {
  role_name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
};

function openEdit(row?: any) {
  Object.assign(form, {
    id: row?.id || 0,
    role_name: row?.role_name || '',
    role_code: row?.role_code || '',
    data_scope: row?.data_scope || 1,
    remark: row?.remark || '',
  });
  editVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await roleApi.save({
      id: form.id || undefined,
      role_name: form.role_name,
      role_code: form.role_code || undefined,
      data_scope: form.data_scope,
      remark: form.remark,
    });
    ElMessage.success('保存成功');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

function remove(row: any) {
  ElMessageBox.confirm(
    `确定删除角色「${row.role_name}」吗？已分配给员工的角色不允许删除。`,
    '删除角色',
    { type: 'warning' },
  )
    .then(async () => {
      await roleApi.remove(row.id);
      ElMessage.success('已删除');
      load();
    })
    .catch(() => void 0);
}

/* ---------- 权限配置 ---------- */
const permVisible = ref(false);
const permLoading = ref(false);
const permSaving = ref(false);
const treeRef = ref<InstanceType<typeof ElTree>>();
const current = ref<any>(null);
const checkedCount = ref(0);
const permForm = reactive<any>({ data_scope: 1 });

/** 拥有子节点的编码集合，回显时只勾选叶子，避免父节点级联把兄弟菜单一并选中 */
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

async function openPerm(row: any) {
  current.value = row;
  permForm.data_scope = row.data_scope || 1;
  permVisible.value = true;
  permLoading.value = true;
  try {
    if (!menuTree.value.length) menuTree.value = (await roleApi.menuTree()) as any;
    // 等待抽屉内的树渲染完成再回显勾选状态
    setTimeout(() => {
      const leafCodes = (row.menu_codes || []).filter((c: string) => !parentCodes.value.has(c));
      treeRef.value?.setCheckedKeys(leafCodes, false);
      refreshCount();
    }, 0);
  } finally {
    permLoading.value = false;
  }
}

function collectCodes(): string[] {
  const checked = (treeRef.value?.getCheckedKeys(false) || []) as string[];
  const half = (treeRef.value?.getHalfCheckedKeys() || []) as string[];
  return Array.from(new Set([...checked, ...half]));
}

function refreshCount() {
  checkedCount.value = collectCodes().length;
}

function onCheck() {
  refreshCount();
}

function checkAll(v: boolean) {
  const all: string[] = [];
  const walk = (nodes: any[]) => {
    for (const n of nodes) {
      all.push(n.code);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(menuTree.value);
  treeRef.value?.setCheckedKeys(v ? all : [], false);
  refreshCount();
}

async function submitPerm() {
  const codes = collectCodes();
  if (!codes.length) {
    return ElMessage.warning('请至少勾选一项菜单权限');
  }
  permSaving.value = true;
  try {
    await roleApi.perm({
      role_id: current.value.id,
      menu_codes: codes,
      data_scope: permForm.data_scope,
    });
    ElMessage.success('权限已保存，相关员工下次登录生效');
    permVisible.value = false;
    load();
  } finally {
    permSaving.value = false;
  }
}

/* ---------- 工具 ---------- */
function scopeType(s: number) {
  return s === 3 ? 'danger' : s === 2 ? 'warning' : 'info';
}

function scopeDesc(s: number) {
  if (s === 3) return '全企业：可查看并管理企业内全部客户、订单、库存与日志数据，适用于管理层';
  if (s === 2) return '本部门：可查看本部门及下级部门成员的业务数据，适用于部门主管';
  return '本人：仅能查看自己负责的客户、跟进与订单数据，适用于一线员工';
}
</script>

<style scoped lang="scss">
.sec-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-top: 6px;
  line-height: 1.7;
}

.tiny {
  font-size: 12px;
  font-weight: 400;
}
</style>
