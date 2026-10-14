// Imagen para compartir: el reloj tal como está, con lo que queda (en su unidad) y el porcentaje.
// No incluye la fecha de nacimiento ni ningún otro dato personal.

export const SHARE_URL = 'https://relojdejubilacion.com';

export interface ShareInfo {
  /** «7717» ya formateado. */
  remaining: string;
  /** «días laborables», «nóminas», «segundos de trabajo»… */
  what: string;
  /** «31,6 %» ya formateado. */
  percent: string;
  /** 0..1 */
  fraction: number;
}

const CARD_W = 1080;
const CARD_H = 1350;

/** Compone la tarjeta a partir del reloj dibujado aparte (`clock`, fondo transparente). */
export function drawCard(clock: HTMLCanvasElement, info: ShareInfo): HTMLCanvasElement {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const bg = v('--bg');
  const bg2 = v('--bg-2');
  const fg = v('--fg');
  const muted = v('--muted');
  const accent = v('--accent');

  const card = document.createElement('canvas');
  card.width = CARD_W;
  card.height = CARD_H;
  const g = card.getContext('2d')!;

  const grad = g.createRadialGradient(CARD_W / 2, CARD_H * 0.35, 0, CARD_W / 2, CARD_H * 0.35, CARD_H * 0.75);
  grad.addColorStop(0, bg2);
  grad.addColorStop(1, bg);
  g.fillStyle = grad;
  g.fillRect(0, 0, CARD_W, CARD_H);

  const font = (weight: number, size: number) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  g.fillStyle = muted;
  g.font = font(600, 30);
  g.letterSpacing = '6px';
  g.fillText('RELOJ DE JUBILACIÓN', CARD_W / 2, 84);
  g.letterSpacing = '0px';

  g.drawImage(clock, (CARD_W - clock.width) / 2, 100);

  g.fillStyle = accent;
  // Los segundos son un número muy largo: se reduce la letra hasta que quepa.
  let size = 128;
  g.font = font(700, size);
  while (size > 60 && g.measureText(info.remaining).width > CARD_W - 120) g.font = font(700, (size -= 4));
  g.fillText(info.remaining, CARD_W / 2, 1118);

  g.fillStyle = fg;
  g.font = font(500, 42);
  g.fillText(`${info.what} para jubilarme`, CARD_W / 2, 1176);

  const barW = 720;
  const barX = (CARD_W - barW) / 2;
  const barY = 1214;
  g.fillStyle = 'rgba(128,128,128,0.25)';
  g.beginPath();
  g.roundRect(barX, barY, barW, 16, 8);
  g.fill();
  g.fillStyle = accent;
  g.beginPath();
  g.roundRect(barX, barY, Math.max(16, barW * Math.min(1, info.fraction)), 16, 8);
  g.fill();

  g.fillStyle = muted;
  g.font = font(500, 32);
  g.fillText(`${info.percent} completado · relojdejubilacion.com`, CARD_W / 2, 1290);
  return card;
}

/** Medidas del reloj dentro de la tarjeta, para dibujarlo con `Renderer.snapshot`. */
export const CLOCK_SIZE = { width: CARD_W, height: 960 };

export function shareText(info: ShareInfo): string {
  return `Me quedan ${info.remaining} ${info.what} para jubilarme ⏳ ¿Y a ti?`;
}

/**
 * Comparte la imagen con el menú del sistema si el navegador lo permite (móviles, Windows…).
 * Devuelve 'shared', 'cancelled' o 'unsupported' (entonces hay que ofrecer descargarla).
 */
export async function shareImage(blob: Blob, info: ShareInfo): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const file = new File([blob], 'mi-reloj-de-jubilacion.png', { type: 'image/png' });
  const data: ShareData = { files: [file], text: `${shareText(info)} ${SHARE_URL}` };
  if (!navigator.canShare?.(data)) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
