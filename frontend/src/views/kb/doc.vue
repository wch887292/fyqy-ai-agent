<template>
  <div class="page">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="label">文档总数</div>
        <div class="value">{{ ov.doc_total ?? 0 }}</div>
        <div class="sub">五大知识库合计</div>
      </div>
      <div class="stat-card success">
        <div class="label">已向量化</div>
        <div class="value">{{ ov.vectored_total ?? 0 }}</div>
        <div class="sub">可被 AI 问答检索</div>
      </div>
      <div class="stat-card warn">
        <div class="label">待处理</div>
        <div class="value">{{ ov.pending_total ?? 0 }}</div>
        <div class="sub">未完成向量化</div>
      </div>
      <div class="stat-card">
        <div class="label">知识片段</div>
        <div class="value">{{ ov.chunk_total ?? 0 }}</div>
        <div class="sub">文档切分后的检索单元</div>
      </div>
    </div>

    <div class="page-card mt-12">
      <h3 class="page-title">知识库文档</h3>
      <p class="page-desc">
        企业制度、产品参数、销售话术等资料统一沉淀在此；上传后系统自动切片向量化，员工提问时 AI 只依据这里的资料作答，避免口径不一
      </p>

      <div class="cat-grid">
        <div class="cat-card" :class="{ active: query.category === '' }" @click="pickCat('')">
          <div class="cn">全部文档</div>
          <div class="cc">{{ ov.doc_total ?? 0 }}</div>
        </div>
        <div
          v-for="c in categories"
          :key="c.code"
          class="cat-card"
          :class="{ active: query.category === c.code }"
          @click="pickCat(c.code)"
        >
          <div class="cn">{{ c.name }}</div>
          <div class="cc">{{ c.count ?? 0 }}</div>
        </div>
      </div>

      <div class="filter-bar mt-12">
        <el-input
          v-model="query.keyword"
          placeholder="标题 / 标签 / 摘要"
          clearable
          style="width: 240px"
          @keyup.enter="reload"
          @clear="reload"
        />
        <el-select v-model="query.category" placeholder="所属分类" clearable style="width: 160px" @change="reload">
          <el-option v-for="c in categories" :key="c.code" :label="c.name" :value="c.code" />
        </el-select>
        <el-select
          v-model="query.vector_status"
          placeholder="向量状态"
          clearable
          style="width: 140px"
          @change="reload"
        >
          <el-option label="待向量化" :value="0" />
          <el-option label="已完成" :value="1" />
          <el-option label="失败" :value="2" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <div class="flex-1"></div>
        <el-button :icon="Refresh" @click="loadAll">刷新</el-button>
        <el-button type="primary" :icon="Upload" @click="goUpload">上传文档</el-button>
      </div>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column label="文档标题" min-width="220">
          <template #default="{ row }">
            <div class="doc-cell">
              <b>{{ row.title }}</b>
              <span class="text-sub">{{ row.file_name || '-' }} · {{ fmtSize(row.file_size) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.category_name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内容摘要" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.summary">{{ row.summary }}</span>
            <span v-else class="text-sub">暂无摘要</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="t in row.tag_list" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
            <span v-if="!row.tag_list?.length" class="text-sub">-</span>
          </template>
        </el-table-column>
        <el-table-column label="向量状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="vecType(row.vector_status)" size="small" effect="dark">
              {{ row.vector_status_text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="chunk_count" label="片段数" width="80" align="center" />
        <el-table-column prop="created_by_name" label="上传人" width="90">
          <template #default="{ row }">{{ row.created_by_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="上传时间" width="150">
          <template #default="{ row }">{{ fmt(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
            <el-button
              link
              type="warning"
              size="small"
              :loading="vecLoading === row.id"
              @click="doRevectorize(row)"
            >
              重新向量化
            </el-button>
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="doRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </div>

    <!-- 文档详情 -->
    <el-drawer v-model="detailVisible" title="文档详情" size="680px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <div class="d-head">
            <div>
              <h3 class="d-name">{{ detail.title }}</h3>
              <p class="text-sub">{{ detail.file_name || '-' }} · {{ fmtSize(detail.file_size) }}</p>
            </div>
            <el-tag :type="vecType(detail.vector_status)" effect="dark">
              {{ vecText(detail.vector_status) }}
            </el-tag>
          </div>

          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="所属分类">{{ catName(detail.category) }}</el-descriptions-item>
            <el-descriptions-item label="知识片段">{{ detail.chunk_count || 0 }} 段</el-descriptions-item>
            <el-descriptions-item label="权限范围">{{ scopeText(detail.perm_scope) }}</el-descriptions-item>
            <el-descriptions-item label="上传时间">{{ fmt(detail.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="标签" :span="2">
              <el-tag v-for="t in detail.tag_list" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
              <span v-if="!detail.tag_list?.length" class="text-sub">-</span>
            </el-descriptions-item>
          </el-descriptions>

          <h4 class="sec-title mt-16">AI 摘要</h4>
          <div class="ai-box">{{ detail.summary || '该文档暂未生成摘要' }}</div>

          <h4 class="sec-title mt-16">
            分片内容
            <span class="text-sub tiny">检索时按片段命中，片段越聚焦回答越准</span>
          </h4>
          <div v-if="detail.chunks?.length">
            <div v-for="(c, i) in detail.chunks" :key="i" class="chunk-card">
              <div class="ck-head">片段 {{ i + 1 }}</div>
              <div class="ck-body">{{ typeof c === 'string' ? c : c.content }}</div>
            </div>
          </div>
          <div v-else-if="detail.content" class="chunk-card">
            <div class="ck-head">文档正文（前 3000 字）</div>
            <div class="ck-body">{{ String(detail.content).slice(0, 3000) }}</div>
          </div>
          <div v-else class="empty-tip">暂无可展示的正文内容</div>
        </template>
      </div>
    </el-drawer>

    <!-- 编辑文档 -->
    <el-dialog v-model="editVisible" title="编辑文档信息" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="文档标题" prop="title">
          <el-input v-model="form.title" placeholder="便于检索的标题，如「2026 年考勤管理制度」" />
        </el-form-item>
        <el-form-item label="所属分类" prop="category">
          <el-select v-model="form.category" placeholder="请选择知识库" style="width: 100%">
            <el-option v-for="c in categories" :key="c.code" :label="c.name" :value="c.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="文档标签">
          <el-select
            v-model="form.tag_list"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="可自定义输入后回车"
            style="width: 100%"
          >
            <el-option v-for="t in tagPreset" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="权限范围">
          <el-radio-group v-model="form.perm_scope" @change="form.perm_targets = []">
            <el-radio-button value="all">全员可见</el-radio-button>
            <el-radio-button value="dept">指定部门</el-radio-button>
            <el-radio-button value="role">指定角色</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.perm_scope === 'dept'" label="可见部门">
          <el-tree-select
            v-model="form.perm_targets"
            :data="deptTree"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            multiple
            check-strictly
            :render-after-expand="false"
            placeholder="选择可查看该文档的部门"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="form.perm_scope === 'role'" label="可见角色">
          <el-select v-model="form.perm_targets" multiple placeholder="选择可查看该文档的角色" style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
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
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, FormInstance } from 'element-plus';
import { Refresh, Search, Upload } from '@element-plus/icons-vue';
import { deptApi, kbApi, roleApi } from '../../api';

const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const list = ref<any[]>([]);
const total = ref(0);
const ov = ref<any>({});
const categories = ref<any[]>([]);
const deptTree = ref<any[]>([]);
const roles = ref<any[]>([]);
const vecLoading = ref<number | null>(null);

const query = reactive<any>({ page: 1, size: 10, keyword: '', category: '', vector_status: '' });

const tagPreset = ['考勤制度', '薪酬福利', 'EVA中底', 'TPR大底', '价格政策', '异议处理', '新人培训', '采购合同'];

/* ---------- 列表 ---------- */
async function load() {
  loading.value = true;
  try {
    const res: any = await kbApi.page({ ...query });
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
    const res: any = await kbApi.overview();
    ov.value = res || {};
    categories.value = res?.categories || [];
  } catch {
    ov.value = {};
  }
}

async function loadAll() {
  await Promise.all([load(), loadOverview()]);
}

function pickCat(code: string) {
  query.category = code;
  reload();
}

function goUpload() {
  router.push('/kb/upload');
}

onMounted(async () => {
  loadAll();
  try {
    deptTree.value = (await deptApi.list()) as any;
    roles.value = (await roleApi.list()) as any;
  } catch {
    deptTree.value = [];
    roles.value = [];
  }
});

/* ---------- 详情 ---------- */
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<any>(null);

async function openDetail(row: any) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await kbApi.detail(row.id);
  } finally {
    detailLoading.value = false;
  }
}

/* ---------- 编辑 ---------- */
const editVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  id: 0,
  title: '',
  category: '',
  tag_list: [] as string[],
  perm_scope: 'all',
  perm_targets: [] as number[],
});

const rules = {
  title: [{ required: true, message: '请输入文档标题', trigger: 'blur' }],
  category: [{ required: true, message: '请选择所属分类', trigger: 'change' }],
};

function openEdit(row: any) {
  Object.assign(form, {
    id: row.id,
    title: row.title || '',
    category: row.category || '',
    tag_list: row.tag_list ? [...row.tag_list] : [],
    perm_scope: row.perm_scope || 'all',
    perm_targets: (row.perm_targets || []).map(Number).filter(Boolean),
  });
  editVisible.value = true;
}

async function submit() {
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;
  saving.value = true;
  try {
    await kbApi.update({
      id: form.id,
      title: form.title,
      category: form.category,
      tag_list: form.tag_list,
      perm_scope: form.perm_scope,
      // 后端按字符串比对部门ID / 角色ID，统一转成字符串数组
      perm_targets: form.perm_scope === 'all' ? [] : form.perm_targets.map(String),
    });
    ElMessage.success('保存成功');
    editVisible.value = false;
    loadAll();
  } finally {
    saving.value = false;
  }
}

/* ---------- 重新向量化 / 删除 ---------- */
async function doRevectorize(row: any) {
  vecLoading.value = row.id;
  try {
    const res: any = await kbApi.revectorize({ id: row.id });
    ElMessage.success(res?.msg || '已重新向量化');
    loadAll();
  } finally {
    vecLoading.value = null;
  }
}

function doRemove(row: any) {
  ElMessageBox.confirm(
    `确定删除文档「${row.title}」吗？删除后其知识片段与向量数据一并清除，AI 将不再引用该资料。`,
    '删除文档',
    { type: 'warning' },
  )
    .then(async () => {
      await kbApi.remove(row.id);
      ElMessage.success('已删除');
      if (list.value.length === 1 && query.page > 1) query.page -= 1;
      loadAll();
    })
    .catch(() => void 0);
}

/* ---------- 工具 ---------- */
function vecType(s: number) {
  return s === 1 ? 'success' : s === 2 ? 'danger' : 'warning';
}

function vecText(s: number) {
  return ['待向量化', '已完成', '失败'][s] || '待向量化';
}

function scopeText(s: string) {
  return s === 'dept' ? '指定部门可见' : s === 'role' ? '指定角色可见' : '全员可见';
}

function catName(code: string) {
  return categories.value.find((c) => c.code === code)?.name || code;
}

function fmtSize(v: any) {
  const n = Number(v || 0);
  if (!n) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.cat-card {
  border: 1px solid var(--fae-border);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;

  .cn {
    font-size: 13px;
    color: var(--fae-text-sub);
  }

  .cc {
    font-size: 20px;
    font-weight: 600;
    margin-top: 2px;
  }

  &:hover {
    border-color: var(--fae-primary);
  }

  &.active {
    border-color: var(--fae-primary);
    background: var(--fae-primary-light);

    .cn,
    .cc {
      color: var(--fae-primary);
    }
  }
}

.doc-cell {
  display: flex;
  flex-direction: column;
  line-height: 1.6;

  span {
    font-size: 12px;
  }
}

.mr-4 {
  margin-right: 4px;
}

.tiny {
  font-size: 11px;
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.chunk-card {
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.ck-head {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-bottom: 6px;
}

.ck-body {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
