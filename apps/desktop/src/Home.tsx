import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'

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

interface PracticeSheet {
  id: string
  session_id: string
  title: string
  is_completed: boolean
  is_redo_ready: boolean
  created_at: string
}

interface PracticeQuestion {
  id: string
  practice_sheet_id: string
  question_text: string
  options: string[]
  correct_answer: string
  question_order: number
}


function Home() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  
  // Practice sheets state
  const [showPracticeSheets, setShowPracticeSheets] = useState(false)
  const [practiceSheets, setPracticeSheets] = useState<PracticeSheet[]>([])
  const [loadingPractice, setLoadingPractice] = useState(false)
  
  
  // Memory viewer state
  const [showMemoryViewer, setShowMemoryViewer] = useState(false)
  const [memoryContent, setMemoryContent] = useState('')
  const [loadingMemory, setLoadingMemory] = useState(false)
  
  
  

  useEffect(() => {
    loadSessions()
    
    // Check if we should open practice sheets (coming back from practice quiz)
    const shouldShowPracticeSheets = sessionStorage.getItem('showPracticeSheets')
    if (shouldShowPracticeSheets === 'true') {
      sessionStorage.removeItem('showPracticeSheets')
      handlePracticeClick()
    }
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


  // Function to handle session summaries
  const handleSessionSummaries = async () => {
    if (showMemoryViewer) {
      setShowMemoryViewer(false)
      return
    }

    setLoadingMemory(true)
    try {
      const content = await invoke<string>('get_memory_content')
      setMemoryContent(content || 'No session summaries yet. Complete some conversations to see summaries here.')
      setShowMemoryViewer(true)
    } catch (error) {
      setMemoryContent(`Error loading memory content: ${error}`)
      setShowMemoryViewer(true)
    } finally {
      setLoadingMemory(false)
    }
  }



  const handlePracticeClick = async () => {
    if (showPracticeSheets) {
      setShowPracticeSheets(false)
      return
    }

    setLoadingPractice(true)
    try {
      const response = await invoke<string>('get_all_practice_sheets')
      const sheets = JSON.parse(response) as PracticeSheet[]
      setPracticeSheets(sheets)
      setShowPracticeSheets(true)
    } catch (error) {
      console.error('Failed to load practice sheets:', error)
    } finally {
      setLoadingPractice(false)
    }
  }

  const startPracticeSheet = async (sheet: PracticeSheet) => {
    setLoadingPractice(true)
    try {
      const response = await invoke<string>('get_practice_sheet_questions', { practiceSheetId: sheet.id })
      const questions = JSON.parse(response) as PracticeQuestion[]
      
      // Store the practice data in sessionStorage for the separate interface
      sessionStorage.setItem('currentPracticeSheet', JSON.stringify(sheet))
      sessionStorage.setItem('practiceQuestions', JSON.stringify(questions))
      
      // Navigate to practice route
      navigate('/practice')
    } catch (error) {
      console.error('Failed to load practice questions:', error)
    } finally {
      setLoadingPractice(false)
    }
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
    <div style={{ height: '100vh', display: 'flex', backgroundColor: '#f1f5f9' }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarCollapsed ? '60px' : '280px',
        backgroundColor: '#f8f9fa',
        borderRight: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: sidebarCollapsed ? '16px 12px' : '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          backgroundColor: '#f8f9fa'
        }}>
          {!sidebarCollapsed && (
            <h2 style={{ 
              fontSize: '16px', 
              fontWeight: '600', 
              color: '#000000',
              margin: 0
            }}>
              Sessions
            </h2>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              color: '#6b7280',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Session List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: sidebarCollapsed ? '0' : '0' }}>
          {!sidebarCollapsed && sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSessionClick(session)}
              style={{
                padding: '12px 20px',
                cursor: 'pointer',
                backgroundColor: selectedSession?.id === session.id ? '#e5e7eb' : 'transparent',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                if (selectedSession?.id !== session.id) {
                  e.currentTarget.style.backgroundColor = '#f1f3f4'
                }
              }}
              onMouseOut={(e) => {
                if (selectedSession?.id !== session.id) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: selectedSession?.id === session.id ? '600' : '500',
                color: '#000000',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {session.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {showPracticeSheets ? (
          // Practice Sheets List
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#000000',
                margin: 0
              }}>
                Practice Sheets
              </h2>
              <button
                onClick={() => setShowPracticeSheets(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  color: '#6b7280',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Practice Sheets Content */}
            <div style={{
              flex: 1,
              padding: '32px',
              backgroundColor: '#ffffff',
              overflowY: 'auto'
            }}>
              <div style={{
                maxWidth: '1200px',
                margin: '0 auto'
              }}>
                {loadingPractice ? (
                  <div style={{ textAlign: 'center', color: '#000000', fontSize: '16px', marginTop: '40px' }}>
                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }} />
                    Loading practice sheets...
                  </div>
                ) : practiceSheets.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    color: '#000000',
                    padding: '80px 40px',
                    fontSize: '18px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '12px',
                    border: '1px solid #e5e7eb'
                  }}>
                    No practice sheets available yet. Complete some sessions to generate practice sheets!
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                    gap: '24px'
                  }}>
                    {practiceSheets.map((sheet) => (
                      <div
                        key={sheet.id}
                        onClick={() => startPracticeSheet(sheet)}
                        style={{
                          position: 'relative',
                          padding: '24px',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                          minHeight: '160px',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
                          e.currentTarget.style.borderColor = '#e5e7eb'
                        }}
                      >
                        <div style={{
                          fontSize: '18px',
                          fontWeight: '600',
                          color: '#111827',
                          marginBottom: '16px',
                          lineHeight: '1.4',
                          flex: 1
                        }}>
                          📝 {sheet.title}
                        </div>
                        
                        {/* Fixed position for created date and status */}
                        <div style={{
                          marginTop: 'auto'
                        }}>
                          <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            marginBottom: '8px'
                          }}>
                            Created: {formatDate(sheet.created_at)}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: '500',
                            color: sheet.is_completed ? '#10b981' : '#3b82f6',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {sheet.is_completed ? 'Completed' : 'Ready to Start'}
                          </div>
                        </div>
                        
                        {/* Improved Redo Icon */}
                        {sheet.is_redo_ready && (
                          <div style={{
                            position: 'absolute',
                            bottom: '16px',
                            right: '16px',
                            width: '32px',
                            height: '32px',
                            backgroundColor: '#10b981',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                          }}>
                            <div style={{
                              fontSize: '16px',
                              color: 'white',
                              transform: 'rotate(180deg)'
                            }}>
                              ↻
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : selectedSession ? (
          // Session Viewer
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#000000',
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
                  padding: '6px',
                  borderRadius: '6px',
                  color: '#6b7280',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              backgroundColor: '#ffffff'
            }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: '#000000', fontSize: '14px' }}>Loading...</div>
              ) : (
                <div style={{ maxWidth: '100%' }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                        paddingLeft: message.role === 'user' ? '60px' : '0',
                        paddingRight: message.role === 'user' ? '0' : '60px'
                      }}
                    >
                      {message.role === 'user' ? (
                        <div style={{
                          padding: '14px 18px',
                          borderRadius: '18px 18px 4px 18px',
                          backgroundColor: '#d1d5db',
                          fontSize: '15px',
                          lineHeight: '1.4',
                          color: '#000000',
                          whiteSpace: 'pre-wrap',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                        }}>
                          {message.content}
                        </div>
                      ) : (
                        <div style={{
                          fontSize: '15px',
                          lineHeight: '1.4',
                          color: '#000000',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {message.content}
                        </div>
                      )}
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
            justifyContent: 'center',
            backgroundColor: '#ffffff'
          }}>
            <div style={{
              textAlign: 'center',
              maxWidth: '500px',
              margin: '0 32px'
            }}>
              <h1 style={{
                fontSize: '48px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '16px',
                letterSpacing: '-0.5px'
              }}>
                Project-R
              </h1>
              <p style={{
                fontSize: '18px',
                color: '#000000',
                marginBottom: '48px',
                fontWeight: '400'
              }}>
                Your AI-powered Python learning companion
              </p>

              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleStartLearning}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '16px 32px',
                    fontSize: '16px',
                    fontWeight: '600',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: '2px solid #3b82f6',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb'
                    e.currentTarget.style.borderColor = '#2563eb'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#3b82f6'
                    e.currentTarget.style.borderColor = '#3b82f6'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)'
                  }}
                >
                  🚀 Start Learning
                </button>

                <button
                  onClick={handlePracticeClick}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '16px 32px',
                    fontSize: '16px',
                    fontWeight: '600',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: '2px solid #10b981',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669'
                    e.currentTarget.style.borderColor = '#059669'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)'
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#10b981'
                    e.currentTarget.style.borderColor = '#10b981'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  📝 Practice
                </button>

              </div>
            </div>
          </div>
        )}
      </div>

      {/* Memory Viewer Modal */}
      {showMemoryViewer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '800px',
            maxHeight: '80vh',
            width: '90%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0
              }}>
                Session Summaries
              </h2>
              <button
                onClick={() => {
                  setShowMemoryViewer(false)
                  setMemoryContent('')
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '4px'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{
              flex: 1,
              overflow: 'auto',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <pre style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#374151',
                margin: 0
              }}>
                {memoryContent}
              </pre>
            </div>
          </div>
        </div>
      )}


      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default Home