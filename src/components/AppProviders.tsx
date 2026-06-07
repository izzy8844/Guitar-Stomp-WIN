"use client";

import ToastContainer from "@/components/Toast";

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}
