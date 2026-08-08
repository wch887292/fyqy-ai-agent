<template>
  <div class="page">
    <el-row :gutter="14">
      <!-- 左：上传与信息填写 -->
      <el-col :xs="24" :lg="15">
        <div class="page-card">
          <h3 class="page-title">文档上传导入</h3>
          <p class="page-desc">
            把制度、产品参数表、话术手册、合同模板导入对应知识库；系统自动解析正文、生成摘要标签并切片向量化，之后员工在问答页就能直接查到原文口径
          </p>

          <el-upload
            ref="uploadRef"
            class="up-area"
            drag
            action="#"
            :auto-upload="false"
            :limit="1"
            :accept="accept"
            :file-list="fileList"
            :on-change="onFileChange"
            :on-remove="onFileRemove"
            :on-exceed="onExceed"
          >
            <el-icon class="up-icon"><UploadFilled /></el-icon>
            <div class="up-text">将文件拖到此处，或<em>点击选择文件</em></div>
            <template #tip>
              <div class="up-tip">
                支持 {{ accept.replace(/\./g, '').toUpperCase().split(',').join(' / ') }}，单个文件不超过 50MB；
                扫描件类 PDF 无法提取文字，请上传可复制文字的版本
              </div>
            </template>
          </el-upload>

          <div v-if="picked" class="file-card mt-12">
            <div class="fc-left">
              <el-icon class="fc-icon"><Document /></el-icon>
              <div>
                <div class="fc-name">{{ picked.name }}</div>
                <div class="text-sub tiny">{{ fmtSize(picked.size) }}</div>
              </div>
            </div>
            <el-button link type="danger" size="small" @click="clearFile">移除</el-button>
          </div>

          <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" class="mt-16">
            <el-form-item label="所属知识库" prop="category">
              <el-select v-model="form.category" placeholder="请选择文档归属的知识库" style="width: 100%">
                <el-option v-for="c in categories" :key="c.code" :label="c.name" :value="c.code" />
              </el-select>
            </el-form-item>
            <el-form-item label="文档标题" prop="title">
              <el-input v-model="form.title" placeholder="默认取文件名，建议写清适用范围与年份" maxlength="120" />
            </el-form-item>
            <el-form-item label="文档标签">
              <el-select
                v-model="form.tag_list"
                multiple
                filterable
                allow-create
                default-first-option
                placeholder="可自定义输入后回车，AI 还会自动补充标签"
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
              <div class="text-sub tiny mt-8">
                权限同时作用于文档列表与 AI 问答，无权限的员工提问时不会检索到该资料
              </div>
            </el-form-item>
            <el-form-item v-if="form.perm_scope === 'dept'" label="可见部门" prop="perm_targets">
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
            <el-form-item v-if="form.perm_scope === 'role'" label="可见角色" prop="perm_targets">
              <el-select v-model="form.perm_targets" multiple placeholder="选择可查看该文档的角色" style="width: 100%">
                <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="uploading" @click="submit">
                {{ uploading ? '解析并向量化中' : '上传并向量化' }}
              </el-button>
              <el-button @click="resetForm">重置</el-button>
              <el-button link type="primary" @click="goDoc">前往文档列表</el-button>
            </el-form-item>
          </el-form>

          <div v-if="result" class="ai-box mt-8">
            <b>上传完成</b><br />
            文档《{{ result.title }}》已入库，切分 {{ result.chunk_count || 0 }} 个知识片段。<br />
            AI 摘要：{{ result.summary || '未生成' }}<br />
            <span v-if="result.embedding_msg">向量化结果：{{ result.embedding_msg }}</span>
          </div>
        </div>
      </el-col>

      <!-- 右：须知与最近上传 -->
      <el-col :xs="24" :lg="9">
        <div class="page-card">
          <h3 class="page-title">上传须知</h3>
          <p class="page-desc">按规范上传，AI 回答的准确度会明显提升</p>
          <ul class="tip-list">
            <li>一份文件只放一个主题，制度与产品参数不要混在同一个文档里</li>
            <li>标题写明适用范围与版本，如「EVA 中底料技术参数表 2026 版」，便于检索命中</li>
            <li>表格类资料建议用 XLSX / CSV 上传，行列结构能被更完整地解析</li>
            <li>作废的旧版本请到文档列表删除，避免 AI 引用过期口径</li>
            <li>含报价、返点等敏感内容的资料，务必设置为指定部门或指定角色可见</li>
          </ul>
        </div>

        <div class="page-card">
          <h3 class="page-title">向量化说明</h3>
          <p class="page-desc">上传后系统自动完成的处理链路</p>
          <el-steps direction="vertical" :active="4" size="small">
            <el-step title="正文解析" description="按格式提取纯文本，无法提取文字的扫描件会被拒绝" />
            <el-step title="AI 打标与摘要" description="自动生成摘要与标签，与手填标签合并" />
            <el-step title="切片向量化" description="长文按语义切成片段并写入向量库" />
            <el-step title="可被问答检索" description="状态变为「已完成」后即可在知识库问答中被引用" />
          </el-steps>
          <div class="text-sub tiny mt-8">
            若状态为「失败」，可在文档列表点击「重新向量化」重试
          </div>
        </div>

        <div class="page-card">
          <h3 class="page-title">最近上传</h3>
          <p class="page-desc">最新 5 条入库记录</p>
          <div v-loading="recentLoading">
            <div v-if="!recent.length" class="empty-tip">暂无上传记录</div>
            <div v-for="d in recent" :key="d.id" class="recent-item" @click="goDoc">
              <div class="ri-main">
                <b>{{ d.title }}</b>
                <el-tag :type="vecType(d.vector_status)" size="small" effect="dark">
                  {{ d.vector_status_text }}
                </el-tag>
              </div>
              <div class="ri-side text-sub">
                {{ d.category_name }} · {{ d.chunk_count || 0 }} 片段 · {{ d.created_by_name || '-' }} ·
                {{ fmt(d.created_at) }}
              </div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, FormInstance } from 'element-plus';
