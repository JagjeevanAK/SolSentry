import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ChatPage } from '@/pages/ChatPage';
import { ResultPage } from '@/pages/ResultPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/result/:jobId" element={<ResultPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
