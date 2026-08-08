<template>
  <div class="page">
    <div class="page-card">
      <h3 class="page-title">员工管理</h3>
      <p class="page-desc">
        统一维护企业在职员工账号；员工的部门决定数据可见范围，角色决定可操作的功能菜单，两者共同构成权限边界
      </p>

      <div class="filter-bar">
        <el-input
          v-model="query.keyword"
          placeholder="账号 / 姓名 / 手机号"
          clearable
          style="width: 220px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-tree-select
          v-model="query.dept_id"
          :data="deptTree"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          check-strictly
          clearable
          :render-after-expand="false"
          placeholder="所属部门"
          style="width: 180px"
          @change="reload"
        />
        <el-select v-model="statusFilter" placeholder="账号状态" clearable style="width: 130px">
          <el-option label="正常" :value="1" />
          <el-option label="已停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button type="primary" :icon="Plus" @click="openEdit()">新增员工</el-button>
      </div>

      <el-table :data="showList" v-loading="loading" border stripe>
        <el-table-column prop="username" label="登录账号" width="130" />
        <el-table-column label="姓名" width="110">
          <template #default="{ row }">
            <b>{{ row.real_name || '-' }}</b>
            <el-tag v-if="row.is_super" type="danger" size="small" effect="dark" class="ml-4">超管</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column prop="post" label="岗位" width="120">
          <template #default="{ row }">{{ row.post || '-' }}</template>
        </el-table-column>
        <el-table-column label="所属部门" width="140">
          <template #default="{ row }">
            <span v-if="row.dept_name">{{ row.dept_name }}</span>
            <span v-else class="text-sub">未分配</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="170">
          <template #default="{ row }">
            <el-tag v-for="r in row.role_names" :key="r" size="small" effect="plain" class="mr-4">
              {{ r }}
            </el-tag>
            <span v-if="!row.role_names?.length" class="text-sub">未授权</span>
          </template>
        </el-table-column>
        <el-table-column label="合伙人" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_partner" type="warning" size="small" effect="dark">合伙人</el-tag>
            <span v-else class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.status === 1"
              :disabled="!!row.is_super"
              :loading="statusSaving === row.id"
              @change="(v: any) => toggleStatus(row, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="最后登录" width="150">
          <template #default="{ row }">
            <span :class="{ 'text-sub': !row.last_login_at }">
              {{ fmt(row.last_login_at) || '从未登录' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="doReset(row)">重置密码</el-button>
            <el-button link type="danger" size="small" :disabled="!!row.is_super" @click="remove(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          :page-size="10"
          :total="total"
          layout="total, prev, pager, next, jumper"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新增/编辑员工 -->
    <el-dialog v-model="editVisible" :title="form.id ? '编辑员工' : '新增员工'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="登录账号" prop="username">
          <el-input
            v-model="form.username"
            :disabled="!!form.id"
            placeholder="登录用账号，创建后不可修改"
            maxlength="30"
          />
        </el-form-item>
        <el-form-item label="员工姓名" prop="real_name">
          <el-input v-model="form.real_name" placeholder="真实姓名" maxlength="20" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="11 位手机号" maxlength="20" />
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="form.post" placeholder="如：销售经理、仓库主管" maxlength="30" />
        </el-form-item>
        <el-form-item label="所属部门">
          <el-tree-select
            v-model="form.dept_id"
            :data="deptTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            check-strictly
            clearable
            :render-after-expand="false"
            placeholder="选择所属部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role_ids" multiple placeholder="可分配多个角色" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.role_name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始密码">
          <el-input v-model="form.password" placeholder="留空则默认 123456，员工登录后可自行修改" />
        </el-form-item>
        <el-form-item label="合伙人身份">
          <el-switch v-model="form.is_partner" />
          <span class="text-sub ml-8">开启后可在「合伙人设置」中配置分权与分成比例</span>
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
import { Plus, Search } from '@element-plus/icons-vue';
import { deptApi, roleApi, userApi } from '../../api';

const loading = ref(false);
const saving = ref(false);
const statusSaving = ref<number | null>(null);
const list = ref<any[]>([]);
const total = ref(0);
const deptTree = ref<any[]>([]);
const roles = ref<any[]>([]);
const statusFilter = ref<number | ''>('');

const query = reactive<any>({ page: 1, keyword: '', dept_id: '' });

/** 账号状态为前端过滤：后端 userPage 暂未支持 status 查询条件 */
const showList = computed(() =>
  statusFilter.value === '' ? list.value : list.value.filter((u) => Number(u.status) === statusFilter.value),
);

async function load() {
  loading.value = true;
  try {
    const res: any = await userApi.page({ ...query, size: 10 });
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

onMounted(async () => {
  load();
  try {
    deptTree.value = (await deptApi.list()) as any;
    roles.value = (await roleApi.list()) as any;
  } catch {
    deptTree.value = [];
    roles.value = [];
  }
});

/* ---------- 新增/编辑 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  id: 0,
  username: '',
  real_name: '',
  phone: '',
  post: '',
  dept_id: '',
  role_ids: [] as number[],
  password: '',
  is_partner: false,
});

const rules = {
  username: [{ required: true, message: '请输入登录账号', trigger: 'blur' }],
  real_name: [{ required: true, message: '请输入员工姓名', trigger: 'blur' }],
  phone: [{ pattern: /^[\d\-+() ]{6,20}$/, message: '手机号格式不正确', trigger: 'blur' }],
};

function openEdit(row?: any) {
  Object.assign(form, {
    id: row?.id || 0,
    username: row?.username || '',
    real_name: row?.real_name || '',
    phone: row?.phone || '',
    post: row?.post || '',
    dept_id: row?.dept_id || '',
    role_ids: row?.role_ids ? [...row.role_ids] : [],
    password: '',
    is_partner: Number(row?.is_partner) === 1,
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
      username: form.username,
      real_name: form.real_name,
      phone: form.phone,
      post: form.post,
      dept_id: Number(form.dept_id || 0),
      role_ids: form.role_ids,
      is_partner: form.is_partner ? 1 : 0,
    };
    if (!form.id && form.password) payload.password = form.password;
    const res: any = await userApi.save(payload);
    if (!form.id) {
      ElMessage.success(`员工创建成功，初始密码：${res.init_password}`);
    } else {
      ElMessage.success('保存成功');
    }
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

/* ---------- 状态 / 重置密码 / 删除 ---------- */
async function toggleStatus(row: any, val: boolean) {
  statusSaving.value = row.id;
  try {
    await userApi.save({ id: row.id, status: val ? 1 : 0 });
    row.status = val ? 1 : 0;
    ElMessage.success(val ? '账号已启用' : '账号已停用');
  } finally {
    statusSaving.value = null;
  }
}

function doReset(row: any) {
  ElMessageBox.confirm(
    `确定重置「${row.real_name || row.username}」的登录密码吗？重置后原密码立即失效。`,
    '重置密码',
    { type: 'warning' },
  )
    .then(async () => {
      const res: any = await userApi.resetPassword({ id: row.id });
      ElMessageBox.alert(
        `新密码：${res.init_password}，请通过安全渠道告知本人，并提醒其登录后立即修改。`,
        '密码已重置',
        { type: 'success', confirmButtonText: '我已记录' },
      );
    })
    .catch(() => void 0);
}

function remove(row: any) {
  ElMessageBox.confirm(
    `确定删除员工「${row.real_name || row.username}」吗？删除后该账号无法登录，历史业务数据保留。`,
    '删除员工',
    { type: 'warning' },
  )
    .then(async () => {
      await userApi.remove(row.id);
      ElMessage.success('已删除');
      load();
    })
    .catch(() => void 0);
}

/* ---------- 工具 ---------- */
function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.mr-4 {
  margin-right: 4px;
}

.ml-4 {
  margin-left: 4px;
}

.ml-8 {
  margin-left: 8px;
  font-size: 12px;
}
</style>
