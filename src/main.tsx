import React from "react";
import { createRoot } from "react-dom/client";
import { RawProjectorDemo } from "./routes/RawProjectorDemo";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RawProjectorDemo />
  </React.StrictMode>,
);
