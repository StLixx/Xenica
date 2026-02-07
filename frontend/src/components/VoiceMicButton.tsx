import { useEffect, useRef } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'

interface VoiceMicButtonProps {
  /** 识别到文字时的回调，实时追加 */
  onTranscript: (text: string) => void
  /** 按钮尺寸，默认 32 */
  size?: number
  /** 圆形按钮，默认 false */
  rounded?: boolean
}

export default function VoiceMicButton({
  onTranscript,
  size = 32,
  rounded = false,
}: VoiceMicButtonProps) {
  const { isSupported, isListening, transcript, start, stop, reset } =
    useSpeechRecognition()

  const prevTranscriptRef = useRef('')

  // 监听 transcript 变化，增量回调给父组件
  useEffect(() => {
    if (transcript && transcript !== prevTranscriptRef.current) {
      // 只回调新增部分
      const newPart = transcript.slice(prevTranscriptRef.current.length)
      if (newPart) {
        onTranscript(newPart)
      }
      prevTranscriptRef.current = transcript
    }
  }, [transcript, onTranscript])

  // 停止时重置内部 transcript，为下次录音做准备
  useEffect(() => {
    if (!isListening && prevTranscriptRef.current) {
      // 延迟重置，确保最后一段 transcript 已回调
      const timer = setTimeout(() => {
        reset()
        prevTranscriptRef.current = ''
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isListening, reset])

  // 浏览器不支持时隐藏按钮
  if (!isSupported) return null

  const handleClick = () => {
    if (isListening) {
      stop()
    } else {
      start()
    }
  }

  const iconSize = Math.round(size * 0.44)

  return (
    <button
      type="button"
      onClick={handleClick}
      className="voice-mic-btn flex items-center justify-center shrink-0 transition-all"
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? '50%' : '8px',
        background: 'transparent',
        color: isListening ? 'var(--accent-rose)' : 'var(--text-dim)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
      }}
      title={isListening ? '停止语音输入' : '语音输入'}
      aria-label={isListening ? '停止语音输入' : '语音输入'}
    >
      {/* 录音时的脉动动画 */}
      {isListening && (
        <span
          className="voice-mic-pulse"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: rounded ? '50%' : '8px',
            background: 'var(--accent-rose)',
            opacity: 0.15,
            animation: 'voice-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {isListening ? <MicOff size={iconSize} /> : <Mic size={iconSize} />}

      {/* CSS 动画内联（确保不依赖外部样式表） */}
      <style>{`
        @keyframes voice-pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.3); opacity: 0.08; }
        }
        .voice-mic-btn:hover {
          background: var(--primary-subtle) !important;
        }
      `}</style>
    </button>
  )
}
