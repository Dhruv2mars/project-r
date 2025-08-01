import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface Session {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface Message {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
}

function Home() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await invoke<string>('get_all_sessions')
      const sessionList = JSON.parse(response) as Session[]
      setSessions(sessionList)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
  }

  const handleStartLearning = () => {
    navigate('/session')
  }

  const handleSessionClick = async (session: Session) => {
    setLoading(true)
    try {
      const response = await invoke<string>('get_session_messages', { sessionId: session.id })
      const messageList = JSON.parse(response) as Message[]
      setMessages(messageList)
      setSelectedSession(session)
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCloseViewer = () => {
    setSelectedSession(null)
    setMessages([])
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', backgroundColor: '#f8f9fa' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed ? '60px' : '300px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        boxShadow: '2px 0 4px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {!sidebarCollapsed && (
            <h2 style={{ 
              fontSize: '18px', 
              fontWeight: '600', 
              color: '#1f2937',
              margin: 0
            }}>
              Session History
            </h2>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              color: '#6b7280'
            }}
          >
            {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>

        {/* Session List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSessionClick(session)}
              style={{
                padding: sidebarCollapsed ? '12px 8px' : '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                backgroundColor: selectedSession?.id === session.id ? '#f0f9ff' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => {
                if (selectedSession?.id !== session.id) {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                }
              }}
              onMouseOut={(e) => {
                if (selectedSession?.id !== session.id) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              💬
              {!sidebarCollapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#1f2937',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {session.title}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    marginTop: '2px'
                  }}>
                    {formatDate(session.updated_at)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {selectedSession ? (
          // Session Viewer
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0
              }}>
                {selectedSession.title}
              </h2>
              <button
                onClick={handleCloseViewer}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  color: '#6b7280'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              backgroundColor: '#ffffff'
            }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: '#6b7280' }}>Loading...</div>
              ) : (
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        marginBottom: '24px',
                        display: 'flex',
                        flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '16px',
                        backgroundColor: message.role === 'user' ? '#059669' : '#3b82f6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: '600',
                        flexShrink: 0
                      }}>
                        {message.role === 'user' ? 'U' : 'AI'}
                      </div>
                      <div style={{
                        maxWidth: '70%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: message.role === 'user' ? '#f0f9ff' : '#f8fafc',
                        border: '1px solid ' + (message.role === 'user' ? '#e0f2fe' : '#e2e8f0')
                      }}>
                        <div style={{
                          fontSize: '14px',
                          lineHeight: '1.5',
                          color: '#1f2937',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {message.content}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                          marginTop: '8px'
                        }}>
                          {formatDate(message.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // Default Home Content
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <h1 style={{
              fontSize: '48px',
              fontWeight: '600',
              color: '#1f2937',
              marginBottom: '40px'
            }}>
              Project-R
            </h1>

            <button
              onClick={handleStartLearning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '16px 32px',
                fontSize: '18px',
                fontWeight: '500',
                backgroundColor: '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#047857'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#059669'
              }}
            >
              Start Learning
            </button>

            {sessions.length > 0 && (
              <p style={{
                fontSize: '16px',
                color: '#6b7280',
                marginTop: '24px',
                textAlign: 'center'
              }}>
                Select a session from the sidebar to view your conversation history
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Home