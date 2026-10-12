import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OpenAIConnectionProvider } from './infrastructure/openai-connection';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден контейнер приложения.');
const provider = new OpenAIConnectionProvider();
createRoot(root).render(<StrictMode><App provider={provider} /></StrictMode>);
