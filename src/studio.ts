/**
 * Sistema unificado de iluminación de estudio oscuro y materiales físicos
 * compartido por las cuatro vistas (Días, Segundos, Nóminas y Años).
 *
 * Dirección de luz común: key light de estudio arriba-izquierda (~35°),
 * plano de apoyo oscuro neutro y sombra de contacto direccional hacia abajo-derecha.
 */

export interface StudioMetal {
  /** Sombra profunda del metal estructural (acero pavonado / grafito). */
  dark: string;
  mid: string;
  light: string;
  spec: string;
  rim: string;
}

export interface StudioBrass {
  dark: string;
  mid: string;
  core: string;
  light: string;
  spec: string;
}

export interface StudioPalette {
  isLight: boolean;
  /** Acero pavonado / grafito estructural (pedestales y columnas). */
  metal: StudioMetal;
  /** Latón envejecido desaturado (filetes, casquillos, aros y monedas). */
  brass: StudioBrass;
  /** Vidrio óptico borosilicato neutro. */
  glassWallLeft: string;
  glassWallMid: string;
  glassWallRight: string;
  glassInnerEdge: string;
  glassOuterEdge: string;
  glassShine: string;
  glassRimWarm: string;
}

export function studioPalette(isLight: boolean): StudioPalette {
  if (isLight) {
    return {
      isLight: true,
      metal: {
        dark: '#7f838a',
        mid: '#b6bac1',
        light: '#dcdfe4',
        spec: '#f2f3f5',
        rim: 'rgba(28, 30, 34, 0.22)',
      },
      brass: {
        dark: '#5e4c30',
        mid: '#876f48',
        core: '#a68c5e',
        light: '#c9b388',
        spec: '#dfd1b2',
      },
      glassWallLeft: 'rgba(42, 46, 52, 0.22)',
      glassWallMid: 'rgba(255, 255, 255, 0.42)',
      glassWallRight: 'rgba(42, 46, 52, 0.24)',
      glassInnerEdge: 'rgba(32, 36, 42, 0.14)',
      glassOuterEdge: 'rgba(54, 58, 66, 0.34)',
      glassShine: 'rgba(255, 255, 255, 0.84)',
      glassRimWarm: 'rgba(214, 198, 170, 0.34)',
    };
  }

  return {
    isLight: false,
    metal: {
      dark: '#101113',
      mid: '#232529',
      light: '#3b3e45',
      spec: '#575b63',
      rim: 'rgba(235, 237, 240, 0.16)',
    },
    brass: {
      dark: '#3b2f1e',
      mid: '#6e593a',
      core: '#9b8156',
      light: '#c4ad82',
      spec: '#ddd0b2',
    },
    glassWallLeft: 'rgba(220, 224, 230, 0.22)',
    glassWallMid: 'rgba(210, 214, 220, 0.06)',
    glassWallRight: 'rgba(218, 210, 196, 0.16)',
    glassInnerEdge: 'rgba(6, 7, 9, 0.48)',
    glassOuterEdge: 'rgba(224, 228, 234, 0.32)',
    glassShine: 'rgba(244, 246, 249, 0.36)',
    glassRimWarm: 'rgba(212, 196, 168, 0.18)',
  };
}

/**
 * Dibuja el plano de estudio común (horizonte sutil + superficie mate oscura que recibe
 * la luz clave desde arriba-izquierda) para que ningún objeto parezca flotar en el vacío.
 */
