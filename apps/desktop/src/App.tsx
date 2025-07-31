import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './Home'
import Session from './Session'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session" element={<Session />} />
      </Routes>
    </Router>
  )
}

export default App