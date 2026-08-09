<template>
  <div class="simple-builder">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>简易智能体管理</span>
          <el-button type="primary" @click="handleCreate">新建智能体</el-button>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="名称">
          <el-input v-model="searchForm.agentName" placeholder="请输入智能体名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">搜索</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 列表 -->
      <el-table :data="tableData" v-loading="loading" border stripe>
        <el-table-column prop="agentName" label="智能体名称" min-width="150" />
        <el-table-column prop="persona" label="角色设定" min-width="200" show-overflow-tooltip />
        <el-table-column prop="kbDocIds" label="关联文档数" width="120">
          <template #default="{ row }">
            {{ row.kb_doc_ids ? row.kb_doc_ids.split(',').length : 0 }}
          </template>
        </el-table-column>
        <el-table-column prop="answerStyle" label="回答风格" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="styleType(row.answer_style)">
              {{ styleMap[row.answer_style] || row.answer_style }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enable" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enable === 1 ? 'success' : 'danger'" size="small">
              {{ row.enable === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link :type="row.enable === 1 ? 'warning' : 'success'" @click="handleToggle(row)">
              {{ row.enable === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page.page"
        v-model:page-size="page.size"
        :total="page.total"
        layout="total, sizes, prev, pager, next"
        @current-change="loadList"
        @size-change="loadList"
        class="pagination"
      />
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="700px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="智能体名称" prop="agentName">
          <el-input v-model="form.agentName" placeholder="请输入智能体名称" />
        </el-form-item>
        <el-form-item label="角色设定" prop="persona">
          <el-input v-model="form.persona" type="textarea" :rows="3" placeholder="描述智能体的角色和职责" />
        </el-form-item>
        <el-form-item label="系统提示词" prop="systemPrompt">
          <el-input v-model="form.systemPrompt" type="textarea" :rows="5" placeholder="请输入系统提示词，定义智能体的行为模式" />
        </el-form-item>
        <el-form-item label="关联知识库">
          <el-select v-model="form.kbDocIds" multiple placeholder="选择知识库文档" style="width: 100%">
            <el-option
              v-for="doc in kbDocs"
              :key="doc.id"
              :label="doc.title"
              :value="String(doc.id)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="回答风格" prop="answerStyle">
          <el-radio-group v-model="form.answerStyle">
            <el-radio value="concise">简洁</el-radio>
            <el-radio value="detailed">详细</el-radio>
            <el-radio value="friendly">友好</el-radio>
            <el-radio value="professional">专业</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="温度参数">
          <el-slider v-model="form.temperature" :min="0" :max="1" :step="0.1" show-input />
        </el-form-item>
        <el-form-item label="最大Token">
          <el-input-number v-model="form.maxTokens" :min="256" :max="4096" :step="256" />
        </el-form-item>
        <el-form-item label="显示引用">
          <el-switch v-model="form.showRefs" />
        </el-form-item>
        <el-form-item label="访问密码">
          <el-input v-model="form.accessPwd" placeholder="留空则不设置密码" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { agentBuilderApi } from '@/api'

const loading = ref(false)
const tableData = ref<any[]>([])
const kbDocs = ref<any[]>([])
const dialogVisible = ref(false)
const formRef = ref()
const submitting = ref(false)

const searchForm = reactive({ agentName: '' })
const page = reactive({ page: 1, size: 10, total: 0 })

const styleMap = { concise: '简洁', detailed: '详细', friendly: '友好', professional: '专业' }
const styleType = (s: string) => ({ concise: '', detailed: 'success', friendly: 'warning', professional: 'info' }[s] || '')

const form = reactive({
  id: 0,
  agentName: '',
  persona: '',
  systemPrompt: '',
  kbDocIds: [] as string[],
  answerStyle: 'detailed',
  temperature: 0.7,
  maxTokens: 2048,
  showRefs: 1,
  accessPwd: '',
})

const rules = {
  agentName: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
  systemPrompt: [{ required: true, message: '请输入系统提示词', trigger: 'blur' }],
}

const dialogTitle = ref('新建简易智能体')

const loadList = async () => {
  loading.value = true
  try {
    const res: any = await agentBuilderApi.simpleList({ ...searchForm, ...page })
    tableData.value = res.data?.list || []
    page.total = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadKbDocs = async () => {
  const res: any = await agentBuilderApi.kbDocs()
  kbDocs.value = res.data || []
}

const handleCreate = () => {
  dialogTitle.value = '新建简易智能体'
  Object.assign(form, { id: 0, agentName: '', persona: '', systemPrompt: '', kbDocIds: [], answerStyle: 'detailed', temperature: 0.7, maxTokens: 2048, showRefs: 1, accessPwd: '' })
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  dialogTitle.value = '编辑简易智能体'
  Object.assign(form, {
    id: row.id,
    agentName: row.agent_name,
    persona: row.persona || '',
    systemPrompt: row.system_prompt,
    kbDocIds: (row.kb_doc_ids || '').split(',').filter(Boolean),
    answerStyle: row.answer_style || 'detailed',
    temperature: row.temperature || 0.7,
    maxTokens: row.max_tokens || 2048,
    showRefs: row.show_refs || 1,
    accessPwd: '',
  })
  dialogVisible.value = true
}

const handleSubmit = async () => {
  await formRef.value.validate()
  submitting.value = true
  try {
    const data = {
      ...form,
      kbDocIds: form.kbDocIds.join(','),
      showRefs: form.showRefs ? 1 : 0,
    }
    await agentBuilderApi.simpleSave(data)
    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error(e.msg || '保存失败')
  } finally {
    submitting.value = false
  }
}

const handleToggle = async (row: any) => {
  const enable = row.enable === 1 ? 0 : 1
  await agentBuilderApi.simpleEnable({ id: row.id, enable })
  ElMessage.success(enable === 1 ? '已启用' : '已禁用')
  loadList()
}

const handleDelete = async (row: any) => {
  await ElMessageBox.confirm('确定要删除该智能体吗？', '提示', { type: 'warning' })
  await agentBuilderApi.simpleDelete(row.id)
  ElMessage.success('删除成功')
  loadList()
}

const resetSearch = () => {
  Object.assign(searchForm, { agentName: '' })
  page.page = 1
  loadList()
}

const formatTime = (t: string) => t ? new Date(t).toLocaleString('zh-CN') : ''

onMounted(() => {
  loadList()
  loadKbDocs()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.search-form {
  margin-bottom: 20px;
}
.pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
</style>
