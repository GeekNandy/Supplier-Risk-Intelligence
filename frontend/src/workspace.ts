import { createContext, useContext } from 'react';
import type { Dataset } from './dataset';

/** Cross-panel state and actions: the loaded dataset, the supplier drawer and metric definitions. */
export type Workspace = {
  dataset: Dataset | null;
  openSupplier: (id: string) => void;
  describe: (field: string) => string | undefined;
};

export const WorkspaceContext = createContext<Workspace>({ dataset: null, openSupplier: () => {}, describe: () => undefined });
export const useWorkspace = () => useContext(WorkspaceContext);
