<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">部门管理</h3>
      <p class="page-desc">
        维护企业组织架构树；部门层级决定「本部门」数据权限的可见范围，部门负责人用于业绩归属与跟进指派
      </p>

      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="部门名称"
          clearable
          style="width: 220px"
          @keyup.enter="load"
          @clear="load"
        />
        <el-button type="primary" :icon="Search" @click="load">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Sort" @click="toggleExpand">{{ expandAll ? '全部折叠' : '全部展开' }}</el-button>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增部门</el-button>
      </div>

      <el-table
        :key="tableKey"
        :data="tableData"
        v-loading="loading"
        row-key="id"
        :tree-props="{ children: 'children' }"
        :default-expand-all="expandAll"
        border
      >
        <el-table-column label="部门名称" min-width="240">
          <template #default="{ row }">
            <b>{{ row.name }}</b>
            <el-tag v-if="!row.parent_id" size="small" effect="plain" class="ml-6">顶级</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="部门负责人" width="150">
          <template #default="{ row }">
            <span v-if="row.leader_name">{{ row.leader_name }}</span>
            <span v-else class="text-sub">未指定</span>
          </template>
        </el-table-column>
        <el-table-column label="在职人数" width="110" align="center">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.user_count }">{{ row.user_count }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序值" width="100" align="center" />
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(undefined, row.id)">
              新增子部门
            </el-button>
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="!loading && !tableData.length" class="empty-tip">
        暂无部门数据，请先新增顶级部门（如总经办、销售部）
      </div>
    </div>

    <!-- 新增/编辑部门 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑部门' : '新增部门'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="form.name" placeholder="如：华南销售一部" maxlength="30" />
        </el-form-item>
        <el-form-item label="上级部门">
          <el-tree-select
            v-model="form.parent_id"
            :data="parentOptions"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            check-strictly
            :render-after-expand="false"
            placeholder="不选则为顶级部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="部门负责人">
          <el-select
            v-model="form.leader_user_id"
            filterable
            clearable
            placeholder="从在职员工中选择"
            style="width: 100%"
          >
            <el-option v-for="u in users" :key="u.id" :label="u.real_name || u.username" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序值">
          <el-input-number v-model="form.sort" :min="0" :max="9999" controls-position="right" />
          <span class="text-sub ml-6">数值越小越靠前</span>
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
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import { Plus, Search, Sort } from '@element-plus/icons-vue';
import { deptApi, userApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const tree = ref<any[]>([]);
const users = ref<any[]>([]);
const keyword = ref('');
const expandAll = ref(true);
const tableKey = ref(0);

/** 关键词过滤：父节点名称命中或任一子孙命中都保留 */
const tableData = computed(() => filterTree(tree.value, keyword.value.trim()));

function filterTree(nodes: any[], kw: string): any[] {
  if (!kw) return nodes;
  const out: any[] = [];
  for (const n of nodes) {
    const children = filterTree(n.children || [], kw);
    if (n.name.includes(kw) || children.length) out.push({ ...n, children });
  }
  return out;
}

/** 上级部门下拉：编辑时需排除自身及其子树，避免形成环 */
const parentOptions = computed(() => {
  const exclude = (nodes: any[]): any[] =>
    nodes
      .filter((n) => n.id !== form.id)
      .map((n) => ({ id: n.id, name: n.name, children: exclude(n.children || []) }));
  return [{ id: 0, name: '顶级部门（无上级）', children: [] }, ...exclude(tree.value)];
});

async function load() {
  loading.value = true;
  try {
    tree.value = (await deptApi.list()) as any;
  } finally {
    loading.value = false;
  }
}

function toggleExpand() {
  expandAll.value = !expandAll.value;
  tableKey.value += 1;
}

onMounted(async () => {
  load();
  try {
    users.value = (await userApi.options()) as any;
  } catch {
    users.value = [];
  }
});

/* ---------- 新增/编辑 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({ id: 0, name: '', parent_id: 0, leader_user_id: '', sort: 0 });

const rules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
};

function openEdit(row?: any, parentId?: number) {
  Object.assign(form, {
    id: row?.id || 0,
    name: row?.name || '',
    parent_id: row ? row.parent_id || 0 : parentId || 0,
    leader_user_id: row?.leader_user_id || '',
    sort: row?.sort ?? 0,
  });
  editVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await deptApi.save({
      id: form.id || undefined,
      name: form.name,
      parent_id: Number(form.parent_id || 0),
      leader_user_id: Number(form.leader_user_id || 0),
      sort: Number(form.sort || 0),
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
    `确定删除部门「${row.name}」吗？存在子部门或在职员工的部门不允许删除。`,
    '删除部门',
    { type: 'warning' },
  )
    .then(async () => {
      // 后端会校验子部门与在职员工，失败信息由 request.ts 统一提示
      await deptApi.remove(row.id);
      ElMessage.success('已删除');
      load();
    })
    .catch(() => void 0);
}
</script>

<style scoped lang="scss">
.ml-6 {
  margin-left: 6px;
}
</style>
