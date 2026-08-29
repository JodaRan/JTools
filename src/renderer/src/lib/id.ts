/** Identifiants opaques et stables, sûrs pour les clés Vue et le JSON. */
export const newId = (): string => crypto.randomUUID()

export const now = (): string => new Date().toISOString()
