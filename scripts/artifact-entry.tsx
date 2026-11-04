// artifact-এর জন্য এন্ট্রি: Next.js ছাড়া সরাসরি ব্রাউজারে Simulator রেন্ডার করে
import { createRoot } from "react-dom/client";
import Simulator from "../src/components/Simulator";

const el = document.getElementById("root");
if (el) createRoot(el).render(<Simulator />);
