import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, Check, AlertCircle, X, ChevronDown, ChevronUp, FileType } from 'lucide-react'
import { importMarkdown, importPdf } from '../lib/api'
import { useAppStore } from '../stores/app'
import type { MarkdownImportResult, PdfImportResult } from '../lib/types'

/** 待导入文件 */
interface PendingFile {
  file: File
  name: string
  size: number
  type: 'md' | 'pdf'
}

/** 已导入文件结果 */
interface ImportedFile {
  name: string
  success: boolean
  result?: MarkdownImportResult
  pdfResult?: PdfImportResult
  error?: string
}

type ImportSource = 'obsidian' | 'cursor' | 'notion' | 'other'
type PdfMode = 'text' | 'vision'

export default function MarkdownImport() {
  const { importOpen, toggleImport } = useAppStore()
  const [files, setFiles] = useState<PendingFile[]>([])
  const [source, setSource] = useState<ImportSource>('obsidian')
  const [pdfMode, setPdfMode] = useState<PdfMode>('text')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [results, setResults] = useState<ImportedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  // 是否有 PDF 文件
  const hasPdf = files.some(f => f.type === 'pdf')

  // 过滤 .md 和 .pdf 文件
  const filterFiles = useCallback((fileList: FileList | File[]) => {
    const validFiles: PendingFile[] = []
    const arr = Array.from(fileList)
    for (const f of arr) {
      if (f.name.endsWith('.md') || f.name.endsWith('.markdown')) {
        validFiles.push({ file: f, name: f.name, size: f.size, type: 'md' })
      } else if (f.name.endsWith('.pdf')) {
        validFiles.push({ file: f, name: f.name, size: f.size, type: 'pdf' })
      }
    }
    return validFiles
  }, [])

  // 拖拽处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const droppedFiles = e.dataTransfer.files
    if (droppedFiles.length > 0) {
      const validFiles = filterFiles(droppedFiles)
      setFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        const newFiles = validFiles.filter(f => !existing.has(f.name))
        return [...prev, ...newFiles]
      })
    }
  }, [filterFiles])

  // 文件选择框
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validFiles = filterFiles(e.target.files)
      setFiles(prev => {
        const existing = new Set(prev.map(f => f.name))
        const newFiles = validFiles.filter(f => !existing.has(f.name))
        return [...prev, ...newFiles]
      })
    }
    // 清空 input 以允许重复选择
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [filterFiles])

  // 移除文件
  const removeFile = useCallback((name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name))
  }, [])

  // 清空所有
  const clearAll = useCallback(() => {
    setFiles([])
    setResults([])
    setProgress({ current: 0, total: 0, label: '' })
  }, [])

  // 开始导入
  const startImport = useCallback(async () => {
    if (files.length === 0) return

    setImporting(true)
    setResults([])
    setProgress({ current: 0, total: files.length, label: '' })
    abortRef.current = false

    const importResults: ImportedFile[] = []

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break

      const pf = files[i]

      if (pf.type === 'pdf') {
        setProgress({
          current: i + 1,
          total: files.length,
          label: `正在处理 PDF: ${pf.name}（${pdfMode === 'text' ? '文字模式' : '图片模式'}）…`,
        })
      } else {
        setProgress({ current: i + 1, total: files.length, label: '' })
      }

      try {
        if (pf.type === 'pdf') {
          const pdfResult = await importPdf(pf.file, pdfMode)
          importResults.push({ name: pf.name, success: true, pdfResult })
        } else {
          const content = await pf.file.text()
          const result = await importMarkdown(pf.name, content, source)
          importResults.push({ name: pf.name, success: true, result })
        }
      } catch (err) {
        importResults.push({
          name: pf.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }

      setResults([...importResults])

      // 每个文件之间间隔 1 秒（避免后端 LLM 并发过高），最后一个不等
      if (i < files.length - 1 && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    setImporting(false)
  }, [files, source, pdfMode])

  // 中止导入
  const abortImport = useCallback(() => {
    abortRef.current = true
  }, [])

  // 格式化文件大小
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 统计
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length
  const totalEntities = results.reduce(
    (sum, r) => sum + (r.result?.entities_extracted ?? 0) + (r.pdfResult?.entities_extracted ?? 0),
    0,
  )
  const totalEdges = results.reduce((sum, r) => sum + (r.result?.edges_created ?? 0), 0)
  const totalMoments = results.reduce((sum, r) => sum + (r.pdfResult?.moments_created ?? 0), 0)
  const totalPages = results.reduce((sum, r) => sum + (r.pdfResult?.pages_processed ?? 0), 0)
  const allDangling = results.flatMap(r => r.result?.dangling_links ?? [])

  if (!importOpen) return null

  return (
    <div className="settings-overlay" onClick={toggleImport}>
      <div className="settings-panel md-import-panel" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="settings-header">
          <h2 className="settings-title font-serif">导入文件</h2>
          <button className="settings-close" onClick={toggleImport}>
            <X size={18} />
          </button>
        </div>

        <div className="settings-body">
          {/* 来源选择（仅 Markdown 需要） */}
          <section className="settings-section">
            <h3 className="settings-section-title">Markdown 来源</h3>
            <div className="md-import-sources">
              {(['obsidian', 'cursor', 'notion', 'other'] as ImportSource[]).map(s => (
                <button
                  key={s}
                  className={`md-import-source-btn ${source === s ? 'active' : ''}`}
                  onClick={() => setSource(s)}
                  disabled={importing}
                >
                  {s === 'obsidian' ? 'Obsidian' : s === 'cursor' ? 'Cursor' : s === 'notion' ? 'Notion' : '其他'}
                </button>
              ))}
            </div>
          </section>

          {/* 拖拽上传区 */}
          <section className="settings-section">
            <h3 className="settings-section-title">选择文件</h3>
            <div
              className={`md-import-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !importing && fileInputRef.current?.click()}
            >
              <Upload size={32} className="md-import-dropzone-icon" />
              <p className="md-import-dropzone-text">
                拖拽 <code>.md</code> 或 <code>.pdf</code> 文件到此处
              </p>
              <p className="md-import-dropzone-sub">或点击选择文件</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.pdf"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>
          </section>

          {/* PDF 模式选择 — 仅在有 PDF 文件时显示 */}
          {hasPdf && (
            <section className="settings-section">
              <h3 className="settings-section-title">PDF 导入模式</h3>
              <div className="md-import-sources">
                <button
                  className={`md-import-source-btn ${pdfMode === 'text' ? 'active' : ''}`}
                  onClick={() => setPdfMode('text')}
                  disabled={importing}
                >
                  文字模式
                </button>
                <button
                  className={`md-import-source-btn ${pdfMode === 'vision' ? 'active' : ''}`}
                  onClick={() => setPdfMode('vision')}
                  disabled={importing}
                >
                  图片模式
                </button>
              </div>
              <p className="md-import-mode-hint">
                {pdfMode === 'text'
                  ? '适用于电子书、论文、课本等文字 PDF'
                  : '适用于手写笔记、扫描件、PPT 导出等图片 PDF'}
              </p>
            </section>
          )}

          {/* 文件列表预览 */}
          {files.length > 0 && (
            <section className="settings-section">
              <div className="md-import-list-header">
                <h3 className="settings-section-title">
                  待导入文件 ({files.length})
                </h3>
                {!importing && (
                  <button className="md-import-clear-btn" onClick={clearAll}>清空</button>
                )}
              </div>
              <div className="md-import-file-list">
                {files.map(f => (
                  <div key={f.name} className="md-import-file-item">
                    {f.type === 'pdf'
                      ? <FileType size={16} className="md-import-file-icon pdf-icon" />
                      : <FileText size={16} className="md-import-file-icon" />
                    }
                    <span className="md-import-file-name">{f.name}</span>
                    <span className="md-import-file-size">{formatSize(f.size)}</span>
                    {!importing && (
                      <button
                        className="md-import-file-remove"
                        onClick={() => removeFile(f.name)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 导入按钮 + 进度条 */}
          {files.length > 0 && (
            <section className="settings-section">
              {!importing && results.length === 0 && (
                <button className="md-import-start-btn" onClick={startImport}>
                  <Upload size={16} />
                  开始导入 ({files.length} 个文件)
                </button>
              )}

              {importing && (
                <div className="md-import-progress">
                  <div className="md-import-progress-info">
                    <span>
                      {progress.label || `导入中… ${progress.current} / ${progress.total}`}
                    </span>
                    <button className="md-import-abort-btn" onClick={abortImport}>
                      中止
                    </button>
                  </div>
                  <div className="md-import-progress-bar">
                    <div
                      className="md-import-progress-fill"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 结果汇总 */}
          {results.length > 0 && (
            <section className="settings-section">
              <h3 className="settings-section-title">导入结果</h3>
              <div className="md-import-summary">
                <div className="md-import-summary-row success">
                  <Check size={16} />
                  <span>成功 {successCount} 个</span>
                </div>
                {failCount > 0 && (
                  <div className="md-import-summary-row fail">
                    <AlertCircle size={16} />
                    <span>失败 {failCount} 个</span>
                  </div>
                )}
                <div className="md-import-summary-stats">
                  {totalPages > 0 && <span>处理 {totalPages} 页，</span>}
                  {totalMoments > 0 && <span>创建 {totalMoments} 个认知瞬间，</span>}
                  提取 {totalEntities} 个实体
                  {totalEdges > 0 && <span>，创建 {totalEdges} 条语义边</span>}
                  {allDangling.length > 0 && (
                    <span className="md-import-dangling">
                      ，{allDangling.length} 个悬空引用
                    </span>
                  )}
                </div>
              </div>

              {/* 失败详情（可展开） */}
              {failCount > 0 && (
                <div className="md-import-errors">
                  <button
                    className="md-import-errors-toggle"
                    onClick={() => setShowErrors(!showErrors)}
                  >
                    {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    查看失败详情
                  </button>
                  {showErrors && (
                    <div className="md-import-errors-list">
                      {results.filter(r => !r.success).map(r => (
                        <div key={r.name} className="md-import-error-item">
                          <AlertCircle size={14} />
                          <span className="md-import-error-name">{r.name}</span>
                          <span className="md-import-error-msg">{r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 导入更多 */}
              {!importing && (
                <button className="md-import-more-btn" onClick={clearAll}>
                  继续导入
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
