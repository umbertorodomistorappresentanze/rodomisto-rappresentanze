import { createContext, useContext, useEffect, useState } from "react";

import { storage } from "@/src/utils/storage";

const KEY = "agendavisite_selected_giro";

type Ctx = {
  giroId: string | null;
  setGiroId: (id: string | null) => void;
  ready: boolean;
};

const SelectedGiroContext = createContext<Ctx>({ giroId: null, setGiroId: () => {}, ready: false });

export function SelectedGiroProvider({ children }: { children: React.ReactNode }) {
  const [giroId, setGiroIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string | null>(KEY, null);
      if (saved) setGiroIdState(saved as string);
      setReady(true);
    })();
  }, []);

  const setGiroId = (id: string | null) => {
    setGiroIdState(id);
    if (id) storage.setItem(KEY, id);
    else storage.removeItem(KEY);
  };

  return (
    <SelectedGiroContext.Provider value={{ giroId, setGiroId, ready }}>
      {children}
    </SelectedGiroContext.Provider>
  );
}

export function useSelectedGiro() {
  return useContext(SelectedGiroContext);
}
