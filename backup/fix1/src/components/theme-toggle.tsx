"use client";

import { useEffect } from "react";

export function ThemeToggle() {
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = saved ? saved === "dark" : prefersDark;
    const shell = document.querySelector(".admin-shell");
    shell?.setAttribute("data-theme", next ? "dark" : "light");
    if (next) document.documentElement.dataset.adminTheme = "dark";
    else delete document.documentElement.dataset.adminTheme;
  }, []);
  function toggle() { const shell = document.querySelector(".admin-shell"); const next = shell?.getAttribute("data-theme") !== "dark"; shell?.setAttribute("data-theme", next ? "dark" : "light"); if (next) document.documentElement.dataset.adminTheme = "dark"; else delete document.documentElement.dataset.adminTheme; localStorage.setItem("theme", next ? "dark" : "light"); }
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label="Toggle colour theme" title="Toggle colour theme"><span>◐</span><b>Theme</b></button>;
}
