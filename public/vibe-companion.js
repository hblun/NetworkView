import React from 'react';
import ReactDOM from 'react-dom/client';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';

export const initVibeKanbanCompanion = () => {
  const container = document.createElement('div');
  container.id = 'vibe-kanban-companion-root';
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(VibeKanbanWebCompanion));
};
