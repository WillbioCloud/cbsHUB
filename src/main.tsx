import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

// IMPORTANTE: NÃO usar <React.StrictMode> nesta aplicação.
// O motor WebRTC é um singleton que abre conexões PeerJS, beacons e pipelines de áudio
// no mount do App. O StrictMode executa os efeitos duas vezes em desenvolvimento,
// o que criava DUAS malhas P2P completas (dois localPeer, dois beacons, sessões
// duplicadas e áudio duplicado) e travava a entrada na chamada.
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
