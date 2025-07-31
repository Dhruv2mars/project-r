import { useNavigate } from 'react-router-dom'

function Home() {
  const navigate = useNavigate()

  const handleStartLearning = () => {
    navigate('/session')
  }

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      backgroundColor: '#f8f9fa' 
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
    </div>
  )
}

export default Home