import { createContext } from 'react'

// Acciones compartidas con nodos y aristas (p. ej. guardar un punto del historial de deshacer).
export const ActionsContext = createContext({ takeSnapshot: () => {} })
