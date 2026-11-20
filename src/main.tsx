import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ProfileProvider } from "./profiles/ProfileProvider";
import { StudioProvider } from "./studio/StudioProvider";

const rootElement = document.getElementById("root");

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StudioProvider>
        <ProfileProvider>
          <App />
        </ProfileProvider>
      </StudioProvider>
    </React.StrictMode>,
  );
}
