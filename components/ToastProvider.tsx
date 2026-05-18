"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          color: "#0f172a",
          fontSize: "14px",
        },
        success: {
          iconTheme: {
            primary: "#047857",
            secondary: "#ffffff",
          },
        },
        error: {
          iconTheme: {
            primary: "#e11d48",
            secondary: "#ffffff",
          },
        },
      }}
    />
  );
}
