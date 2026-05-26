import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home/Home'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sessions/:sessionId" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
