export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const TOKEN_KEY = 'igaz.token';
/**
 * Démo en ligne protégée : clé envoyée à l'API pour qu'elle affiche le code de connexion (pas de SMS réel).
 * À définir UNIQUEMENT pour le site de démo protégé par la connexion Vercel, jamais pour un site public.
 */
const DEMO_KEY = process.env.NEXT_PUBLIC_DEMO_ACCESS_KEY;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : la session ne survivra pas au rechargement */
  }
}

/**
 * Appel vers l'API : corps JSON, ou image envoyée telle quelle (Blob). Les erreurs de validation de l'API sont déjà
 * rédigées en français.
 */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'Content-Type': init.body instanceof Blob ? init.body.type : 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(DEMO_KEY && path === '/auth/otp/request' ? { 'x-igaz-demo': DEMO_KEY } : {}),
      },
      body: init.body instanceof Blob ? init.body : init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const raw = data?.message;
    const message = Array.isArray(raw) ? raw.join(' ') : raw ?? 'Une erreur est survenue';
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Une erreur est survenue');
