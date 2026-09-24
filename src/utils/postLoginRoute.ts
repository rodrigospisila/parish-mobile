/**
 * Para onde voltar depois do login iniciado numa tela pública (ex.: quem
 * estava sugerindo uma correção sem estar logado). Fica só em memória e vence
 * em 30 minutos: se a pessoa desistir do login e entrar mais tarde por outro
 * caminho, cai na Home normalmente. O rascunho da sugestão fica salvo à parte.
 */
const TTL_MS = 30 * 60 * 1000;
let pending: { path: string; at: number } | null = null;

/** Aceita apenas caminhos internos do app ("/comunidade/..."). */
export function setPostLoginRoute(path: string | null) {
  pending = path && path.startsWith('/') && !path.startsWith('//') ? { path, at: Date.now() } : null;
}

export function consumePostLoginRoute(): string | null {
  const p = pending;
  pending = null;
  if (!p || Date.now() - p.at > TTL_MS) return null;
  return p.path;
}
