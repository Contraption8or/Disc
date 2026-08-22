import { createContext, useContext } from "react";

export const DiscContext = createContext(null);

export function useDisc() {
  const ctx = useContext(DiscContext);
  if (!ctx) {
    throw new Error("useDisc must be used within <DiscContext.Provider>");
  }
  return ctx;
}
