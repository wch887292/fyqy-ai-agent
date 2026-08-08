<template>
  <el-drawer
    :model-value="modelValue"
    title="企业AI助手"
    size="480px"
    direction="rtl"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <template #header>
      <div class="drawer-head">
        <span class="t">企业AI助手</span>
        <span class="d">基于企业知识库作答，答案可溯源到具体文档</span>
      </div>
    </template>

    <div class="chat-wrap">
      <div ref="listRef" class="chat-list">
        <div v-if="!messages.length" class="welcome">
          <p class="w-title">您好，{{ realName }}，我可以帮您：</p>
          <div class="quick-list">
            <div v-for="q in quickList" :key="q" class="quick-item" @click="send(q)">{{ q }}</div>
          </div>
          <p class="w-tip">
            当前{{ llmTip }}。回答严格基于企业已上传的知识库资料，无相关资料时会如实告知。
          </p>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble">
            <div class="content">{{ m.content }}</div>
            <div v-if="m.refs && m.refs.length" class="refs">
              <div class="refs-title">参考资料</div>
              <div v-for="(r, ri) in m.refs" :key="ri" class="ref-item">
                <div class="ref-head">
                  <el-tag size="small" type="info" effect="plain">{{ r.category_name || '资料' }}</el-tag>
                  <span class="ref-title">{{ r.title }}</span>
                  <span v-if="r.score !== undefined && r.score !== null" class="ref-score">
                    相关度 {{ Math.round(Number(r.score) * 100) }}%
                  </span>
                </div>
                <div v-if="r.snippet" class="ref-snippet">{{ r.snippet }}</div>
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
          <el-button type="primary" :loading="loading" @click="send()">发送</el-button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { Loading } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { aiApi, systemApi } from '../api';
import { useUserStore } from '../store/user';

interface RefItem {
  doc_id?: number;
  title: string;
  snippet?: string;
  category_name?: string;
  score?: number;
}
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  refs?: RefItem[];
}

defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>();

const store = useUserStore();
const realName = computed(() => store.realName);

const messages = ref<Msg[]>([]);
const question = ref('');
const loading = ref(false);
const listRef = ref<HTMLElement>();
const llmReady = ref<boolean | null>(null);

const llmTip = computed(() =>
  llmReady.value ? '已接入 OpenClaw 大模型' : '运行于规则引擎兜底模式（可在系统设置接入大模型）',
);

const quickList = [
  '公司的考勤制度是怎么规定的？',
  '客户说价格太贵了，我该怎么回应？',
  '我们的 EVA 中底料有哪些技术参数？',
  '新客户第一次拜访，开场应该怎么讲？',
];

onMounted(async () => {
  try {
    const info: any = await systemApi.info();
    llmReady.value = !!info.llm_ready;
  } catch {
    llmReady.value = null;
  }
});

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
      // 后端 ai/chat 返回字段为 ref_docs，其余为兼容命名
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
</script>

<style scoped lang="scss">
.drawer-head {
  .t {
    font-size: 16px;
    font-weight: 600;
  }
  .d {
    display: block;
    font-size: 12px;
    color: var(--fae-text-sub);
    margin-top: 2px;
  }
}

.chat-wrap {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
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
    font-size: 12px;
    margin-bottom: 8px;
  }

  .ref-head {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .ref-snippet {
    margin-top: 3px;
    padding-left: 2px;
    color: var(--fae-text-sub);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
</style>
