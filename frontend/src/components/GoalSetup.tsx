import { useState, useCallback } from 'react'
import { Target, ArrowRight, ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react'
import { createGoal, sendChat } from '../lib/api'

interface GoalSetupProps {
  onComplete: () => void
}

interface GoalDraft {
  title: string
  description: string
}

type Step = 'welcome' | 'questions' | 'refining' | 'confirm'

const SETUP_QUESTIONS = [
  '你最想做成什么？不论大小，说出你心中最想实现的事。',
  '一年后你想成为什么样的人？在哪些方面有所成长？',
  '你目前最投入精力的事情是什么？',
  '有没有一直想做但还没开始的事？',
]

export default function GoalSetup({ onComplete }: GoalSetupProps) {
  const [step, setStep] = useState<Step>('welcome')
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [goals, setGoals] = useState<GoalDraft[]>([])
  const [isRefining, setIsRefining] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')

  // 提交当前回答，前进到下一个问题
  const submitAnswer = useCallback(() => {
    const trimmed = currentAnswer.trim()
    if (!trimmed) return

    const newAnswers = [...answers, trimmed]
    setAnswers(newAnswers)
    setCurrentAnswer('')

    if (currentQ < SETUP_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      // 所有问题回答完，AI 提炼目标
      refineGoals(newAnswers)
    }
  }, [currentAnswer, answers, currentQ])

  // 调用 AI 提炼目标
  const refineGoals = async (allAnswers: string[]) => {
    setStep('refining')
    setIsRefining(true)

    const prompt = `用户回答了以下几个关于人生目标的问题：

${SETUP_QUESTIONS.map((q, i) => `问：${q}\n答：${allAnswers[i] || '(未回答)'}`).join('\n\n')}

请根据用户的回答，提炼出 3-5 个结构化的长期目标。每个目标包含：
- 标题（简短有力，10字以内）
- 描述（一句话说明这个目标的具体含义）

请严格按以下 JSON 格式输出，不要添加任何其他文字：
[{"title": "标题", "description": "描述"}, ...]`

    try {
      const result = await sendChat({
        message: prompt,
        model: 'claude-sonnet',
      })

      // 从 AI 回复中解析目标
      const reply = result.reply.trim()
      const jsonMatch = reply.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as GoalDraft[]
        setGoals(parsed.slice(0, 5))
      } else {
        // Fallback：简单拆分
        setGoals([
          { title: '目标 1', description: allAnswers[0] || '' },
          { title: '目标 2', description: allAnswers[1] || '' },
          { title: '目标 3', description: allAnswers[2] || '' },
        ])
      }
    } catch (e) {
      console.error('AI 提炼失败:', e)
      // Fallback
      setGoals(
        allAnswers
          .filter((a) => a.trim())
          .slice(0, 5)
          .map((a, i) => ({ title: `目标 ${i + 1}`, description: a }))
      )
    } finally {
      setIsRefining(false)
      setStep('confirm')
    }
  }

  // 编辑目标
  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditTitle(goals[idx].title)
    setEditDesc(goals[idx].description)
  }

  const saveEdit = () => {
    if (editingIdx === null) return
    const updated = [...goals]
    updated[editingIdx] = { title: editTitle.trim() || goals[editingIdx].title, description: editDesc.trim() }
    setGoals(updated)
    setEditingIdx(null)
  }

  const removeGoal = (idx: number) => {
    setGoals(goals.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  // 确认并保存目标
  const confirmGoals = async () => {
    if (goals.length === 0) return
    setIsSaving(true)

    try {
      for (let i = 0; i < goals.length; i++) {
        await createGoal(goals[i].title, goals[i].description, i + 1)
      }
      localStorage.setItem('xenica-goal-setup-done', 'true')
      onComplete()
    } catch (e) {
      console.error('保存目标失败:', e)
      setIsSaving(false)
    }
  }

  // 跳过引导
  const skipSetup = () => {
    localStorage.setItem('xenica-goal-setup-done', 'true')
    onComplete()
  }

  return (
    <div className="goal-setup-overlay">
      <div className="goal-setup-container">
        {/* 步骤指示器 */}
        <div className="goal-setup-steps">
          {(['welcome', 'questions', 'refining', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className={`goal-step-dot ${step === s ? 'active' : ''} ${(['welcome', 'questions', 'refining', 'confirm'].indexOf(step)) > i ? 'done' : ''}`} />
          ))}
        </div>

        {/* 欢迎页 */}
        {step === 'welcome' && (
          <div className="goal-setup-card">
            <div className="goal-setup-icon">
              <Target size={48} />
            </div>
            <h1 className="goal-setup-title font-serif">让我们先聊聊目标</h1>
            <p className="goal-setup-desc">
              Xenica 可以帮你把日常的想法、学习和行动与长远目标联系起来。
              <br />
              花一分钟告诉我你想做什么，之后对话中 AI 会自然地提醒你。
            </p>
            <div className="goal-setup-actions">
              <button className="goal-setup-primary" onClick={() => setStep('questions')}>
                开始 <ArrowRight size={16} />
              </button>
              <button className="goal-setup-skip" onClick={skipSetup}>
                以后再说
              </button>
            </div>
          </div>
        )}

        {/* 问题页 */}
        {step === 'questions' && (
          <div className="goal-setup-card">
            <div className="goal-q-progress">
              问题 {currentQ + 1} / {SETUP_QUESTIONS.length}
            </div>
            <h2 className="goal-q-text font-serif">{SETUP_QUESTIONS[currentQ]}</h2>

            {/* 已回答的问题 */}
            {answers.length > 0 && (
              <div className="goal-q-history">
                {answers.map((a, i) => (
                  <div key={i} className="goal-q-answered">
                    <span className="goal-q-answered-label">Q{i + 1}:</span>
                    <span className="goal-q-answered-text">{a}</span>
                  </div>
                ))}
              </div>
            )}

            <textarea
              className="goal-q-input"
              placeholder="你的回答…"
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitAnswer()
                }
              }}
              autoFocus
            />

            <div className="goal-setup-actions">
              <button
                className="goal-setup-back"
                onClick={() => {
                  if (currentQ > 0) {
                    setCurrentQ(currentQ - 1)
                    setCurrentAnswer(answers[answers.length - 1] || '')
                    setAnswers(answers.slice(0, -1))
                  } else {
                    setStep('welcome')
                  }
                }}
              >
                <ArrowLeft size={16} /> 上一步
              </button>
              <button
                className="goal-setup-primary"
                disabled={!currentAnswer.trim()}
                onClick={submitAnswer}
              >
                {currentQ < SETUP_QUESTIONS.length - 1 ? '下一个' : '提炼目标'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* 提炼中 */}
        {step === 'refining' && (
          <div className="goal-setup-card">
            <div className="goal-setup-refining">
              <Sparkles size={32} className="goal-sparkle" />
              <h2 className="goal-setup-subtitle font-serif">AI 正在提炼你的目标…</h2>
              <p className="goal-setup-desc">根据你的回答，生成 3-5 个结构化目标</p>
              <Loader2 size={24} className="spin" />
            </div>
          </div>
        )}

        {/* 确认页 */}
        {step === 'confirm' && (
          <div className="goal-setup-card goal-confirm-card">
            <h2 className="goal-setup-subtitle font-serif">确认你的目标</h2>
            <p className="goal-setup-desc">点击目标可以编辑，确认后存入 Xenica</p>

            <div className="goal-list">
              {goals.map((g, i) => (
                <div key={i} className={`goal-card ${editingIdx === i ? 'editing' : ''}`}>
                  {editingIdx === i ? (
                    <div className="goal-edit-form">
                      <input
                        className="goal-edit-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="目标标题"
                        autoFocus
                      />
                      <textarea
                        className="goal-edit-desc"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="目标描述"
                      />
                      <div className="goal-edit-actions">
                        <button className="goal-edit-save" onClick={saveEdit}>保存</button>
                        <button className="goal-edit-cancel" onClick={() => setEditingIdx(null)}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="goal-card-content" onClick={() => startEdit(i)}>
                      <div className="goal-card-num">{i + 1}</div>
                      <div className="goal-card-body">
                        <h3 className="goal-card-title">{g.title}</h3>
                        <p className="goal-card-desc">{g.description}</p>
                      </div>
                      <button
                        className="goal-card-remove"
                        onClick={(e) => { e.stopPropagation(); removeGoal(i) }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="goal-setup-actions">
              <button
                className="goal-setup-back"
                onClick={() => {
                  setStep('questions')
                  setCurrentQ(0)
                  setAnswers([])
                  setGoals([])
                }}
              >
                <ArrowLeft size={16} /> 重新回答
              </button>
              <button
                className="goal-setup-primary"
                disabled={goals.length === 0 || isSaving}
                onClick={confirmGoals}
              >
                {isSaving ? (
                  <><Loader2 size={16} className="spin" /> 保存中…</>
                ) : (
                  <><Check size={16} /> 确认（{goals.length} 个目标）</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
