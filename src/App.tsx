import { useEffect, useRef, useState } from 'react';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<{ features?: { vibeKanbanWebCompanion?: boolean } } | null>(null);
  const [htmlLoaded, setHtmlLoaded] = useState(false);

  useEffect(() => {
    // Load config to check feature flag
    fetch('/config.json')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  useEffect(() => {
    // Load the original HTML content and inject it into the container
    const loadLegacyHTML = async () => {
      try {
        const response = await fetch('/index.original.html');
        const htmlText = await response.text();

        // Parse the HTML to extract just the body content
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const bodyContent = doc.body.innerHTML;

        if (containerRef.current) {
          containerRef.current.innerHTML = bodyContent;
          setHtmlLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load legacy HTML:', error);
      }
    };

    loadLegacyHTML();
  }, []);

  useEffect(() => {
    if (!htmlLoaded) return;

    // Once HTML is loaded, load the boot.js script dynamically using a script tag
    const loadBootScript = () => {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = '/boot.js';
      script.onload = () => console.log('Legacy app boot.js loaded');
      script.onerror = (error) => console.error('Failed to load boot script:', error);
      document.body.appendChild(script);
    };

    loadBootScript();
  }, [htmlLoaded]);

  const showVibeKanban = config?.features?.vibeKanbanWebCompanion !== false;

  return (
    <>
      {/* Vibe Kanban Web Companion - only in development */}
      {import.meta.env.DEV && showVibeKanban && <VibeKanbanWebCompanion />}

      {/* Container for the legacy app HTML */}
      <div ref={containerRef} />
    </>
  );
}

export default App;
