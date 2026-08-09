<template>
  <div class="agent-builder">
    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="简易智能体" name="simple">
        <SimpleBuilder />
      </el-tab-pane>
      <el-tab-pane label="高级智能体" name="advanced">
        <AdvancedBuilder />
      </el-tab-pane>
      <el-tab-pane label="执行记录" name="records">
        <RecordList />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SimpleBuilder from './builder-simple.vue'
import AdvancedBuilder from './builder-advanced.vue'
import RecordList from './builder-records.vue'

const activeTab = ref('simple')
</script>
