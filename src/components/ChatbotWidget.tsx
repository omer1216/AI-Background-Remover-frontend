import React, { useState, useRef, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import type { Message, ChatResponse, ImageAnalysis, CaptionStyle } from '../types'
import { chatService } from '../services/chatService'
import { imageService } from '../services/imageService'
import { useActiveImage } from '../contexts/ActiveImageContext'
import { useLocation } from 'react-router-dom'

// ─── Mode Types ───────────────────────────────────────────────────────────────

type Mode = 'chat' | 'analysis' | 'suggestions' | 'captions'

interface ChatbotWidgetProps {
  position?: 'bottom-right' | 'bottom-left'
}

// ─── Error Types ───────────────────────────────────────────────────────────────

type ErrorType = 'auth' | 'rate_limit' | 'timeout' | 'quota' | 'network' | 'generic'

interface ErrorInfo {
  type: ErrorType
  message: string
  retryable: boolean
  timestamp: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TypingDots = () => (
  <div className="flex gap-1 items-center px-4 py-3">
    {[0, 1, 2].map((i) => (
      <span key={i} className="w-1.5 h-1.5 rounded-full bg-magenta animate-bounce"
        style={{ animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
)

const getErrorInfo = (error: any): ErrorInfo => {
  const message = error.response?.data?.detail || error.message || 'An unexpected error occurred'
  const lowerMessage = message.toLowerCase()
  
  if (lowerMessage.includes('authentication') || lowerMessage.includes('api key')) {
    return {
      type: 'auth',
      message: 'AI service authentication failed. Please check your API key configuration.',
      retryable: false,
      timestamp: Date.now()
    }
  }
  if (lowerMessage.includes('rate limit')) {
    return {
      type: 'rate_limit',
      message: 'AI service rate limit exceeded. Please wait a moment and try again.',
      retryable: true,
      timestamp: Date.now()
    }
  }
  if (lowerMessage.includes('timeout')) {
    return {
      type: 'timeout',
      message: 'AI service timed out. Please check your connection and try again.',
      retryable: true,
      timestamp: Date.now()
    }
  }
  if (lowerMessage.includes('quota')) {
    return {
      type: 'quota',
      message: 'AI service quota exceeded. Please check your plan and usage.',
      retryable: false,
      timestamp: Date.now()
    }
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return {
      type: 'network',
      message: 'Network error. Please check your internet connection and try again.',
      retryable: true,
      timestamp: Date.now()
    }
  }
  
  return {
    type: 'generic',
    message: message || 'An unexpected error occurred. Please try again.',
    retryable: true,
    timestamp: Date.now()
  }
}

const ErrorDisplay: React.FC<{ error: ErrorInfo; onRetry?: () => void; onDismiss?: () => void }> = ({ error, onRetry, onDismiss }) => {
  const getErrorIcon = () => {
    switch (error.type) {
      case 'auth':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
      case 'rate_limit':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      case 'timeout':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
      case 'quota':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
      case 'network':
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg>
      default:
        return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
    }
  }

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="text-danger shrink-0 mt-0.5">{getErrorIcon()}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-danger font-medium">{error.message}</p>
          <div className="flex items-center gap-2 mt-2">
            {error.retryable && onRetry && (
              <button onClick={onRetry} className="text-[10px] font-semibold text-danger hover:text-danger/80 underline underline-offset-1">
                Try Again
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="text-[10px] text-muted hover:text-primary">
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const formatMessage = (text: string, isUser: boolean) => {
  if (isUser) return <span className="text-white font-medium text-[12px]">{text}</span>

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers: ### Title -> Bold, slightly larger
  html = html.replace(/^###\s+(.*)$/gm, '<h4 class="text-[12px] font-black text-primary mt-2 mb-1">$1</h4>')
  html = html.replace(/^##\s+(.*)$/gm, '<h3 class="text-[13px] font-black text-primary mt-2.5 mb-1">$1</h3>')
  html = html.replace(/^#\s+(.*)$/gm, '<h2 class="text-sm font-black text-primary mt-3 mb-1.5">$1</h2>')

  // Bullet items: - item
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<div class="flex gap-2 items-start pl-1 mt-1"><span class="text-magenta/80 mt-[5px] shrink-0 w-1.5 h-1.5 rounded-full bg-magenta"></span><span class="text-secondary">$1</span></div>')

  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-primary">$1</strong>')

  // Italics: *text*
  html = html.replace(/\*(.*?)\*/g, '<em class="italic text-secondary/90">$1</em>')

  // Inline code
  html = html.replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-surface-raised border border-border font-mono text-[10.5px] text-magenta">$1</code>')

  // Line breaks
  html = html.replace(/\n/g, '<br />')

  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h2', 'h3', 'h4', 'strong', 'em', 'code', 'div', 'span', 'br'],
    ALLOWED_ATTR: ['class'],
  })

  return <div dangerouslySetInnerHTML={{ __html: safeHtml }} className="space-y-1 text-secondary text-[12px] leading-relaxed" />
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Compact Image Uploader ───────────────────────────────────────────────────

interface MiniUploaderProps {
  file: File | null
  previewUrl: string | null
  onUpload: (f: File) => void
  onRemove: () => void
}

const MiniUploader: React.FC<MiniUploaderProps> = ({ file, previewUrl, onUpload, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.type.startsWith('image/')) onUpload(f)
  }

  if (previewUrl && file) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 bg-surface-raised border border-border rounded-xl">
        <img src={previewUrl} alt="uploaded" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary truncate">{file.name}</p>
          <p className="text-[10px] text-muted">{fmtSize(file.size)}</p>
        </div>
        <button onClick={onRemove}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-all shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex items-center gap-3 px-4 py-3 border border-dashed rounded-xl cursor-pointer transition-all ${
        dragging ? 'border-magenta/60 bg-magenta/5' : 'border-border hover:border-magenta hover:bg-surface-raised'
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-magenta/10 border border-magenta/20 flex items-center justify-center shrink-0">
        <svg className="w-4 h-4 text-magenta" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div>
        <p className="text-xs font-semibold text-primary">Upload an image</p>
        <p className="text-[10px] text-muted">Click or drag & drop — JPG, PNG, WEBP</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
    </div>
  )
}

// ─── Chat Message Bubble ──────────────────────────────────────────────────────

const WidgetMessage: React.FC<{ role: 'user' | 'assistant'; content: string; thinking?: string | null }> = ({ role, content, thinking }) => {
  const isUser = role === 'user'
  const [showThinking, setShowThinking] = useState(false)
  return (
    <div className={`flex gap-2 max-w-[92%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}>
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border text-[9px] font-black ${
        isUser ? 'bg-magenta/10 border-magenta/20 text-magenta' : 'bg-teal/10 border-teal/20 text-teal'
      }`}>
        {isUser ? 'U' : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
      </div>
      <div className="flex flex-col gap-1 max-w-full">
        {!isUser && thinking && (
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden text-[10px]">
            <button onClick={() => setShowThinking(!showThinking)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-secondary hover:text-primary transition-colors font-medium gap-3 bg-surface">
              <span className="flex items-center gap-1">
                <svg className="w-2.5 h-2.5 text-magenta animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {showThinking ? 'Hide thinking' : 'Show thinking'}
              </span>
              <svg className={`w-2.5 h-2.5 transition-transform ${showThinking ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showThinking && (
              <div className="p-2.5 text-secondary border-t border-border bg-surface max-h-28 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {thinking}
              </div>
            )}
          </div>
        )}
        <div className={`rounded-2xl px-3 py-2.5 shadow-md ${
          isUser ? 'bg-gradient-brand text-white rounded-tr-none' : 'bg-surface border border-border rounded-tl-none'
        }`}>
          {formatMessage(content, isUser)}
        </div>
      </div>
    </div>
  )
}

// ─── Main Widget ──────────────────────────────────────────────────────────────

const ChatbotWidget: React.FC<ChatbotWidgetProps> = ({
  position = 'bottom-right',
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')
  const [unread, setUnread] = useState(0)

  // Context active image context
  const { activeFile: contextFile, activePreviewUrl: contextPreviewUrl, setActiveImage } = useActiveImage()

  // Internal image state (overridden by context image if provided)
  const [internalFile, setInternalFile] = useState<File | null>(null)
  const [internalPreviewUrl, setInternalPreviewUrl] = useState<string | null>(null)

  const activeFile = contextFile ?? internalFile
  const activePreviewUrl = contextPreviewUrl ?? internalPreviewUrl

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([])
  const location = useLocation()
  const currentPath = location.pathname

  // Page-specific quick suggestions (chips)
  const getSuggestionsForPath = (path: string): string[] => {
    switch (path) {
      case '/enhance':
        return ['How to enhance detail?', 'Color correction tips', 'Is the lighting good?']
      case '/replace-bg':
        return ['Backdrop ideas', 'Suggest matching color', 'Lighting matching help']
      case '/smart-crop':
        return ['Rule of thirds advice', 'Best aspect ratio?', 'Is subject centered?']
      case '/batch':
        return ['Batch workflows', 'Standardize styling', 'Optimizing format']
      case '/history':
        return ['Analyzing my history', 'Clear history help', 'Download options']
      case '/':
      default:
        return ['Suggest a background', 'How should I edit this?', 'Write a caption']
    }
  }

  // Page-specific prompt helper
  const getPromptContextForPath = (path: string): string => {
    switch (path) {
      case '/enhance':
        return 'System context: The user is currently on the Image Enhance page. Focus your advice on image quality, resolution, contrast, detail recovery, color balancing, and sharpening adjustments.'
      case '/replace-bg':
        return 'System context: The user is currently on the Replace Background page. Focus your advice on background composition, lighting/shadow matching, background color choices, and aesthetic themes.'
      case '/smart-crop':
        return 'System context: The user is currently on the Smart Crop page. Focus your advice on image composition, rule of thirds, framing, grid alignment, aspect ratios, and centering.'
      case '/batch':
        return 'System context: The user is currently on the Batch Processing page. Focus your advice on managing high volumes of images, processing queues, scaling, file organization, and bulk standardizations.'
      case '/history':
        return 'System context: The user is currently on the History page. Focus your advice on organizing past runs, downloading transparent PNG outputs, and managing previous project history logs.'
      case '/':
      default:
        return 'System context: The user is currently on the Background Remover home page. Focus your advice on transparency, background separation, edge smoothness, and basic export options.'
    }
  }
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<ErrorInfo | null>(null)
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Analysis state ────────────────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<ImageAnalysis | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<ErrorInfo | null>(null)

  // ── Suggestions state ─────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState<ErrorInfo | null>(null)

  // ── Captions state ────────────────────────────────────────────────────────
  const [captions, setCaptions] = useState<string[]>([])
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('casual')
  const [captionsLoading, setCaptionsLoading] = useState(false)
  const [captionsError, setCaptionsError] = useState<ErrorInfo | null>(null)
  const [selectedCaption, setSelectedCaption] = useState<number | null>(null)
  const [copiedCaption, setCopiedCaption] = useState<number | null>(null)

  // Auto-scroll chat
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])

  // Focus chat input when switching to chat mode or opening
  useEffect(() => {
    if (isOpen && mode === 'chat') setTimeout(() => chatInputRef.current?.focus(), 150)
    if (isOpen) setUnread(0)
  }, [isOpen, mode])

  // Clear internal image when external context image arrives
  useEffect(() => {
    if (contextFile) { setInternalFile(null); setInternalPreviewUrl(null) }
  }, [contextFile])

  // ── Image handlers ────────────────────────────────────────────────────────
  const handleUpload = useCallback((f: File) => {
    const url = URL.createObjectURL(f)
    setInternalFile(f)
    setInternalPreviewUrl(url)
    // Clear previous results when new image is uploaded
    setAnalysis(null); setSuggestions([]); setCaptions([]); setSelectedCaption(null)
  }, [])

  const handleRemoveImage = () => {
    setInternalFile(null)
    setInternalPreviewUrl(null)
    setActiveImage(null, null)
    setAnalysis(null); setSuggestions([]); setCaptions([]); setSelectedCaption(null)
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendChat = async (retryMessage: string | null = null) => {
    const text = retryMessage || chatInput.trim()
    if (!text || chatLoading) return
    
    const userMsg: Message = { id: Date.now() + '-u', role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setChatInput('')
    setPendingChatMessage(null)
    setChatLoading(true); setChatError(null)
    
    try {
      const routeContext = getPromptContextForPath(currentPath)
      const combinedText = `${routeContext}\n\nUser Message: ${text}`
      const res: ChatResponse = await chatService.sendMessage(combinedText, activeFile)
      const aiMsg: Message = { id: Date.now() + '-a', role: 'assistant', content: res.reply, thinking: res.thinking, timestamp: Date.now() }
      setMessages(prev => [...prev, aiMsg])
      if (!isOpen) setUnread(n => n + 1)
    } catch (e: any) {
      const errorInfo = getErrorInfo(e)
      setChatError(errorInfo)
      setPendingChatMessage(text)
      // Remove the user message if it failed
      setMessages(prev => prev.filter(msg => msg.id !== userMsg.id))
    } finally { setChatLoading(false) }
  }

  const retryChat = () => {
    if (pendingChatMessage) {
      sendChat(pendingChatMessage)
    }
  }

  const handleChatKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  // ── Analysis ──────────────────────────────────────────────────────────────
  const runAnalysis = async () => {
    if (!activeFile || analysisLoading) return
    setAnalysisLoading(true); setAnalysisError(null); setAnalysis(null)
    try {
      const data = await imageService.analyze(activeFile)
      setAnalysis(data)
    } catch (e: any) {
      setAnalysisError(getErrorInfo(e))
    } finally { setAnalysisLoading(false) }
  }

  const retryAnalysis = () => {
    runAnalysis()
  }

  // ── Suggestions ───────────────────────────────────────────────────────────
  const runSuggestions = async () => {
    if (!activeFile || suggestionsLoading) return
    setSuggestionsLoading(true); setSuggestionsError(null); setSuggestions([])
    try {
      const data = await imageService.getSuggestions(activeFile)
      setSuggestions(data.suggestions)
    } catch (e: any) {
      setSuggestionsError(getErrorInfo(e))
    } finally { setSuggestionsLoading(false) }
  }

  const retrySuggestions = () => {
    runSuggestions()
  }

  // ── Captions ──────────────────────────────────────────────────────────────
  const runCaptions = async (style: CaptionStyle = captionStyle) => {
    if (!activeFile || captionsLoading) return
    setCaptionsLoading(true); setCaptionsError(null); setCaptions([]); setSelectedCaption(null)
    try {
      const data = await imageService.generateCaptions(activeFile, style)
      setCaptions(data.captions)
    } catch (e: any) {
      setCaptionsError(getErrorInfo(e))
    } finally { setCaptionsLoading(false) }
  }

  const retryCaptions = () => {
    runCaptions()
  }

  const handleStyleChange = (s: CaptionStyle) => {
    setCaptionStyle(s)
    if (captions.length > 0) runCaptions(s)
  }

  const copyCaption = async (text: string, idx: number) => {
    try { await navigator.clipboard.writeText(text); setCopiedCaption(idx); setTimeout(() => setCopiedCaption(null), 2000) }
    catch { /* ignore */ }
  }

  // ─── Position ─────────────────────────────────────────────────────────────
  const posClass = position === 'bottom-left' ? 'left-6' : 'right-6'

  // ─── Mode metadata ────────────────────────────────────────────────────────
  const modes: { id: Mode; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'chat', label: 'Chat', color: 'indigo',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
    },
    {
      id: 'analysis', label: 'Analyze', color: 'emerald',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    },
    {
      id: 'suggestions', label: 'Suggest', color: 'amber',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
    },
    {
      id: 'captions', label: 'Caption', color: 'violet',
      icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
    },
  ]

  // ─── Render mode content ──────────────────────────────────────────────────

  const renderModeContent = () => {
    // ── CHAT ──
    if (mode === 'chat') {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Image context strip */}
          {activeFile && (
            <div className="px-3 pt-2 shrink-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-success/5 border border-success/20 rounded-xl">
                {activePreviewUrl && <img src={activePreviewUrl} alt="" className="w-6 h-6 rounded object-cover" />}
                <p className="text-[10px] text-success font-semibold truncate flex-1">Image context loaded — AI can see your image</p>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6">
                <p className="text-xs font-bold text-primary">Start a conversation</p>
                <p className="text-[10px] text-secondary mt-1 leading-relaxed">
                  {activeFile ? 'I can see your image. Ask anything about it!' : 'Upload an image above or ask a general question.'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                  {getSuggestionsForPath(currentPath).map(chip => (
                    <button key={chip} onClick={() => { setChatInput(chip); chatInputRef.current?.focus() }}
                      className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-magenta/10 border border-magenta/20 text-magenta hover:bg-magenta/20 transition-all">
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(msg => <WidgetMessage key={msg.id} role={msg.role} content={msg.content} thinking={msg.thinking} />)}
                {chatLoading && (
                  <div className="flex gap-2 mr-auto">
                    <div className="w-6 h-6 rounded-lg bg-teal/10 border border-teal/20 flex items-center justify-center shrink-0">
                      <svg className="w-3 h-3 text-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="rounded-2xl rounded-tl-none bg-surface-raised border border-border"><TypingDots /></div>
                  </div>
                )}
                {chatError && (
                  <ErrorDisplay 
                    error={chatError} 
                    onRetry={chatError.retryable ? retryChat : undefined}
                    onDismiss={() => setChatError(null)}
                  />
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border bg-surface-raised p-2.5 flex gap-2 items-end shrink-0">
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setChatError(null); setPendingChatMessage(null) }} title="Clear"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-all mb-[1px] shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
            <textarea ref={chatInputRef} value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={handleChatKey}
              disabled={chatLoading} rows={1} placeholder="Ask something..."
              className="flex-1 bg-surface border border-border rounded-xl px-3 py-2 text-[12.5px] text-primary placeholder-muted outline-none resize-none focus:border-magenta focus:ring-1 focus:ring-magenta/30 transition-all scrollbar-none"
              style={{ height: '36px' }}
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = '36px'; t.style.height = Math.min(t.scrollHeight, 100) + 'px' }} />
            <button onClick={() => sendChat()} disabled={chatLoading || !chatInput.trim()}
              className="w-9 h-9 rounded-xl bg-magenta hover:bg-magenta/90 text-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 shadow-md shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </div>
      )
    }


    // ── ANALYSIS ──
    if (mode === 'analysis') {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 space-y-2 shrink-0">
            <MiniUploader file={activeFile} previewUrl={activePreviewUrl} onUpload={handleUpload} onRemove={handleRemoveImage} />
            <button onClick={runAnalysis} disabled={!activeFile || analysisLoading}
              className="w-full py-2 rounded-xl bg-teal hover:bg-teal/90 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 shadow-md">
              {analysisLoading
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing...</>
                : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>Run Visual Analysis</>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-none">
            {analysisError && (
              <ErrorDisplay 
                error={analysisError} 
                onRetry={analysisError.retryable ? retryAnalysis : undefined}
                onDismiss={() => setAnalysisError(null)}
              />
            )}
            {analysis && !analysisLoading && (
              <div className="space-y-2">
                {[
                  { label: 'Subject', value: analysis.subject },
                  { label: 'Image Type', value: analysis.image_type },
                  { label: 'Background', value: analysis.background_description },
                  { label: 'Suggested Use', value: analysis.suggested_use },
                ].map(card => (
                  <div key={card.label} className="bg-surface-raised border border-border rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-1">{card.label}</p>
                    <p className="text-[12px] text-secondary leading-relaxed">{card.value}</p>
                  </div>
                ))}
                {analysis.editing_recommendations.length > 0 && (
                  <div className="bg-surface-raised border border-border rounded-xl p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted">Editing Roadmap</p>
                    {analysis.editing_recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <span className="w-4 h-4 rounded-full bg-magenta/10 border border-magenta/20 text-magenta text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-[11.5px] text-secondary leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!analysis && !analysisLoading && !analysisError && (
              <div className="h-full flex flex-col items-center justify-center text-center py-8">
                <p className="text-[11px] text-muted">{activeFile ? 'Click "Run Visual Analysis" to get AI insights.' : 'Upload an image to get started.'}</p>
              </div>
            )}
          </div>
        </div>
      )
    }

    // ── SUGGESTIONS ──
    if (mode === 'suggestions') {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 space-y-2 shrink-0">
            <MiniUploader file={activeFile} previewUrl={activePreviewUrl} onUpload={handleUpload} onRemove={handleRemoveImage} />
            <button onClick={runSuggestions} disabled={!activeFile || suggestionsLoading}
              className="w-full py-2 rounded-xl bg-magenta hover:bg-magenta/90 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 shadow-md">
              {suggestionsLoading
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</>
                : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>Get Background Suggestions</>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-none">
            {suggestionsError && (
              <ErrorDisplay 
                error={suggestionsError} 
                onRetry={suggestionsError.retryable ? retrySuggestions : undefined}
                onDismiss={() => setSuggestionsError(null)}
              />
            )}
            {suggestions.length > 0 && !suggestionsLoading && (
              <div className="space-y-2">
                {suggestions.map((sug, i) => (
                  <div key={i} className="flex gap-3 items-start bg-surface border border-border hover:border-magenta rounded-xl p-3 transition-all group">
                    <span className="w-5 h-5 rounded-lg bg-magenta/10 border border-magenta/20 text-magenta text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-[12px] text-secondary leading-relaxed group-hover:text-primary transition-colors">{sug}</p>
                  </div>
                ))}
              </div>
            )}
            {suggestions.length === 0 && !suggestionsLoading && !suggestionsError && (
              <div className="h-full flex items-center justify-center py-8">
                <p className="text-[11px] text-muted text-center">{activeFile ? 'Click the button above to get background recommendations.' : 'Upload an image to get started.'}</p>
              </div>
            )}
          </div>
        </div>
      )
    }


    // ── CAPTIONS ──
    if (mode === 'captions') {
      const stylesList: { id: CaptionStyle; label: string }[] = [
        { id: 'casual', label: 'Casual' },
        { id: 'instagram', label: 'Instagram' },
        { id: 'professional', label: 'LinkedIn' },
        { id: 'product', label: 'Product' },
        { id: 'marketing', label: 'Ad Copy' },
      ]
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 space-y-2 shrink-0">
            <MiniUploader file={activeFile} previewUrl={activePreviewUrl} onUpload={handleUpload} onRemove={handleRemoveImage} />
            {/* Style selector */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {stylesList.map(s => (
                <button key={s.id} onClick={() => handleStyleChange(s.id)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    captionStyle === s.id ? 'bg-magenta/20 border-magenta/40 text-magenta' : 'bg-surface border border-border text-secondary hover:text-primary hover:border-magenta'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
            <button onClick={() => runCaptions(captionStyle)} disabled={!activeFile || captionsLoading}
              className="w-full py-2 rounded-xl bg-teal hover:bg-teal/90 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 shadow-md">
              {captionsLoading
                ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Writing captions...</>
                : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>Generate Captions</>}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 scrollbar-none">
            {captionsError && (
              <ErrorDisplay 
                error={captionsError} 
                onRetry={captionsError.retryable ? retryCaptions : undefined}
                onDismiss={() => setCaptionsError(null)}
              />
            )}
            {captions.length > 0 && !captionsLoading && (
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted px-1">Click a caption to copy it</p>
                {captions.map((cap, i) => (
                  <div key={i} onClick={() => setSelectedCaption(i)}
                    className={`rounded-xl border p-3 cursor-pointer transition-all ${
                      selectedCaption === i ? 'border-magenta/40 bg-magenta/5' : 'border-border bg-surface hover:border-border-strong'
                    }`}>
                    <div className="flex items-start gap-2">
                      <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center text-[9px] font-black border ${
                        selectedCaption === i ? 'bg-magenta border-magenta text-white' : 'bg-surface-raised border-border text-muted'
                      }`}>{i + 1}</span>
                      <p className="text-[11.5px] text-secondary italic leading-relaxed">"{cap}"</p>
                    </div>
                    {selectedCaption === i && (
                      <button onClick={e => { e.stopPropagation(); copyCaption(cap, i) }}
                        className="mt-2 ml-6 px-3 py-1 rounded-lg bg-magenta hover:bg-magenta/90 text-[10px] font-bold text-white flex items-center gap-1.5 transition-all active:scale-95">
                        {copiedCaption === i
                          ? <><svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg><span className="text-success">Copied!</span></>
                          : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 00-2 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>Copy</>}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {captions.length === 0 && !captionsLoading && !captionsError && (
              <div className="h-full flex items-center justify-center py-8">
                <p className="text-[11px] text-muted text-center">{activeFile ? 'Pick a style and generate captions.' : 'Upload an image to get started.'}</p>
              </div>
            )}
          </div>
        </div>
      )
    }


    return null
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* Widget Panel */}
      <div className={`fixed bottom-[5.5rem] ${posClass} z-[9999] transition-all duration-300 ease-out ${
        isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'
      }`} style={{ width: '480px', maxWidth: 'calc(100vw - 24px)' }}>
        <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-border bg-surface backdrop-blur-md"
          style={{ height: 'min(82vh, 680px)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-raised shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-primary leading-none">AI Assistant</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  <p className="text-[9px] text-success font-semibold tracking-wide">
                    {activeFile ? `Image loaded · ${activeFile.name.slice(0, 18)}...` : 'Online · Ready'}
                  </p>
                </div>
              </div>
            </div>
            {activePreviewUrl && (
              <img src={activePreviewUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-border opacity-80 mx-2" />
            )}
            <button onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-raised transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Mode Tabs */}
          <div className="flex border-b border-border bg-surface-raised shrink-0">
            {modes.map(m => {
              const isActive = mode === m.id
              return (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-bold transition-all border-b-2 ${
                    isActive
                      ? 'border-magenta text-magenta bg-magenta/5'
                      : 'border-transparent text-secondary hover:text-primary hover:bg-surface'
                  }`}>
                  {m.icon}
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* Mode Content */}
          {renderModeContent()}
        </div>
      </div>

      {/* Floating Trigger Button */}
      <button onClick={() => { setIsOpen(o => !o); setUnread(0) }}
        className={`fixed bottom-6 ${posClass} z-[9999] w-14 h-14 rounded-2xl bg-gradient-brand text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 border border-white/10 transition-all duration-300`}>
        <div className={`transition-all duration-300 absolute ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </div>
        <div className={`transition-all duration-300 absolute ${isOpen ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        </div>
        {unread > 0 && !isOpen && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white text-[10px] font-black flex items-center justify-center border-2 border-surface">
            {unread}
          </span>
        )}
      </button>
    </>
  )
}

export default ChatbotWidget
