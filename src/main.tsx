import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { createServices } from './app/create-services';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден контейнер приложения.');
const services = createServices();
createRoot(root).render(
  <StrictMode>
    <App
      settings={services.settings}
      generation={services.generation}
      words={services.words}
      grammar={services.grammar}
    />
  </StrictMode>,
);
