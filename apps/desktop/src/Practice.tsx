import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'

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

function Practice() {
  const navigate = useNavigate()
  
  // Practice quiz state
  const [currentPracticeSheet, setCurrentPracticeSheet] = useState<PracticeSheet | null>(null)
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [userAnswers, setUserAnswers] = useState<string[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showAnswerKey, setShowAnswerKey] = useState(false)

  useEffect(() => {
    // Load practice data from sessionStorage
    const practiceSheetData = sessionStorage.getItem('currentPracticeSheet')
    const questionsData = sessionStorage.getItem('practiceQuestions')
    
    if (practiceSheetData && questionsData) {
      const sheet = JSON.parse(practiceSheetData) as PracticeSheet
      const questions = JSON.parse(questionsData) as PracticeQuestion[]
      
      setCurrentPracticeSheet(sheet)
      setPracticeQuestions(questions)
      setCurrentQuestionIndex(0)
      setUserAnswers([])
      setShowResults(false)
      setShowAnswerKey(false)
    } else {
      // No practice data found, redirect to home
      navigate('/', { replace: true })
    }
  }, [])


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

          // Call backend to store results
          await invoke('complete_practice_sheet', {
            practiceSheetId: currentPracticeSheet.id,
            userAnswers: newAnswers,
            score: score,
            totalQuestions: practiceQuestions.length
          })

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

  const handleBackToPracticeSheets = () => {
    // Clear sessionStorage and navigate back to home with practice sheets open
    sessionStorage.removeItem('currentPracticeSheet')
    sessionStorage.removeItem('practiceQuestions')
    sessionStorage.setItem('showPracticeSheets', 'true')
    navigate('/', { replace: true })
  }


  if (!currentPracticeSheet || !practiceQuestions.length) {
    return null // Will be redirected by useEffect
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '12px 20px', 
        backgroundColor: '#ffffff', 
        borderBottom: '1px solid #e5e7eb'
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', margin: 0 }}>
          {currentPracticeSheet.title}
        </h1>
        <button
          onClick={handleBackToPracticeSheets}
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

      {/* Main Content */}
      {!showResults ? (
        // Quiz Interface
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '32px',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            width: '100%'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '32px',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
                padding: '16px 20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#000000' }}>
                  Question {currentQuestionIndex + 1} of {practiceQuestions.length}
                </span>
                <div style={{
                  width: '120px',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${((currentQuestionIndex + 1) / practiceQuestions.length) * 100}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              <div style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '32px',
                lineHeight: '1.5'
              }}>
                {practiceQuestions[currentQuestionIndex]?.question_text}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {practiceQuestions[currentQuestionIndex]?.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelection(option)}
                    style={{
                      padding: '20px 24px',
                      textAlign: 'left',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      backgroundColor: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: '#111827',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6'
                      e.currentTarget.style.backgroundColor = '#f0f9ff'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb'
                      e.currentTarget.style.backgroundColor = '#ffffff'
                    }}
                  >
                    <span style={{ fontWeight: '600', marginRight: '12px', color: '#3b82f6' }}>
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Results Interface  
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '32px',
          backgroundColor: '#f8f9fa'
        }}>
          <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '40px',
              border: '1px solid #e5e7eb',
              textAlign: 'center',
              width: '100%'
            }}>
              <div style={{
                fontSize: '64px',
                marginBottom: '24px'
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
                fontSize: '36px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '12px'
              }}>
                {practiceQuestions.filter((q, index) => 
                  userAnswers[index] === q.correct_answer
                ).length} out of {practiceQuestions.length} correct
              </div>
              <div style={{
                fontSize: '20px',
                color: '#6b7280',
                marginBottom: '40px'
              }}>
                {Math.round((practiceQuestions.filter((q, index) => 
                  userAnswers[index] === q.correct_answer
                ).length / practiceQuestions.length) * 100)}% score
              </div>
            </div>
            
            <div style={{
              marginTop: '24px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <button
                onClick={() => setShowAnswerKey(true)}
                style={{
                  padding: '14px 28px',
                  fontSize: '16px',
                  fontWeight: '600',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6'
                }}
              >
                Answer Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Answer Key Modal */}
      {showAnswerKey && (
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
              marginBottom: '24px'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#111827',
                margin: 0
              }}>
                Answer Key
              </h2>
              <button
                onClick={() => setShowAnswerKey(false)}
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
              {practiceQuestions.map((question, index) => {
                const userAnswer = userAnswers[index];
                const isCorrect = userAnswer === question.correct_answer;
                
                return (
                  <div
                    key={index}
                    style={{
                      padding: '20px',
                      marginBottom: '16px',
                      border: `2px solid ${isCorrect ? '#10b981' : '#ef4444'}`,
                      borderRadius: '12px',
                      backgroundColor: isCorrect ? '#f0fdf4' : '#fef2f2'
                    }}
                  >
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#111827',
                      marginBottom: '12px'
                    }}>
                      {index + 1}. {question.question_text}
                    </div>
                    
                    <div style={{
                      fontSize: '14px',
                      color: '#000000',
                      marginBottom: '8px'
                    }}>
                      Your answer: <span style={{ 
                        color: isCorrect ? '#10b981' : '#ef4444',
                        fontWeight: '600'
                      }}>
                        {userAnswer || 'No answer'}
                      </span>
                    </div>
                    
                    <div style={{
                      fontSize: '14px',
                      color: '#10b981',
                      fontWeight: '600'
                    }}>
                      Correct answer: {question.correct_answer}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Practice