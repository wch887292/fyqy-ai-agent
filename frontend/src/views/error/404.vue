<template>
  <div class="err-page">
    <div class="code">404</div>
    <p class="msg">您访问的页面不存在或已被移除</p>
    <el-button type="primary" @click="$router.push('/workbench/index')">返回工作台</el-button>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.err-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.code {
  font-size: 84px;
  font-weight: 700;
  color: var(--fae-primary);
  line-height: 1;
}
.msg {
  color: var(--fae-text-sub);
  margin: 0;
}
</style>
