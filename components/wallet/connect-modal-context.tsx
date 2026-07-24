"use client";

import * as React from "react";

interface ConnectModalContextValue {
  visible: boolean;
  open: () => void;
  close: () => void;
  setVisible: (v: boolean) => void;
}

const ConnectModalContext = React.createContext<ConnectModalContextValue | null>(
  null
);

export function ConnectModalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [visible, setVisible] = React.useState(false);

  const value = React.useMemo<ConnectModalContextValue>(
    () => ({
      visible,
      open: () => setVisible(true),
      close: () => setVisible(false),
      setVisible,
    }),
    [visible]
  );

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
    </ConnectModalContext.Provider>
  );
}

/** Access the Connect-Wallet modal visibility controls. */
export function useConnectModal() {
  const ctx = React.useContext(ConnectModalContext);
  if (!ctx) {
    throw new Error("useConnectModal must be used within <ConnectModalProvider>");
  }
  return ctx;
}
