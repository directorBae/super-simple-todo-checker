import React from 'react';
import './web-api.js';
import './undo-keys.js';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './glass.css';
import './day-teams.css';
import './week.css';
import './editor.css';
import './clock-date.css';

createRoot(document.getElementById('root')).render(<App />);
