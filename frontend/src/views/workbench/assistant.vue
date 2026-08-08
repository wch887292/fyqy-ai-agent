<template>
  <div class="page ai-page">
    <div class="assistant-layout">
      <!-- 左：对话区 -->
      <div class="chat-panel page-card">
        <div class="chat-head">
          <h3 class="page-title">企业 AI 助手</h3>
          <span class="text-sub">基于晋江华祥鞋材知识库作答，答案可溯源到具体资料</span>
        </div>

        <div ref="listRef" class="chat-list">
          <div v-if="!messages.length" class="welcome">
            <p class="w-title">{{ realName }}，您好，我可以为华祥鞋材解答：</p>
            <div class="quick-list">
              <div v-for="q in quickList" :key="q" class="quick-item" @click="send(q)">{{ q }}</div>
            </div>
            <p class="w-tip">当前{{ llmTip }}。回答严格基于企业已上传的知识库资料，无相关资料时会如实告知。</p>
          </div>

          <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
            <div class="bubble">
              <div class="content">{{ m.content }}</div>
              <div v-if="m.refs && m.refs.length" class="refs">
                <div class="refs-title">参考资料</div>
                <div v-for="(r, ri) in m.refs" :key="ri" class="ref-item">
                  <el-tag size="small" type="info" effect="plain">{{ r.category_name || '资料' }}</el-tag>
                  <span class="ref-title">{{ r.title }}</span>
                  <span class="ref-score">相关度 {{ Math.round((r.score || 0) * 100) }}%</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="loading" class="msg assistant">
            <div class="bubble">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span class="ml-6">正在检索企业知识库…</span>
            </div>
          </div>
        </div>

        <div class="chat-input">
          <el-input
            v-model="question"
            type="textarea"
            :rows="3"
            resize="none"
            placeholder="请输入问题，Enter 发送 / Shift+Enter 换行"
            @keydown.enter.exact.prevent="send()"
          />
          <div class="input-bar">
            <el-button link size="small" @click="clear">清空对话</el-button>
            <el-button type="primary" :loading="loading" :icon="Promotion" @click="send()">发送</el-button>
          </div>
        </div>
      </div>

      <!-- 右：信息栏 -->
      <div class="side-panel">
        <div class="page-card side-card">
          <div class="status-dot" :class="statusClass"></div>
          <div class="status-main">
            <b>AI 引擎</b>
            <span class="text-sub">{{ llmTip }}</span>
          </div>
        </div>

        <div class="page-card side-card">
          <h4 class="side-title">能力说明</h4>
          <ul class="cap-list">
            <li>鞋材产品参数咨询（EVA 中底料、飞织鞋面、橡胶大底）</li>
            <li>客户跟进话术与异议处理建议</li>
            <li>订单风险与库存预警解读</li>
            <li>企业制度、流程知识问答</li>
          </ul>
        </div>

        <div class="page-card side-card">
          <h4 class="side-title">推荐问题</h4>
          <div class="rec-list">
            <div v-for="q in quickList" :key="q" class="rec-item" @click="send(q)">{{ q }}</div>
          </div>
        </div>

        <div class="page-card side-card">
          <h4 class="side-title">
            历史对话
            <el-button link size="small" :loading="histLoading" @click="loadHistory">刷新</el-button>
          </h4>
          <div v-if="!history.length" class="text-sub side-empty">暂无历史对话</div>
          <div
            v-for="h in history"
            :key="h.id"
            class="hist-item"
            @click="send(h.question)"
          >
            <div class="hist-q">{{ h.question }}</div>
            <div class="hist-time text-sub">{{ fmt(h.created_at) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { Loading, Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { aiApi, systemApi } from '../../api';
import { useUserStore } from '../../store/user';

const store = useUserStore();
const realName = computed(() => store.realName || '用户');

interface RefItem {
  title: string;
  category_name?: string;
  score?: number;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  refs?: RefItem[];
}

const messages = ref<Msg[]>([]);
const question = ref('');
const loading = ref(false);
const listRef = ref<HTMLElement>();
const llmReady = ref<boolean | null>(null);

const history = ref<any[]>([]);
const histLoading = ref(false);

const llmTip = computed(() =>
  llmReady.value ? '已接入 OpenClaw 大模型' : '运行于规则引擎兜底模式（可在系统设置接入大模型）',
);
const statusClass = computed(() => (llmReady.value ? 'on' : 'off'));

const quickList = [
  '公司的考勤制度是怎么规定的？',
  '客户说 EVA 中底料价格太贵了，我该怎么回应？',
  '我们的飞织鞋面有哪些规格和起订量？',
  '新客户第一次拜访，开场应该怎么讲？',
];

function fmt(v: any) {
  if (!v) return '';
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function send(text?: string) {
  const q = (text ?? question.value).trim();
  if (!q) return ElMessage.warning('请输入问题');
  if (loading.value) return;

  messages.value.push({ role: 'user', content: q });
  question.value = '';
  loading.value = true;
  await scrollBottom();

  try {
    const res: any = await aiApi.chat({ question: q });
    messages.value.push({
      role: 'assistant',
      content: res.answer || '暂无可用回答',
      refs: res.ref_docs || res.refs || res.references || [],
    });
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: `请求失败：${e?.message || '未知错误'}` });
  } finally {
    loading.value = false;
    await scrollBottom();
  }
}

function clear() {
  messages.value = [];
}

async function scrollBottom() {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
}

async function loadHistory() {
  histLoading.value = true;
  try {
    // 后端 history 实际参数为 limit（非 page/size）
    const res: any = await aiApi.history({ limit: 20 });
    history.value = Array.isArray(res) ? res : res?.list || [];
  } catch (e: any) {
    history.value = [];
  } finally {
    histLoading.value = false;
  }
}

onMounted(async () => {
  try {
    const info: any = await systemApi.info();
    llmReady.value = !!info.llm_ready;
  } catch {
    llmReady.value = null;
  }
  loadHistory();
});
</script>

<style scoped lang="scss">
.ai-page {
  height: 100%;
}

.assistant-layout {
  display: flex;
  gap: 14px;
  height: calc(100vh - 120px);
  min-height: 520px;
}

.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-head {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--fae-border);

  .page-title {
    margin-bottom: 2px;
  }
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 4px;
}

.welcome {
  .w-title {
    font-size: 14px;
    color: var(--fae-text);
    margin: 4px 0 12px;
  }

  .quick-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .quick-item {
    background: #f6f8fc;
    border: 1px solid var(--fae-border);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: var(--fae-primary);
      color: var(--fae-primary);
      background: var(--fae-primary-light);
    }
  }

  .w-tip {
    font-size: 12px;
    color: var(--fae-text-sub);
    line-height: 1.7;
    margin-top: 16px;
  }
}

