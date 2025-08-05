import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { Session, Message, PracticeSheet, PracticeQuestion } from '../types'

function Home() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(false)
  
  // Practice sheets state
  const [showPracticeSheets, setShowPracticeSheets] = useState(false)
  const [loadingPractice, setLoadingPractice] = useState(false)
  
  // Memory viewer state
  const [showMemoryViewer, setShowMemoryViewer] = useState(false)
  const [loadingMemory, setLoadingMemory] = useState(false)

  // Get state and actions from Zustand store
  const {
    sessions,
    messages,
    practiceSheets,
    userMemory,
    loadSessions,
    selectSession,
    deleteSession,
    loadPracticeSheets,
    loadUserMemory
  } = useAppStore()

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // Separate useEffect to handle practice sheets navigation
  useEffect(() => {
    // Check if we should open practice sheets (coming back from practice quiz)
    const shouldShowPracticeSheets = sessionStorage.getItem('showPracticeSheets')
    if (shouldShowPracticeSheets === 'true') {
      sessionStorage.removeItem('showPracticeSheets')
      handlePracticeClick()
    }
  }, []) // This will run after the component mounts and handlePracticeClick is defined

  const handleStartLearning = () => {
    navigate('/session')
  }

  const handleMemoryClick = async () => {
    if (showMemoryViewer) {
      setShowMemoryViewer(false)
      return
    }

    setLoadingMemory(true)
    try {
      await loadUserMemory()
      setShowMemoryViewer(true)
    } catch (error) {
      console.error('Failed to load memory content:', error)
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
      // For now, we'll create mock questions. In a full implementation,
      // this would load from storage or generate via API
      const mockQuestions: PracticeQuestion[] = [
        {
          id: '1',
          practice_sheet_id: sheet.id,
          question_text: 'What is Python?',
          options: ['A programming language', 'A snake', 'A framework', 'A database'],
          correct_answer: 'A programming language',
          question_order: 1
        },
        // Add more mock questions as needed
      ]
      
      // Store the practice data in sessionStorage for the separate interface
      sessionStorage.setItem('currentPracticeSheet', JSON.stringify(sheet))
      sessionStorage.setItem('practiceQuestions', JSON.stringify(mockQuestions))
      
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
      await selectSession(session)
      setSelectedSession(session)
    } catch (error) {
      console.error('Failed to load session:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this session?')) {
      try {
        await deleteSession(sessionId)
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null)
        }
      } catch (error) {
        console.error('Failed to delete session:', error)
      }
    }
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
      {/* Left Sidebar */}
      <div style={{
        width: sidebarCollapsed ? '60px' : '320px',
        backgroundColor: '#ffffff',
        borderRight: '1px solid #e5e7eb',
        transition: 'width 0.3s ease',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {!sidebarCollapsed && (
            <h1 style={{
              fontSize: '18px',
              fontWeight: '600',
              color: '#000000',
              margin: 0
            }}>
              Project-R
            </h1>
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

        {/* Action Buttons */}
        {!sidebarCollapsed && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={handleMemoryClick}
                disabled={loadingMemory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: '500',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: loadingMemory ? 'default' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: loadingMemory ? 0.6 : 1
                }}
                onMouseOver={(e) => {
                  if (!loadingMemory) {
                    e.currentTarget.style.backgroundColor = '#e5e7eb'
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6'
                }}
              >
                {loadingMemory ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  '🧠'
                )}
                Memory
              </button>
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!sidebarCollapsed && (
            <div style={{
              padding: '16px 20px 8px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Recent Sessions
            </div>
          )}
          
          <div style={{ flex: 1, overflow: 'auto' }}>
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSessionClick(session)}
                style={{
                  padding: sidebarCollapsed ? '12px 8px' : '12px 20px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: selectedSession?.id === session.id ? '#f0f9ff' : 'transparent',
                  borderLeft: selectedSession?.id === session.id ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  {!sidebarCollapsed && (
                    <>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#111827',
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {session.title}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280'
                      }}>
                        {formatDate(session.updated_at)}
                      </div>
                    </>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      color: '#9ca3af',
                      transition: 'all 0.2s ease',
                      opacity: 0
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef2f2'
                      e.currentTarget.style.color = '#ef4444'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#9ca3af'
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
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
                onClick={() => setSelectedSession(null)}
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
              overflow: 'auto',
              padding: '20px',
              backgroundColor: '#ffffff'
            }}>
              {loading ? (
                <div style={{ textAlign: 'center', marginTop: '40px' }}>
                  <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : messages.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  color: '#6b7280',
                  fontSize: '16px',
                  marginTop: '40px'
                }}>
                  No messages in this session yet.
                </div>
              ) : (
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        marginBottom: '20px',
                        display: 'flex',
                        justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{
                        maxWidth: '70%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: message.role === 'user' ? '#3b82f6' : '#f3f4f6',
                        color: message.role === 'user' ? 'white' : '#000000'
                      }}>
                        <div style={{ fontSize: '14px', lineHeight: '1.5' }}>
                          {message.content}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          marginTop: '6px',
                          opacity: 0.7
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
          // Welcome Screen
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff'
          }}>
            <div style={{
              textAlign: 'center',
              maxWidth: '600px',
              padding: '40px'
            }}>
              <div style={{
                fontSize: '64px',
                marginBottom: '24px'
              }}>
                🚀
              </div>
              
              <h1 style={{
                fontSize: '42px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '16px',
                lineHeight: '1.2'
              }}>
                Welcome to Project-R
              </h1>
              
              <p style={{
                fontSize: '20px',
                color: '#6b7280',
                marginBottom: '40px',
                lineHeight: '1.6'
              }}>
                Your AI-powered Python learning companion. Start a new session to begin coding with voice interaction, or practice with existing materials.
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
              <h3 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: '#111827',
                margin: 0
              }}>
                Memory Content
              </h3>
              <button
                onClick={() => setShowMemoryViewer(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
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
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <pre style={{
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#374151',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {userMemory || 'No memory content available yet.'}
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