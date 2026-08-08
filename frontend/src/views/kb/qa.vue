<template>
  <div class="page qa-page">
    <div class="qa-main page-card">
      <h3 class="page-title">
        知识库问答
        <span v-if="provider" class="ai-tag">{{ providerText }}</span>
        <div class="flex-1"></div>
        <el-button link type="primary" size="small" :icon="Delete" @click="clearChat">清空对话</el-button>
      </h3>
      <p class="page-desc">
        问制度、问产品参数、问报价口径，AI 只依据企业已上传的资料作答并附上出处，不用再翻文件夹或反复问同事
      </p>

      <div ref="scrollRef" class="chat-box">
        <div v-if="!messages.length" class="welcome">
          <div class="w-title">你好，{{ realName }}</div>
          <div class="w-sub">
            我已经读过企业知识库里的制度、产品资料、销售话术、培训材料与合同文档，直接提问即可
          </div>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="avatar">{{ m.role === 'user' ? '我' : 'AI' }}</div>
          <div class="bubble-wrap">
            <div class="bubble">{{ m.content }}</div>

            <div v-if="m.role === 'ai' && m.refs?.length" class="refs">
              <div class="refs-title">参考资料 {{ m.refs.length }} 条</div>
              <div v-for="(r, ri) in m.refs" :key="ri" class="ref-card" @click="openDoc(r)">
                <div class="rc-head">
                  <b>{{ r.title }}</b>
                  <el-tag v-if="r.category_name" size="small" effect="plain">{{ r.category_name }}</el-tag>
                  <span v-if="r.score !== undefined && r.score !== null" class="rc-score">
                    相关度 {{ scorePct(r.score) }}
                  </span>
                </div>
                <div v-if="r.snippet" class="rc-snippet">{{ r.snippet }}</div>
              </div>
            </div>

            <div v-if="m.role === 'ai' && m.fallback" class="fallback-tip">
              注：{{ m.fallback }}，当前为规则引擎输出
            </div>
          </div>
        </div>

        <div v-if="sending" class="msg ai">
          <div class="avatar">AI</div>
          <div class="bubble-wrap">
            <div class="bubble thinking">正在检索企业知识库并组织答案</div>
          </div>
        </div>
      </div>

      <div class="input-box">
        <el-input
          v-model="question"
          type="textarea"
          :rows="3"
          resize="none"
          placeholder="请输入问题，Enter 发送，Shift + Enter 换行"
          @keydown.enter.exact.prevent="send()"
        />
        <div class="ib-foot">
          <span class="text-sub tiny">回答严格基于企业已上传资料，检索不到时会如实告知，不会编造</span>
          <el-button type="primary" :icon="Promotion" :loading="sending" @click="send()">发送</el-button>
        </div>
      </div>
    </div>

    <div class="qa-side">
      <div class="page-card">
        <h3 class="page-title">知识库概览</h3>
        <p class="page-desc">当前可被检索的资料分布</p>
        <div v-for="c in categories" :key="c.code" class="cat-row">
          <span>{{ c.name }}</span>
          <b>{{ c.count ?? 0 }}</b>
        </div>
        <div class="cat-row total">
          <span>文档总数 / 知识片段</span>
          <b>{{ ov.doc_total ?? 0 }} / {{ ov.chunk_total ?? 0 }}</b>
        </div>
        <div v-if="ov.pending_total" class="text-warning tiny mt-8">
          还有 {{ ov.pending_total }} 份文档未完成向量化，暂时无法被检索
        </div>
      </div>

      <el-tabs v-model="sideTab" class="side-tabs">
        <el-tab-pane label="推荐问题" name="sug">
          <div class="page-card" style="margin-top:0">
            <p class="page-desc">点击直接提问</p>
            <div v-for="q in suggestions" :key="q" class="sug" @click="send(q)">{{ q }}</div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="会话历史" name="hist">
          <div class="page-card" style="margin-top:0; padding:0">
            <div v-loading="histLoading" class="hist-list">
              <div v-if="!histList.length" class="empty-tip" style="padding:20px 0">暂无历史会话</div>
              <div
                v-for="h in histList"
                :key="h.id"
                class="hist-item"
                @click="restoreSession(h)"
                :title="h.question"
              >
                <div class="hist-q" :class="{ bold: !h._read }">{{ h.question }}</div>
                <div class="hist-time text-sub tiny">{{ fmt(h.created_at) }}</div>
              </div>
            </div>
            <div class="hist-pager">
              <el-pagination
                v-model:current-page="histPage"
                v-model:page-size="histSize"
                :total="histTotal"
                :page-sizes="[10, 20]"
                layout="total, prev, pager, next"
                small
                @current-change="loadHistory"
                @size-change="loadHistory"
              />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <div class="page-card">
        <h3 class="page-title">使用说明</h3>
        <ul class="tip-list">
          <li>回答只来自企业已上传并完成向量化的资料，没有相关资料时会明确告知</li>
          <li>每条回答都会列出引用的文档，点击可查看原文，重要口径请以原文为准</li>
          <li>问题写具体一些，例如把「价格」换成「EVA 中底料 2026 年一级代理价格政策」</li>
          <li>没有权限的文档不会进入检索，因此不同岗位得到的答案范围可能不同</li>
        </ul>
      </div>
    </div>

    <!-- 参考资料原文 -->
    <el-drawer v-model="docVisible" title="资料原文" size="620px">
      <div v-loading="docLoading">
        <template v-if="doc">
          <h3 class="d-name">{{ doc.title }}</h3>
          <p class="text-sub">{{ doc.file_name || '-' }}</p>
          <el-descriptions :column="2" border size="small" class="mt-12">
            <el-descriptions-item label="知识片段">{{ doc.chunk_count || 0 }} 段</el-descriptions-item>
            <el-descriptions-item label="上传时间">{{ fmt(doc.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="标签" :span="2">
              <el-tag v-for="t in doc.tag_list" :key="t" size="small" effect="plain" class="mr-4">{{ t }}</el-tag>
              <span v-if="!doc.tag_list?.length" class="text-sub">-</span>
            </el-descriptions-item>
          </el-descriptions>
          <h4 class="sec-title mt-16">AI 摘要</h4>
          <div class="ai-box">{{ doc.summary || '该文档暂未生成摘要' }}</div>
          <h4 class="sec-title mt-16">正文内容</h4>
          <div class="doc-content">{{ String(doc.content || '').slice(0, 5000) || '暂无正文' }}</div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Delete, Promotion } from '@element-plus/icons-vue';
import { kbApi } from '../../api';
import { useUserStore } from '../../store/user';

interface RefItem {
  doc_id?: number;
  title: string;
  category_name?: string;
  score?: number;
  snippet?: string;
}

interface Msg {
  role: 'user' | 'ai';
  content: string;
  refs?: RefItem[];
  fallback?: string;
}

const store = useUserStore();
const realName = computed(() => store.realName);

const question = ref('');
const sending = ref(false);
const messages = ref<Msg[]>([]);
const scrollRef = ref<HTMLElement>();
const ov = ref<any>({});
const categories = ref<any[]>([]);
const provider = ref('');
const sideTab = ref('sug');
const histList = ref<any[]>([]);
const histLoading = ref(false);
const histPage = ref(1);
const histSize = ref(10);
const histTotal = ref(0);

const providerText = computed(() => (provider.value === 'mock' ? '规则引擎' : 'OpenClaw'));

const suggestions = [
  '公司的考勤制度是怎么规定的',
  '客户说价格太贵了怎么回应',
  'EVA 中底料有哪些技术参数',
  '新客户首单的账期和付款方式怎么谈',
  '采购合同里质量异议的处理时限是多久',
  '新入职销售第一周要完成哪些培训',
];

async function send(preset?: string) {
  const q = (preset ?? question.value).trim();
  if (!q) return ElMessage.warning('请输入问题');
  if (sending.value) return;

  messages.value.push({ role: 'user', content: q });
  question.value = '';
  sending.value = true;
  scrollToBottom();

  try {
    const res: any = await kbApi.qa({ question: q, top_k: 3 });
    // 后端返回字段为 ref_docs，兼容 refs 命名
    const refs: RefItem[] = res.ref_docs || res.refs || [];
    provider.value = res.provider || '';
    messages.value.push({
      role: 'ai',
      content: res.answer || '未获取到回答内容',
      refs,
      fallback: res.fallback_reason || '',
    });
  } catch {
    messages.value.push({ role: 'ai', content: '回答生成失败，请稍后重试或换个问法。' });
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

function clearChat() {
  messages.value = [];
  provider.value = '';
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

/* ---------- 参考资料原文 ---------- */
const docVisible = ref(false);
const docLoading = ref(false);
const doc = ref<any>(null);

async function openDoc(r: RefItem) {
  if (!r.doc_id) return ElMessage.warning('该条参考资料未关联文档');
  docVisible.value = true;
  docLoading.value = true;
  doc.value = null;
  try {
    doc.value = await kbApi.detail(r.doc_id);
  } finally {
    docLoading.value = false;
  }
}

onMounted(async () => {
  try {
    const res: any = await kbApi.overview();
    ov.value = res || {};
    categories.value = res?.categories || [];
  } catch {
    ov.value = {};
  }
  loadHistory();
});

async function loadHistory() {
  histLoading.value = true;
  try {
    const res: any = await kbApi.chatHistory({ page: histPage.value, size: histSize.value });
    histList.value = (res.list || []).map((h: any) => ({ ...h, _read: false }));
    histTotal.value = res.total || 0;
  } catch {
    histList.value = [];
    histTotal.value = 0;
  } finally {
    histLoading.value = false;
  }
}

function restoreSession(h: any) {
  // 将历史会话的问答恢复到当前对话，并滚动到底部
  messages.value.push({ role: 'user', content: h.question });
  messages.value.push({
    role: 'ai',
    content: h.answer || '该条历史会话无回答记录',
    refs: [],
  });
  sideTab.value = 'sug';
  nextTick(scrollToBottom);
}

/* ---------- 工具 ---------- */
function scorePct(s: any) {
  const n = Number(s || 0);
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
}

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.qa-page {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.qa-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 92px);
}

.qa-side {
  width: 320px;
  flex-shrink: 0;

  .page-card + .page-card {
    margin-top: 14px;
  }
}

.chat-box {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 8px;
  border-top: 1px solid var(--fae-border);
}

.welcome {
  padding: 40px 20px;
  text-align: center;

  .w-title {
    font-size: 18px;
    font-weight: 600;
  }

  .w-sub {
    font-size: 13px;
    color: var(--fae-text-sub);
    margin-top: 8px;
    line-height: 1.9;
  }
}

.msg {
  display: flex;
  gap: 10px;
  margin: 14px 0;

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #fff;
    background: var(--fae-primary);
  }

  .bubble-wrap {
    max-width: 78%;
  }

  .bubble {
    background: #f4f6fa;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.9;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &.user {
    flex-direction: row-reverse;

    .avatar {
      background: #64748b;
    }

    .bubble {
      background: var(--fae-primary);
      color: #fff;
    }
  }
}

.thinking {
  color: var(--fae-text-sub);
}

.refs {
  margin-top: 8px;
}

.refs-title {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-bottom: 6px;
}

.ref-card {
  border: 1px solid #dbe7ff;
  background: #f8fbff;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--fae-primary);
  }
}

.rc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.rc-score {
  font-size: 12px;
  color: var(--fae-primary);
  margin-left: auto;
}

.rc-snippet {
  font-size: 12px;
  color: var(--fae-text-sub);
  line-height: 1.8;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fallback-tip {
  font-size: 12px;
  color: var(--fae-text-sub);
  margin-top: 6px;
}

.input-box {
  border-top: 1px solid var(--fae-border);
  padding-top: 10px;
}

.ib-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.cat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--fae-border);

  &.total {
    border-bottom: none;
    color: var(--fae-primary);
  }
}

.sug {
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fafbfc;
  margin-bottom: 8px;
  cursor: pointer;
  line-height: 1.7;
  transition: all 0.15s;

  &:hover {
    background: var(--fae-primary-light);
    color: var(--fae-primary);
  }
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 2;
}

/* ---------- 侧边栏 Tabs 样式 ---------- */
.side-tabs {
  :deep(.el-tabs__header) {
    margin: 0 0 12px;
  }
}

.hist-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

.hist-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--fae-border);
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--fae-primary-light);
  }

  .hist-q {
    font-size: 13px;
    line-height: 1.7;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;

    &.bold {
      font-weight: 600;
    }
  }

  .hist-time {
    margin-top: 4px;
  }
}

.hist-pager {
  padding: 8px 4px 4px;
  border-top: 1px solid var(--fae-border);
}

.tiny {
  font-size: 11px;
}

.mr-4 {
  margin-right: 4px;
}

.d-name {
  margin: 0 0 2px;
  font-size: 18px;
}

.sec-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.doc-content {
  background: #fafbfc;
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1200px) {
  .qa-page {
    flex-direction: column;
  }

  .qa-side {
    width: 100%;
  }

  .qa-main {
    width: 100%;
    height: 70vh;
  }
}
</style>
