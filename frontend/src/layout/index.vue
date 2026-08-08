<template>
  <el-container class="app-layout">
    <!-- 侧边菜单：完全由后端下发的 menus 渲染 -->
    <el-aside :width="collapse ? '64px' : '220px'" class="aside">
      <div class="logo">
        <span class="logo-mark">飞</span>
        <span v-show="!collapse" class="logo-text">飞虹智 · 企业AI</span>
      </div>
      <el-scrollbar class="menu-scroll">
        <el-menu
          :default-active="activePath"
          :collapse="collapse"
          :collapse-transition="false"
          router
          unique-opened
          background-color="#1f2a3d"
          text-color="#c4ccd8"
          active-text-color="#fff"
        >
          <template v-for="m in menus" :key="m.code">
            <el-sub-menu v-if="m.children && m.children.length" :index="m.path">
              <template #title>
                <el-icon><component :is="m.icon || 'Menu'" /></el-icon>
                <span>{{ m.name }}</span>
              </template>
              <el-menu-item v-for="c in m.children" :key="c.code" :index="c.path">
                {{ c.name }}
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="m.path">
              <el-icon><component :is="m.icon || 'Menu'" /></el-icon>
              <template #title>{{ m.name }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="collapse = !collapse">
            <component :is="collapse ? 'Expand' : 'Fold'" />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ enterpriseName }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <el-tag v-if="llmReady === false" type="warning" size="small" effect="plain">
            规则引擎模式（未接大模型）
          </el-tag>
          <el-tag v-else-if="llmReady === true" type="success" size="small" effect="plain">
            大模型已接入
          </el-tag>

          <el-button
            v-if="canUseAssistant"
            link
            type="primary"
            :icon="ChatDotRound"
            @click="assistantVisible = true"
          >
            AI助手
          </el-button>

          <!-- V2.0 站内消息铃铛：全局可见，无需菜单权限 -->
          <el-badge
            :value="unreadBadge > 0 ? unreadBadge : ''"
            :max="99"
            class="notice-badge"
            :hidden="!store.token"
          >
            <el-button
              link
              :icon="Bell"
              @click="router.push('/notice/index')"
              :title="`消息中心（${unreadBadge} 未读）`"
            />
          </el-badge>

          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="28" class="avatar">{{ avatarText }}</el-avatar>
              <span class="uname">{{ realName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  {{ profile?.post || '员工' }} · {{ profile?.dept_name || '-' }}
                </el-dropdown-item>
                <el-dropdown-item divided command="pwd">修改密码</el-dropdown-item>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view v-slot="{ Component }">
          <keep-alive :max="8">
            <component :is="Component" :key="route.fullPath" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>

    <!-- 全局 AI 助手：无「企业AI助手」权限的账号不挂载，与后端接口守卫保持一致 -->
    <AiAssistant v-if="canUseAssistant" v-model="assistantVisible" />

    <!-- 修改密码 -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="420px">
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="原密码">
          <el-input v-model="pwdForm.old_password" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.new_password" type="password" show-password placeholder="至少6位" />
        </el-form-item>
        <el-form-item label="确认密码">
          <el-input v-model="pwdForm.confirm" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdLoading" @click="submitPwd">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, Bell, ChatDotRound } from '@element-plus/icons-vue';
import { useUserStore } from '../store/user';
import { systemApi, userApi, noticeApi } from '../api';
import AiAssistant from '../components/AiAssistant.vue';

const route = useRoute();
const router = useRouter();
const store = useUserStore();

const collapse = ref(false);
const assistantVisible = ref(false);
const llmReady = ref<boolean | null>(null);

const menus = computed(() => store.menus);
const profile = computed(() => store.profile);
const realName = computed(() => store.realName);
const enterpriseName = computed(() => store.enterpriseName);
const activePath = computed(() => route.path);
const currentTitle = computed(() => (route.meta.title as string) || '');
const avatarText = computed(() => (store.realName || 'U').slice(0, 1));
/** 是否具备「企业AI助手」权限，未授权时不渲染入口，避免调用被后端守卫拦截 */
const canUseAssistant = computed(() => store.has('workbench:assistant'));

/** V2.0 站内消息未读角标：懒加载，仅拉一次后静默，避免首屏阻塞 */
const unreadBadge = ref(0);
function fetchUnreadBadge() {
  noticeApi.unreadCount().then((n: any) => { unreadBadge.value = Number(n ?? 0); }).catch(() => void 0);
}

onMounted(async () => {
  try {
    const info: any = await systemApi.info();
    llmReady.value = !!info.llm_ready;
  } catch {
    llmReady.value = null;
  }
  // V2.0 消息角标
  fetchUnreadBadge();
});

/* ---------- 修改密码 ---------- */
const pwdVisible = ref(false);
const pwdLoading = ref(false);
const pwdForm = reactive({ old_password: '', new_password: '', confirm: '' });

function onCommand(cmd: string) {
  if (cmd === 'pwd') {
    pwdForm.old_password = '';
    pwdForm.new_password = '';
    pwdForm.confirm = '';
    pwdVisible.value = true;
  } else if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录吗？', '提示', { type: 'warning' })
      .then(async () => {
        await store.logout();
        router.push('/login');
      })
      .catch(() => void 0);
  }
}

async function submitPwd() {
  if (!pwdForm.old_password || !pwdForm.new_password) return ElMessage.warning('请填写完整');
  if (pwdForm.new_password.length < 6) return ElMessage.warning('新密码至少 6 位');
  if (pwdForm.new_password !== pwdForm.confirm) return ElMessage.warning('两次输入的新密码不一致');
  pwdLoading.value = true;
  try {
    await userApi.changePassword({
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    });
    ElMessage.success('密码已修改，请重新登录');
    pwdVisible.value = false;
    await store.logout();
    router.push('/login');
  } finally {
    pwdLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
.app-layout {
  height: 100%;
}

.aside {
  background: #1f2a3d;
  transition: width 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;

  .logo-mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--fae-primary);
    color: #fff;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logo-text {
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.menu-scroll {
  flex: 1;

  :deep(.el-menu) {
    border-right: none;
  }

  :deep(.el-menu-item.is-active) {
    background: var(--fae-primary) !important;
  }
}

.header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--fae-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.collapse-btn {
  font-size: 18px;
  cursor: pointer;
  color: var(--fae-text-sub);

  &:hover {
    color: var(--fae-primary);
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  outline: none;

  .avatar {
    background: var(--fae-primary);
    font-size: 13px;
  }

  .uname {
    font-size: 13px;
    color: var(--fae-text);
  }
}

.main {
  background: var(--fae-bg);
  padding: 0;
  overflow-y: auto;
}
</style>
