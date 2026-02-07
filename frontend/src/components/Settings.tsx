import { useState } from 'react'
import { X, Trash2, Plus, Download } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useThemeStore } from '../stores/theme'
import { themeLabels } from '../lib/theme'
import type { ThemeName } from '../lib/types'

const themes: Array<{ id: ThemeName; label: string; color: string }> = [
  { id: 'amber', label: themeLabels.amber, color: '#d4a574' },
  { id: 'indigo', label: themeLabels.indigo, color: '#8ba4b8' },
  { id: 'olive', label: themeLabels.olive, color: '#8faa7b' },
]

export default function Settings() {
  const {
    settingsOpen, toggleSettings,
    activityTags, addActivityTag, removeActivityTag,
    llmEndpoint, llmModel, setLlmEndpoint, setLlmModel,
  } = useAppStore()
  const { theme, mode, setTheme, setMode } = useThemeStore()

  const [newTag, setNewTag] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

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
          {/* LLM 配置 */}
          <section className="settings-section">
            <h3 className="settings-section-title">LLM 配置</h3>
            <label className="settings-field">
              <span className="settings-label">API 端点</span>
              <input className="settings-input" value={llmEndpoint} onChange={(e) => setLlmEndpoint(e.target.value)} placeholder="http://localhost:8045" />
            </label>
            <label className="settings-field">
              <span className="settings-label">默认模型</span>
              <input className="settings-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="claude-sonnet-4-20250514" />
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
            <button className="settings-export" onClick={handleExport}><Download size={16} /> 导出设置 (JSON)</button>
          </section>
        </div>
      </div>
    </div>
  )
}
