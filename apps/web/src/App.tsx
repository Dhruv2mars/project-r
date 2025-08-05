import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import Session from './components/Session'
import Practice from './components/Practice'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
        <Route path="/practice" element={<Practice />} />
      </Routes>
    </Router>
  )
}

export default App