import { createContext, useContext, useState } from "react";

type Ctx = {
  giroId: string | null;
  setGiroId: (id: string | null) => void;
  ready: boolean;
};

const SelectedGiroContext = createContext<Ctx>({ giroId: null, setGiroId: () => {}, ready: false });

export function SelectedGiroProvider({ children }: { children: React.ReactNode }) {
  // Nessun giro preselezionato all'apertura dell'app: la selezione vive solo
  // in memoria durante la sessione corrente e riparte vuota ad ogni avvio.
  const [giroId, setGiroId] = useState<string | null>(null);

  return (
    <SelectedGiroContext.Provider value={{ giroId, setGiroId, ready: true }}>
      {children}
    </SelectedGiroContext.Provider>
  );
}

export function useSelectedGiro() {
  return useContext(SelectedGiroContext);
}
