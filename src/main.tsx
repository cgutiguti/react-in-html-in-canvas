import React from "react";
import { createRoot } from "react-dom/client";
import { Demo } from "./routes/Demo";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
);
