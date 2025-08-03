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
  
  // Practice sheet state
  const [showPracticeSheets, setShowPracticeSheets] = useState(false)
  const [practiceSheets, setPracticeSheets] = useState<PracticeSheet[]>([])
  const [currentPracticeSheet, setCurrentPracticeSheet] = useState<PracticeSheet | null>(null)
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<string[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showAnswerKey, setShowAnswerKey] = useState(false)
  const [loadingPractice, setLoadingPractice] = useState(false)
  
  // Memory viewer state
  const [showMemoryViewer, setShowMemoryViewer] = useState(false)
  const [memoryContent, setMemoryContent] = useState('')
  const [loadingMemory, setLoadingMemory] = useState(false)
  
  
  // Redo polling state
  const [redoPollingInterval, setRedoPollingInterval] = useState<number | null>(null)

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

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (redoPollingInterval) {
        clearInterval(redoPollingInterval)
      }
    }
  }, [redoPollingInterval])

  const startRedoPolling = (practiceSheetId: string) => {
    // Clear any existing polling
    if (redoPollingInterval) {
      clearInterval(redoPollingInterval)
    }

    // Poll every 2 seconds to check if redo is ready
    const interval = setInterval(async () => {
      try {
        await loadPracticeSheets()
        
        // Check if the specific practice sheet is now redo ready
        const updatedSheet = practiceSheets.find(sheet => sheet.id === practiceSheetId)
        if (updatedSheet && updatedSheet.is_redo_ready) {
          // Stop polling once redo is ready
          clearInterval(interval)
          setRedoPollingInterval(null)
          console.log('Redo generation completed for practice sheet:', practiceSheetId)
        }
      } catch (error) {
        console.error('Error during redo polling:', error)
      }
    }, 2000)

    setRedoPollingInterval(interval)
    
    // Stop polling after 60 seconds to prevent infinite polling
    setTimeout(() => {
      clearInterval(interval)
      setRedoPollingInterval(null)
    }, 60000)
  }

  const loadPracticeSheets = async () => {
    try {
      const response = await invoke<string>('get_all_practice_sheets')
      const sheets = JSON.parse(response) as PracticeSheet[]
      setPracticeSheets(sheets)
    } catch (error) {
      console.error('Failed to load practice sheets:', error)
    }
  }

  const handlePracticeClick = async () => {
    if (showPracticeSheets) {
      setShowPracticeSheets(false)
      return
    }

    setLoadingPractice(true)
    try {
      await loadPracticeSheets()
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
      
      setCurrentPracticeSheet(sheet)
      setPracticeQuestions(questions)
      setCurrentQuestionIndex(0)
      setUserAnswers([])
      setShowResults(false)
      setShowAnswerKey(false)
    } catch (error) {
      console.error('Failed to load practice questions:', error)
    } finally {
      setLoadingPractice(false)
    }
  }

  const handleAnswerSelection = async (selectedOption: string) => {
    const newAnswers = [...userAnswers]
    newAnswers[currentQuestionIndex] = selectedOption
    setUserAnswers(newAnswers)

    // Move to next question or show results
    if (currentQuestionIndex < practiceQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else {
      // Complete the practice sheet
      if (currentPracticeSheet) {
        try {
          // Calculate score
          const score = practiceQuestions.filter((q, index) => 
            newAnswers[index] === q.correct_answer
          ).length

          // Call backend to store results and start redo generation
          await invoke('complete_practice_sheet', {
            practiceSheetId: currentPracticeSheet.id,
            userAnswers: newAnswers,
            score: score,
            totalQuestions: practiceQuestions.length
          })

          // Start polling for redo completion
          startRedoPolling(currentPracticeSheet.id)

          // Show results after last question
          setShowResults(true)
        } catch (error) {
          console.error('Failed to complete practice sheet:', error)
          // Still show results even if backend call fails
          setShowResults(true)
        }
      }
    }
  }

  const closePracticeSheet = async () => {
    setCurrentPracticeSheet(null)
    setPracticeQuestions([])
    setCurrentQuestionIndex(0)
    setUserAnswers([])
    setShowResults(false)
    setShowAnswerKey(false)
    
    // Refresh practice sheets list to show updated status
    try {
      await loadPracticeSheets()
    } catch (error) {
      console.error('Failed to refresh practice sheets:', error)
    }
    
    // Note: Don't clear polling here - let it continue in background
    // so user can see redo icon appear on the practice sheets list
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

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
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

              <button
                onClick={handlePracticeClick}
                disabled={loadingPractice}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 32px',
                  fontSize: '18px',
                  fontWeight: '500',
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: loadingPractice ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  opacity: loadingPractice ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (!loadingPractice) {
                    e.currentTarget.style.backgroundColor = '#6d28d9'
                  }
                }}
                onMouseOut={(e) => {
                  if (!loadingPractice) {
                    e.currentTarget.style.backgroundColor = '#7c3aed'
                  }
                }}
              >
                📝 Practice
              </button>

              <button
                onClick={handleSessionSummaries}
                disabled={loadingMemory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '16px 32px',
                  fontSize: '18px',
                  fontWeight: '500',
                  backgroundColor: showMemoryViewer ? '#7c3aed' : '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: loadingMemory ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  opacity: loadingMemory ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (!loadingMemory) {
                    e.currentTarget.style.backgroundColor = showMemoryViewer ? '#6d28d9' : '#4f46e5'
                  }
                }}
                onMouseOut={(e) => {
                  if (!loadingMemory) {
                    e.currentTarget.style.backgroundColor = showMemoryViewer ? '#7c3aed' : '#6366f1'
                  }
                }}
              >
                {loadingMemory ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    📚
                    {showMemoryViewer ? 'Hide Summaries' : 'Session Summaries'}
                  </>
                )}
              </button>

            </div>

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

      {/* Practice Sheets List Modal */}
      {showPracticeSheets && !currentPracticeSheet && (
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
            maxWidth: '600px',
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
                Practice Sheets
              </h2>
              <button
                onClick={() => setShowPracticeSheets(false)}
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
              overflow: 'auto'
            }}>
              {practiceSheets.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: '#6b7280',
                  padding: '40px',
                  fontSize: '16px'
                }}>
                  No practice sheets available yet. Complete some sessions to generate practice sheets!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {practiceSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      onClick={() => startPracticeSheet(sheet)}
                      style={{
                        padding: '16px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: '#ffffff',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#f9fafb'
                        e.currentTarget.style.borderColor = '#d1d5db'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#ffffff'
                        e.currentTarget.style.borderColor = '#e5e7eb'
                      }}
                    >
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '500',
                        color: '#1f2937',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        📝 {sheet.title}
                        {sheet.is_redo_ready && (
                          <span style={{ 
                            fontSize: '14px',
                            opacity: 0.7
                          }}>
                            🔄
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        Created: {formatDate(sheet.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Practice Quiz Interface */}
      {currentPracticeSheet && !showResults && (
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
            padding: '32px',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0
              }}>
                {currentPracticeSheet.title}
              </h2>
              <button
                onClick={closePracticeSheet}
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

            {practiceQuestions.length > 0 && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '24px',
                  padding: '12px 16px',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '8px'
                }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>
                    Question {currentQuestionIndex + 1} of {practiceQuestions.length}
                  </span>
                  <div style={{
                    width: '100px',
                    height: '8px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${((currentQuestionIndex + 1) / practiceQuestions.length) * 100}%`,
                      height: '100%',
                      backgroundColor: '#7c3aed',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                <div style={{
                  fontSize: '18px',
                  fontWeight: '500',
                  color: '#1f2937',
                  marginBottom: '24px',
                  lineHeight: '1.5'
                }}>
                  {practiceQuestions[currentQuestionIndex]?.question_text}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {practiceQuestions[currentQuestionIndex]?.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelection(option)}
                      style={{
                        padding: '16px',
                        textAlign: 'left',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '16px',
                        color: '#1f2937',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = '#7c3aed'
                        e.currentTarget.style.backgroundColor = '#faf5ff'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb'
                        e.currentTarget.style.backgroundColor = 'white'
                      }}
                    >
                      <span style={{ fontWeight: '600', marginRight: '8px' }}>
                        {String.fromCharCode(65 + index)}.
                      </span>
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Practice Results */}
      {currentPracticeSheet && showResults && (
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
            padding: '32px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#1f2937',
                margin: 0
              }}>
                Practice Complete!
              </h2>
              <button
                onClick={closePracticeSheet}
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

            {!showAnswerKey ? (
              <>
                <div style={{
                  textAlign: 'center',
                  marginBottom: '32px'
                }}>
                  <div style={{
                    fontSize: '48px',
                    marginBottom: '16px'
                  }}>
                    {(() => {
                      const correctCount = practiceQuestions.filter((q, index) => 
                        userAnswers[index] === q.correct_answer
                      ).length;
                      const percentage = (correctCount / practiceQuestions.length) * 100;
                      if (percentage >= 80) return '🎉';
                      if (percentage >= 60) return '👍';
                      return '📚';
                    })()}
                  </div>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginBottom: '8px'
                  }}>
                    {practiceQuestions.filter((q, index) => 
                      userAnswers[index] === q.correct_answer
                    ).length} out of {practiceQuestions.length} correct
                  </div>
                  <div style={{
                    fontSize: '18px',
                    color: '#6b7280'
                  }}>
                    {Math.round((practiceQuestions.filter((q, index) => 
                      userAnswers[index] === q.correct_answer
                    ).length / practiceQuestions.length) * 100)}% score
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'center'
                }}>
                  <button
                    onClick={() => setShowAnswerKey(true)}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '500',
                      backgroundColor: '#6366f1',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    View Answer Key
                  </button>
                  <button
                    onClick={closePracticeSheet}
                    style={{
                      padding: '12px 24px',
                      fontSize: '16px',
                      fontWeight: '500',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  marginBottom: '24px'
                }}>
                  <h3 style={{
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginBottom: '16px'
                  }}>
                    Answer Key
                  </h3>
                </div>

                <div style={{
                  maxHeight: '400px',
                  overflow: 'auto',
                  marginBottom: '24px'
                }}>
                  {practiceQuestions.map((question, index) => {
                    const userAnswer = userAnswers[index];
                    const isCorrect = userAnswer === question.correct_answer;
                    
                    return (
                      <div
                        key={index}
                        style={{
                          padding: '16px',
                          marginBottom: '16px',
                          border: `2px solid ${isCorrect ? '#10b981' : '#ef4444'}`,
                          borderRadius: '8px',
                          backgroundColor: isCorrect ? '#f0fdf4' : '#fef2f2'
                        }}
                      >
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: '#1f2937',
                          marginBottom: '8px'
                        }}>
                          {index + 1}. {question.question_text}
                        </div>
                        
                        <div style={{
                          fontSize: '14px',
                          color: '#6b7280',
                          marginBottom: '4px'
                        }}>
                          Your answer: <span style={{ 
                            color: isCorrect ? '#10b981' : '#ef4444',
                            fontWeight: '500'
                          }}>
                            {userAnswer || 'No answer'}
                          </span>
                        </div>
                        
                        <div style={{
                          fontSize: '14px',
                          color: '#10b981',
                          fontWeight: '500'
                        }}>
                          Correct answer: {question.correct_answer}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={closePracticeSheet}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '500',
                    backgroundColor: '#374151',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Close Practice Sheet
                </button>
              </>
            )}
          </div>
        </div>
      )}

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

    </div>
  )
}

export default Home