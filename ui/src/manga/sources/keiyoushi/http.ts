/**
 * Cliente HTTP das extensões portadas — fala com o proxy local /api/ext
 * (server/index.ts), que faz o fetch nos sites com allowlist de hosts.
 *
 * Todos os HTML/JSON das fontes Keiyoushi passam por aqui; imagens usam
 * extImage() (o proxy injeta Referer do site para passar no hotlink check).
 *
 * options.headers permite headers que o navegador bloquearia se enviados
 * direto (Origin, Cookie, Referer) ou que o tema exige (rsc, x-flux-node,
 * scan-id, …) — o proxy revalida cada chave contra a allowlist antes de
 * repassar ao site. O cookie devolvido pelo site vem em extGetRaw()/etc.
 */

const PROXY_BASE = '/api/ext';
const TEXT_TIMEOUT_MS = 25000;

export type ExtErrorKind = 'network' | 'blocked' | 'cloudflare' | 'http' | 'parsing';

/** Erro de acesso remoto com mensagem amigável em PT-BR. */
export class ExtError extends Error {
  constructor(
    message: string,
    readonly kind: ExtErrorKind,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ExtError';
  }
}

interface ProxyErrorBody {
  error?: string;
  message?: string;
}

/** Opções comuns de requisição de texto. */
export interface ExtOptions {
  /** Envia X-Requested-With: XMLHttpRequest (endpoints admin-ajax/tRPC). */
  xhr?: boolean;
  /** Headers extras repassados ao site (allowlist no proxy). */
  headers?: Record<string, string>;
  /**
   * Usa HTTP/2 no proxy — alguns endpoints só respondem a conexões h2
   * (como o navegador faz), recebendo 403 "unauthorized" em h1.1
   * (ex.: /api/atfield/key do Aurora).
   */
  h2?: boolean;
}

/** Resposta completa de texto: corpo + cookies setados pelo site. */
export interface ExtResult {
  text: string;
  /**
   * Pares name=value dos cookies `Set-Cookie` da resposta, unidos por "; "
   * (prontos para options.headers.cookie numa chamada seguinte).
   */
  cookies: string;
  /** true quando o site marcou a resposta com header x-encrypted (MangoTheme). */
  encrypted: boolean;
}

/**
 * Cloudflare é intermitente (managed challenge) — como no Mihon, uma nova
 * tentativa costuma passar. Tenta de novo uma vez após 2,5s.
 */
async function withChallengeRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ExtError && error.kind === 'cloudflare') {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return run();
    }
    throw error;
  }
}

async function toExtError(response: Response): Promise<ExtError> {
  let body: ProxyErrorBody | null = null;
  try {
    body = (await response.json()) as ProxyErrorBody;
  } catch {
    /* resposta sem JSON */
  }
  const code = body?.error || body?.message || `HTTP ${response.status}`;
  if (response.status === 503 && code === 'cloudflare') {
    return new ExtError(
      'O site está pedindo verificação de segurança (Cloudflare). Tente novamente em instantes.',
      'cloudflare',
      response.status,
    );
  }
  if (response.status === 403) {
    return new ExtError('O site bloqueou o acesso a este conteúdo.', 'blocked', response.status);
  }
  return new ExtError(`Falha ao acessar o site (${code}).`, 'http', response.status);
}

/** Monta a query string de GET com headers opcionais (JSON). */
function getQuery(url: string, options: ExtOptions): string {
  let query = `url=${encodeURIComponent(url)}${options.xhr ? '&xhr=1' : ''}`;
  if (options.h2) query += '&h2=1';
  if (options.headers && Object.keys(options.headers).length) {
    query += `&hdr=${encodeURIComponent(JSON.stringify(options.headers))}`;
  }
  return query;
}

async function runExtGet(url: string, options: ExtOptions): Promise<ExtResult> {
  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}?${getQuery(url, options)}`, {
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ExtError('O site demorou para responder.', 'network');
    }
    throw new ExtError('Não foi possível conectar ao site.', 'network');
  }
  if (!response.ok) throw await toExtError(response);
  return readExtResult(response);
}

async function runExtPost(
  body: Record<string, unknown>,
  options: ExtOptions,
): Promise<ExtResult> {
  let response: Response;
  try {
    response = await fetch(PROXY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, xhr: options.xhr !== false, headers: options.headers }),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ExtError('O site demorou para responder.', 'network');
    }
    throw new ExtError('Não foi possível conectar ao site.', 'network');
  }
  if (!response.ok) throw await toExtError(response);
  return readExtResult(response);
}

/** Lê corpo + cookies + flag x-encrypted da resposta do proxy. */
async function readExtResult(response: Response): Promise<ExtResult> {
  const text = await response.text();
  const cookies = response.headers.get('x-ext-set-cookie') || '';
  const encrypted = response.headers.get('x-ext-encrypted') === '1';
  return { text, cookies, encrypted };
}

/** GET de texto (HTML/JSON) pelo proxy. */
export async function extGet(url: string, options: ExtOptions = {}): Promise<string> {
  return withChallengeRetry(async () => (await runExtGet(url, options)).text);
}

/** GET de texto retornando também os cookies setados pelo site. */
export async function extGetRaw(url: string, options: ExtOptions = {}): Promise<ExtResult> {
  return withChallengeRetry(() => runExtGet(url, options));
}

/** POST de formulário (admin-ajax.php etc.) pelo proxy. */
export async function extPost(
  url: string,
  form: Record<string, string>,
  options: ExtOptions = {},
): Promise<string> {
  return withChallengeRetry(async () => (await runExtPost({ url, form }, options)).text);
}

/** POST de formulário retornando também os cookies setados pelo site. */
export async function extPostRaw(
  url: string,
  form: Record<string, string>,
  options: ExtOptions = {},
): Promise<ExtResult> {
  return withChallengeRetry(() => runExtPost({ url, form }, options));
}

/** POST com corpo JSON (APIs que exigem application/json) pelo proxy. */
export async function extPostJson(
  url: string,
  json: unknown,
  options: ExtOptions = {},
): Promise<string> {
  return withChallengeRetry(async () => (await runExtPost({ url, json }, options)).text);
}

/** POST JSON retornando também cookies e a flag x-encrypted da resposta. */
export async function extPostJsonRaw(
  url: string,
  json: unknown,
  options: ExtOptions = {},
): Promise<ExtResult> {
  return withChallengeRetry(() => runExtPost({ url, json }, options));
}

/**
 * URL de imagem passando pelo proxy de imagem (injeta Referer do site +
 * User-Agent de navegador para passar no hotlink/anti-bot check).
 * URLs http são elevadas para https (conteúdo misto não carrega no app).
 */
export function extImage(url: string): string {
  const normalized = url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
  return `/api/ext/image?url=${encodeURIComponent(normalized)}`;
}
