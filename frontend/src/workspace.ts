import { createContext, useContext } from 'react';

/** Cross-panel actions: open the supplier detail panel and look up a metric's supplied definition. */
export type Workspace = {
  openSupplier: (id: string) => void;
  describe: (field: string) => string | undefined;
};

export const WorkspaceContext = createContext<Workspace>({ openSupplier: () => {}, describe: () => undefined });
export const useWorkspace = () => useContext(WorkspaceContext);
