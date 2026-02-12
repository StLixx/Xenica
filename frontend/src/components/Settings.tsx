import { useState, useEffect, useCallback } from 'react'
import { X, Trash2, Plus, Download, Upload, Target, Edit2, Check, Loader2 } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useThemeStore } from '../stores/theme'
import { themeLabels } from '../lib/theme'
import { listGoals, updateGoal, deleteGoal } from '../lib/api'
import type { ThemeName, Goal } from '../lib/types'

const themes: Array<{ id: ThemeName; label: string; color: string }> = [
  { id: 'amber', label: themeLabels.amber, color: '#d4a574' },
  { id: 'indigo', label: themeLabels.indigo, color: '#8ba4b8' },
  { id: 'olive', label: themeLabels.olive, color: '#8faa7b' },
]

export default function Settings() {
  const {
    settingsOpen, toggleSettings,
    toggleImport,
    activityTags, addActivityTag, removeActivityTag,
    llmEndpoint, llmModel, setLlmEndpoint, setLlmModel,
    online,
  } = useAppStore()
  const { theme, mode, setTheme, setMode } = useThemeStore()

  const [newTag, setNewTag] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // X8: 目标列表
  const [goals, setGoals] = useState<Goal[]>([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null)

  // 加载目标
  const loadGoals = useCallback(() => {
    if (!online) return
    setGoalsLoading(true)
    listGoals()
      .then(setGoals)
      .catch(() => setGoals([]))
      .finally(() => setGoalsLoading(false))
  }, [online])

  useEffect(() => {
    if (settingsOpen && online) {
      loadGoals()
    }
  }, [settingsOpen, online, loadGoals])

  const handleAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !activityTags.includes(trimmed)) {
      addActivityTag(trimmed)
    }
    setNewTag('')
  }

  const handleExport = () => {
    const data = {
      theme: { theme, mode },
      activityTags,
      llm: { endpoint: llmEndpoint, model: llmModel },
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `xenica-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // X8: 目标操作
  const getGoalPureId = (goal: Goal): string => {
    const id = typeof goal.id === 'object' ? JSON.stringify(goal.id) : String(goal.id)
    return id.includes(':') ? id.split(':')[1] : id
  }

  const startEditGoal = (goal: Goal) => {
    setEditingGoalId(getGoalPureId(goal))
    setEditTitle(goal.title)
    setEditDesc(goal.description || '')
  }

  const saveGoalEdit = async (goal: Goal) => {
    const pureId = getGoalPureId(goal)
    setSavingGoalId(pureId)
    try {
      await updateGoal(pureId, {
        title: editTitle.trim() || goal.title,
        description: editDesc.trim() || undefined,
      })
      setEditingGoalId(null)
      loadGoals()
    } catch (e) {
      console.error('更新目标失败:', e)
    } finally {
      setSavingGoalId(null)
    }
  }

  const handleDeleteGoal = async (goal: Goal) => {
    const pureId = getGoalPureId(goal)
    setSavingGoalId(pureId)
    try {
      await deleteGoal(pureId)
      setGoals((prev) => prev.filter((g) => getGoalPureId(g) !== pureId))
    } catch (e) {
      console.error('删除目标失败:', e)
    } finally {
      setSavingGoalId(null)
    }
  }

  if (!settingsOpen) return null

  return (
    <div className="settings-overlay" onClick={toggleSettings}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title font-serif">设置</h2>
          <button className="settings-close" onClick={toggleSettings}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* X8: 目标 */}
          <section className="settings-section">
            <h3 className="settings-section-title">
              <Target size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              长期目标
            </h3>
            {goalsLoading ? (
              <div className="settings-goals-loading">加载中…</div>
            ) : goals.length === 0 ? (
              <div className="settings-goals-empty">
                <p>还没有设置目标</p>
                <button
                  className="settings-goal-setup-btn"
                  onClick={() => {
                    toggleSettings()
                    localStorage.removeItem('xenica-goal-setup-done')
                    window.location.reload()
                  }}
                >
                  开始设置目标
                </button>
              </div>
            ) : (
              <div className="settings-goals-list">
                {goals.map((goal) => {
                  const pureId = getGoalPureId(goal)
                  const isEditing = editingGoalId === pureId
                  const isSaving = savingGoalId === pureId

                  return (
                    <div key={pureId} className={`settings-goal-item ${isEditing ? 'editing' : ''}`}>
                      {isEditing ? (
                        <div className="settings-goal-edit">
                          <input
                            className="settings-input"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="目标标题"
                            autoFocus
                          />
                          <input
                            className="settings-input"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="目标描述"
                          />
                          <div className="settings-goal-edit-actions">
                            <button
                              className="settings-goal-save"
                              disabled={isSaving}
                              onClick={() => saveGoalEdit(goal)}
                            >
                              {isSaving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                              保存
                            </button>
                            <button className="settings-goal-cancel" onClick={() => setEditingGoalId(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="settings-goal-content">
                            <span className="settings-goal-title">{goal.title}</span>
                            {goal.description && (
                              <span className="settings-goal-desc">{goal.description}</span>
                            )}
                          </div>
                          <div className="settings-goal-actions">
                            <button
                              className="settings-goal-btn"
                              onClick={() => startEditGoal(goal)}
                              disabled={isSaving}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="settings-goal-btn danger"
                              onClick={() => handleDeleteGoal(goal)}
                              disabled={isSaving}
                            >
                              {isSaving ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* LLM 配置 */}
          <section className="settings-section">
            <h3 className="settings-section-title">LLM 配置</h3>
            <label className="settings-field">
              <span className="settings-label">API 端点</span>
              <input className="settings-input" value={llmEndpoint} onChange={(e) => setLlmEndpoint(e.target.value)} placeholder="http://localhost:8092" />
            </label>
            <label className="settings-field">
              <span className="settings-label">默认模型</span>
              <input className="settings-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="gpt-4.1" />
            </label>
          </section>

          {/* 主题 */}
          <section className="settings-section">
            <h3 className="settings-section-title">主题</h3>
            <div className="settings-themes">
              {themes.map((t) => (
                <button key={t.id} className={`settings-theme-btn ${theme === t.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>
                  <span className="settings-theme-dot" style={{ background: t.color }} />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="settings-mode-toggle">
              <button className={`settings-mode-btn ${mode === 'dark' ? 'active' : ''}`} onClick={() => setMode('dark')}>深色</button>
              <button className={`settings-mode-btn ${mode === 'light' ? 'active' : ''}`} onClick={() => setMode('light')}>浅色</button>
            </div>
          </section>

          {/* "在做什么"标签 */}
          <section className="settings-section">
            <h3 className="settings-section-title">"在做什么" 标签</h3>
            <div className="settings-tags">
              {activityTags.map((tag) => (
                <span key={tag} className="settings-tag">
                  {tag}
                  <button className="settings-tag-remove" onClick={() => removeActivityTag(tag)}><Trash2 size={12} /></button>
                </span>
              ))}
            </div>
            <div className="settings-tag-add">
              <input className="settings-input settings-input-sm" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTag()} placeholder="添加新标签…" />
              <button className="settings-add-btn" onClick={handleAddTag}><Plus size={16} /></button>
            </div>
          </section>

          {/* 密码 */}
          <section className="settings-section">
            <h3 className="settings-section-title">密码</h3>
            <label className="settings-field">
              <span className="settings-label">旧密码</span>
              <input className="settings-input" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
            </label>
            <label className="settings-field">
              <span className="settings-label">新密码</span>
              <input className="settings-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
            <button className="settings-save-pw" disabled={!oldPassword || !newPassword}>修改密码</button>
          </section>

          {/* 数据 */}
          <section className="settings-section">
            <h3 className="settings-section-title">数据</h3>
            <button className="settings-export" onClick={() => { toggleSettings(); toggleImport() }}>
              <Upload size={16} /> 导入文件（Markdown / PDF）
            </button>
            <button className="settings-export" onClick={handleExport}><Download size={16} /> 导出设置 (JSON)</button>
          </section>
        </div>
      </div>
    </div>
  )
}
