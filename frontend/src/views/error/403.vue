<template>
  <div class="err-page">
    <div class="code">403</div>
    <p class="msg">您当前的角色没有该菜单的访问权限</p>
    <p class="tip">如需开通，请联系企业管理员在【组织管理 - 角色与权限】中配置</p>
    <el-button type="primary" @click="$router.push('/workbench/index')">返回工作台</el-button>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.err-page {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.code {
  font-size: 84px;
  font-weight: 700;
  color: var(--fae-warning);
  line-height: 1;
}
.msg {
  margin: 0;
  font-size: 15px;
}
.tip {
  margin: 0 0 10px;
  color: var(--fae-text-sub);
  font-size: 13px;
}
</style>
