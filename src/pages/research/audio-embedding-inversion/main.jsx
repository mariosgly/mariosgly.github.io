import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AudioInversion from './AudioInversion.tsx'

createRoot(document.getElementById('audio-inversion-root')).render(
  <StrictMode>
    <AudioInversion />
  </StrictMode>,
)