.msg {
  margin-bottom: 14px;
  display: flex;

  &.user {
    justify-content: flex-end;

    .bubble {
      background: var(--fae-primary);
      color: #fff;
      border-radius: 10px 10px 2px 10px;
    }
  }

  &.assistant .bubble {
    background: #f6f8fc;
    border: 1px solid var(--fae-border);
    border-radius: 10px 10px 10px 2px;
  }
}

.bubble {
  max-width: 88%;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.8;

  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.refs {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #d8dee9;

  .refs-title {
    font-size: 12px;
    color: var(--fae-text-sub);
    margin-bottom: 6px;
  }

  .ref-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    margin-bottom: 4px;
  }

  .ref-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ref-score {
    color: var(--fae-text-sub);
    flex-shrink: 0;
  }
}

.chat-input {
  border-top: 1px solid var(--fae-border);
  padding-top: 12px;
  flex-shrink: 0;
}

.input-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.ml-6 {
  margin-left: 6px;
}

.side-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.side-card {
  padding: 14px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;

  &.on {
    background: #67c23a;
  }

  &.off {
    background: #e6a23c;
  }
}

.status-main {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;

  .text-sub {
    font-size: 12px;
  }
}

.side-title {
  font-size: 14px;
  margin: 0 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cap-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--fae-text);
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rec-item {
  background: #f6f8fc;
  border: 1px solid var(--fae-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--fae-primary);
    color: var(--fae-primary);
  }
}

.side-empty {
  font-size: 12px;
}

.hist-item {
  padding: 8px 0;
  border-top: 1px dashed var(--fae-border);
  cursor: pointer;

  &:hover .hist-q {
    color: var(--fae-primary);
  }
}

.hist-q {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hist-time {
  font-size: 11px;
  margin-top: 2px;
}
</style>