export function drawStudioSurface(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  surfaceY: number,
  cx: number,
  spanHalf: number,
  isLight: boolean,
): void {
  const horizonY = Math.max(0, Math.min(H * 0.86, surfaceY));

  ctx.save();
  // Plano de apoyo mate desde la línea de horizonte hasta la base del lienzo.
  const planeGrad = ctx.createLinearGradient(0, horizonY, 0, H);
  if (isLight) {
    planeGrad.addColorStop(0, 'rgba(22, 24, 28, 0.055)');
    planeGrad.addColorStop(0.18, 'rgba(22, 24, 28, 0.025)');
    planeGrad.addColorStop(1, 'rgba(22, 24, 28, 0)');
  } else {
    planeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.032)');
    planeGrad.addColorStop(0.14, 'rgba(255, 255, 255, 0.014)');
    planeGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.14)');
    planeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.32)');
  }
  ctx.fillStyle = planeGrad;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // Caída suave de la luz clave superior-izquierda sobre el plano bajo el objeto.
  const poolRx = Math.max(spanHalf * 2.4, W * 0.28);
  const poolRy = Math.max(26, (H - horizonY) * 0.42);
  ctx.save();
  ctx.translate(cx - spanHalf * 0.28, horizonY + poolRy * 0.35);
  ctx.scale(1, poolRy / poolRx);
  const pool = ctx.createRadialGradient(0, 0, poolRx * 0.04, 0, 0, poolRx);
  pool.addColorStop(0, isLight ? 'rgba(255, 255, 255, 0.34)' : 'rgba(246, 244, 238, 0.036)');
  pool.addColorStop(0.6, isLight ? 'rgba(255, 255, 255, 0.08)' : 'rgba(246, 244, 238, 0.01)');
  pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(0, 0, poolRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Arista de horizonte casi imperceptible (da referencia física al plano sin competir con el objeto).
  const lineGrad = ctx.createLinearGradient(cx - poolRx * 1.15, horizonY, cx + poolRx * 1.15, horizonY);
  const edgeCol = isLight ? 'rgba(24, 26, 30, 0.09)' : 'rgba(255, 255, 255, 0.055)';
  lineGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  lineGrad.addColorStop(0.28, edgeCol);
  lineGrad.addColorStop(0.55, edgeCol);
  lineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - poolRx * 1.15, Math.round(horizonY) + 0.5);
  ctx.lineTo(cx + poolRx * 1.15, Math.round(horizonY) + 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Sombra de contacto + penumbra direccional común (luz desde arriba-izquierda → proyección
 * ligeramente hacia abajo-derecha) usada bajo los 4 objetos físicos.
 */
export function drawStudioShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  rx: number,
  ry: number,
  isLight: boolean,
  strength = 1,
): void {
  const s = Math.max(0, Math.min(1.2, strength));
  const layers: ReadonlyArray<[number, number, number, number, number]> = [
    // [dxMul, dyMul, wMul, hMul, alpha]
    // 1. Penumbra proyectada hacia la derecha-abajo por la luz clave superior-izquierda.
    [0.16, 0.36, 1.46, 1.75, (isLight ? 0.16 : 0.52) * s],
    // 2. Sombra media bajo el cuerpo del objeto.
    [0.06, 0.16, 1.14, 1.18, (isLight ? 0.24 : 0.72) * s],
    // 3. Oclusión de contacto nítida exactamente donde apoya la base.
    [0.02, 0.02, 0.96, 0.74, (isLight ? 0.34 : 0.88) * s],
  ];

  for (const [dxMul, dyMul, wMul, hMul, alpha] of layers) {
    const sw = Math.max(2, rx * wMul);
    const sh = Math.max(1.5, ry * hMul);
    ctx.save();
    ctx.translate(cx + rx * dxMul, y + ry * dyMul);
    ctx.scale(1, sh / sw);
    const g = ctx.createRadialGradient(0, 0, sw * 0.12, 0, 0, sw);
    g.addColorStop(0, isLight ? `rgba(20, 18, 16, ${alpha})` : `rgba(0, 0, 0, ${alpha})`);
    g.addColorStop(0.65, isLight ? `rgba(20, 18, 16, ${alpha * 0.38})` : `rgba(0, 0, 0, ${alpha * 0.42})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, sw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Gradiente horizontal de latón envejecido desaturado (key light arriba-izquierda). */
export function agedBrassGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  pal: StudioPalette,
  alpha = 1,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const { dark, mid, core, light, spec } = pal.brass;
  if (alpha >= 0.999) {
    g.addColorStop(0, dark);
    g.addColorStop(0.22, light);
    g.addColorStop(0.32, spec);
    g.addColorStop(0.56, core);
    g.addColorStop(0.82, mid);
    g.addColorStop(0.92, light);
    g.addColorStop(1, dark);
  } else {
    g.addColorStop(0, `rgba(60, 48, 30, ${alpha * 0.72})`);
    g.addColorStop(0.24, `rgba(196, 173, 130, ${alpha})`);
    g.addColorStop(0.34, `rgba(221, 208, 178, ${alpha})`);
    g.addColorStop(0.58, `rgba(155, 129, 86, ${alpha * 0.85})`);
    g.addColorStop(0.86, `rgba(196, 173, 130, ${alpha * 0.78})`);
    g.addColorStop(1, `rgba(59, 47, 30, ${alpha * 0.65})`);
  }
  return g;
}

/** Gradiente cilíndrico de acero pavonado / grafito neutro (key light arriba-izquierda). */
export function gunmetalGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  pal: StudioPalette,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const { dark, mid, light, spec } = pal.metal;
  g.addColorStop(0, dark);
  g.addColorStop(0.18, light);
  g.addColorStop(0.3, spec);
  g.addColorStop(0.54, mid);
  g.addColorStop(0.78, dark);
  g.addColorStop(0.9, light);
  g.addColorStop(1, dark);
  return g;
}
