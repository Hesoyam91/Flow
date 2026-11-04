import { createContext } from 'react'

// Acciones y ajustes compartidos con nodos y aristas:
// - takeSnapshot: guarda un punto del historial de deshacer.
// - forceDetail: true mientras se exporta, para que ningún elemento use el modo de bajo detalle.
// - addCard: añade una tarjeta al final de una columna.
export const ActionsContext = createContext({ takeSnapshot: () => {}, forceDetail: false, addCard: () => {} })
