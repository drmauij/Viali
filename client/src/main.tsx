import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./themes/calendar_white.css";
import "./themes/month_white.css";

createRoot(document.getElementById("root")!).render(<App />);
