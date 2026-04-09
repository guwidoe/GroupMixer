import { getRuntime } from '../../services/runtime';
import type { RuntimeCatalogActions, RuntimeCatalogState, StoreSlice } from '../types';

export const initialRuntimeCatalogState: RuntimeCatalogState = {
  runtimeSolverCatalog: [],
  runtimeSolverCatalogStatus: 'idle',
  runtimeSolverCatalogError: null,
};

export const createRuntimeCatalogSlice: StoreSlice<RuntimeCatalogState & RuntimeCatalogActions> = (set, get) => {
  let loadPromise: Promise<void> | null = null;

  return {
    ...initialRuntimeCatalogState,

    loadRuntimeSolverCatalog: async () => {
      if (get().runtimeSolverCatalogStatus === 'ready') {
        return;
      }

      if (loadPromise) {
        return loadPromise;
      }

      set({
        runtimeSolverCatalogStatus: 'loading',
        runtimeSolverCatalogError: null,
      });

      loadPromise = (async () => {
        try {
          const runtime = getRuntime();
          await runtime.initialize();
          const response = await runtime.listSolvers();

          if (response.solvers.length === 0) {
            throw new Error('Runtime discovery returned no supported solver families.');
          }

          set({
            runtimeSolverCatalog: response.solvers,
            runtimeSolverCatalogStatus: 'ready',
            runtimeSolverCatalogError: null,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set({
            runtimeSolverCatalog: [],
            runtimeSolverCatalogStatus: 'error',
            runtimeSolverCatalogError: message || 'Unknown runtime discovery error',
          });
          throw error;
        } finally {
          loadPromise = null;
        }
      })();

      return loadPromise;
    },
  };
};