import { Document, UploadFilled } from '@element-plus/icons-vue';
import { deptApi, kbApi, roleApi } from '../../api';

const router = useRouter();

const accept = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.md';
const MAX_SIZE = 50 * 1024 * 1024;

const uploadRef = ref<any>();
const formRef = ref<FormInstance>();
const uploading = ref(false);
const recentLoading = ref(false);
const fileList = ref<any[]>([]);
const picked = ref<File | null>(null);
const result = ref<any>(null);
const categories = ref<any[]>([]);
const deptTree = ref<any[]>([]);
const roles = ref<any[]>([]);
const recent = ref<any[]>([]);

const tagPreset = ['考勤制度', '薪酬福利', 'EVA中底', 'TPR大底', '价格政策', '异议处理', '新人培训', '采购合同'];

const form = reactive<any>({
  category: '',
  title: '',
  tag_list: [] as string[],
  perm_scope: 'all',
  perm_targets: [] as number[],
});

const rules = {
  category: [{ required: true, message: '请选择所属知识库', trigger: 'change' }],
  title: [{ required: true, message: '请输入文档标题', trigger: 'blur' }],
  perm_targets: [{ required: true, message: '请选择可见范围', trigger: 'change' }],
};

/* ---------- 文件选择 ---------- */
function onFileChange(file: any) {
  const raw: File = file.raw;
  if (!raw) return;
  const ext = raw.name.slice(raw.name.lastIndexOf('.')).toLowerCase();
  if (!accept.split(',').includes(ext)) {
    ElMessage.warning(`暂不支持 ${ext} 格式`);
    clearFile();
    return;
  }
  if (raw.size > MAX_SIZE) {
    ElMessage.warning('单个文件不能超过 50MB');
    clearFile();
    return;
  }
  picked.value = raw;
  fileList.value = [file];
  if (!form.title) form.title = raw.name.replace(/\.[^.]+$/, '');
}

function onFileRemove() {
  picked.value = null;
  fileList.value = [];
}

function onExceed(files: File[]) {
  uploadRef.value?.clearFiles();
  const f = files[0] as any;
  uploadRef.value?.handleStart(f);
  onFileChange({ raw: f, name: f.name, size: f.size });
}

function clearFile() {
  picked.value = null;
  fileList.value = [];
  uploadRef.value?.clearFiles();
}

/* ---------- 提交 ---------- */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:.*?;base64,/, ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function submit() {
  if (!picked.value) return ElMessage.warning('请先选择要上传的文件');
  const ok = await formRef.value?.validate().catch(() => false);
  if (!ok) return;

  uploading.value = true;
  try {
    const b64 = await toBase64(picked.value);
    // 后端 upload 接收 JSON：file_name + file_base64，标签为逗号分隔字符串
    const res: any = await kbApi.upload({
      file_name: picked.value.name,
      file_base64: b64,
      category: form.category,
      title: form.title,
      tag_list: form.tag_list.join(','),
      perm_scope: form.perm_scope,
      perm_targets: form.perm_scope === 'all' ? [] : form.perm_targets.map(String),
    });
    result.value = res;
    ElMessage.success('上传成功，已完成解析与向量化');
    clearFile();
    loadRecent();
  } finally {
    uploading.value = false;
  }
}

function resetForm() {
  formRef.value?.resetFields();
  Object.assign(form, { category: '', title: '', tag_list: [], perm_scope: 'all', perm_targets: [] });
  result.value = null;
  clearFile();
}

function goDoc() {
  router.push('/kb/doc');
}

/* ---------- 最近上传 ---------- */
async function loadRecent() {
  recentLoading.value = true;
  try {
    const res: any = await kbApi.page({ page: 1, size: 5 });
    recent.value = res.list || [];
  } finally {
    recentLoading.value = false;
  }
}

onMounted(async () => {
  loadRecent();
  try {
    categories.value = (await kbApi.categories()) as any;
  } catch {
    categories.value = [];
  }
  try {
    deptTree.value = (await deptApi.list()) as any;
    roles.value = (await roleApi.list()) as any;
  } catch {
    deptTree.value = [];
    roles.value = [];
  }
});

/* ---------- 工具 ---------- */
function vecType(s: number) {
  return s === 1 ? 'success' : s === 2 ? 'danger' : 'warning';
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
.up-area {
  :deep(.el-upload-dragger) {
    padding: 28px 20px;
  }
}

.up-icon {
  font-size: 44px;
  color: var(--fae-primary);
}

.up-text {
  font-size: 14px;
  color: var(--fae-text-sub);
  margin-top: 8px;

  em {
    color: var(--fae-primary);
    font-style: normal;
  }
}

.up-tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-top: 8px;
  line-height: 1.7;
}

.file-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafbfc;
  border-radius: 8px;
  padding: 10px 12px;
}

.fc-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fc-icon {
  font-size: 22px;
  color: var(--fae-primary);
}

.fc-name {
  font-size: 13px;
  font-weight: 600;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 2;
  color: var(--fae-text);
}

.recent-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: #fafbfc;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--fae-primary-light);
  }
}

.ri-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;

  b {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.ri-side {
  font-size: 12px;
  margin-top: 4px;
}

.tiny {
  font-size: 11px;
}
</style>
