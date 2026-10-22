import { TYPES, cuerpo } from "./formularios";
import { LOGO } from "./marca";

const VERDE = [47, 125, 31], AMARILLO = [245, 184, 0], GRIS = [95, 111, 85], NEGRO = [0, 0, 0];
const IZQ = 15, ANCHO = 180, LH = 5.6, LIMITE = 280;   // medidas en mm

// La letra estándar de los PDF no trae el símbolo ₡: se escribe CRC. Lo demás que no exista se cambia por "?".
const limpiar = t => String(t ?? "").replace(/₡/g, "CRC ").replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018-\u201D\u2022]/g, "?");
// Para medir el ancho de una palabra: sin kerning (al dibujar no se aplica) y sin tildes (miden igual que la letra sin tilde).
const sinTildes = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const fechaCorta = d => new Date(d).toLocaleDateString("es-CR");
const fechaTexto = ymd => ymd.split("-").reverse().join("/");   // 2026-10-19 -> 19/10/2026

// Solicitudes aprobadas cuya fecha (de aprobación o de envío) cae entre "desde" y "hasta", ambas incluidas.
export function enRango(sols, desde, hasta, campo = "resuelta_en") {
  if (!desde || !hasta) return [];
  const a = new Date(desde + "T00:00:00"), b = new Date(hasta + "T23:59:59.999");
  return sols
    .filter(s => s.estado === "Aprobada" && s[campo] && new Date(s[campo]) >= a && new Date(s[campo]) <= b)
    .sort((x, y) => new Date(x[campo]) - new Date(y[campo]));
}

function encabezado(doc, logo, subtitulo) {
  let x = IZQ;
  if (logo) {
    try {
      const h = 18, w = Math.min(40, h * logo.w / logo.h);
      doc.addImage(logo.data, logo.fmt, IZQ, 11, w, h);
      x = IZQ + w + 5;
    } catch { /* si la imagen no sirve (por ejemplo un SVG), se sigue sin logo */ }
  }
  doc.setTextColor(...VERDE).setFont("helvetica", "bold").setFontSize(18).text("ASOCODE", x, 19);
  doc.setTextColor(...GRIS).setFont("helvetica", "normal").setFontSize(10).text(limpiar(subtitulo), x, 25);
  doc.setDrawColor(...VERDE).setLineWidth(0.9).line(IZQ, 33, 195, 33);
  doc.setDrawColor(...AMARILLO).setLineWidth(0.5).line(IZQ, 34.4, 195, 34.4);
  doc.setTextColor(...NEGRO);
  return 44;
}

/* ---------- La solicitud tal como se llena: el texto del documento y los datos escritos ---------- */

const valoresDe = sol => new Map((sol.datos || []).map(d => [d.etiqueta, d.valor]));

// Convierte el HTML del formulario en "corridas" de texto: letras normales, negritas y valores escritos.
function corridas(nodo, vals, estilo = {}) {
  const out = [];
  nodo.childNodes.forEach(n => {
    if (n.nodeType === 3) out.push({ t: n.textContent, ...estilo });
    else if (n.nodeName === "BR") out.push({ nl: true });
    else if (n.nodeName === "SPAN") out.push({ t: " " + n.textContent + " ", ...estilo });   // etiquetas de las filas
    else if (n.nodeName === "SMALL") out.push({ t: n.textContent, ...estilo }, { nl: true });
    else if (/^(INPUT|SELECT|TEXTAREA)$/.test(n.nodeName)) {
      let v = n.getAttribute("value") ?? vals.get(n.dataset.l) ?? "";
      if (n.dataset.m && /₡/.test(n.previousSibling?.textContent || "")) v = v.replace(/₡\s*/, "");
      out.push({ t: v, valor: true });
    } else if (/^(B|STRONG|I|U)$/.test(n.nodeName)) out.push(...corridas(n, vals, { b: true }));
    else out.push(...corridas(n, vals, estilo));
  });
  return out;
}

// Parte las corridas en palabras, recordando dónde había un espacio en el texto original.
function palabras(runs) {
  const out = []; let esp = false;
  for (const r of runs) {
    if (r.nl) { out.push({ nl: true }); esp = false; continue; }
    const t = limpiar(r.t);
    if (r.valor) {
      if (!t.trim()) { out.push({ w: "", vacio: true, valor: true, esp }); esp = false; continue; }
      t.trim().split(/\s+/).forEach((w, i) => out.push({ w, valor: true, b: true, esp: i ? true : esp }));
      esp = false; continue;
    }
    if (/^\s/.test(t)) esp = true;
    const ws = t.trim().split(/\s+/).filter(Boolean);
    ws.forEach((w, i) => out.push({ w, b: r.b, esp: i ? true : esp }));
    esp = ws.length ? /\s$/.test(t) : esp || /\s/.test(t);
  }
  return out;
}

// Escribe un párrafo con saltos de línea y de página; los valores escritos van en negrita y subrayados.
function parrafo(doc, st, runs, { x0 = IZQ, ancho = ANCHO, centro = false, tam = 10.5, color = NEGRO } = {}) {
  const fuente = b => doc.setFont("helvetica", b ? "bold" : "normal").setFontSize(tam);
  const lineas = [[]]; let usado = 0;
  for (const w of palabras(runs)) {
    if (w.nl) { lineas.push([]); usado = 0; continue; }
    const aw = w.vacio ? 22 : (fuente(w.b), doc.getStringUnitWidth(sinTildes(w.w), { doKerning: false }) * tam / doc.internal.scaleFactor);
    const sp = () => (lineas.at(-1).length && w.esp ? (fuente(false), doc.getTextWidth(" ")) : 0);
    if (lineas.at(-1).length && usado + sp() + aw > ancho) { lineas.push([]); usado = 0; }
    const x = usado + sp();
    lineas.at(-1).push({ ...w, x, ancho: aw });
    usado = x + aw;
  }
  for (const l of lineas) {
    if (st.y + LH > LIMITE) { doc.addPage(); st.y = 20; }
    const total = l.length ? l.at(-1).x + l.at(-1).ancho : 0;
    const base = x0 + (centro ? (ancho - total) / 2 : 0);
    for (const w of l) {
      fuente(w.b); doc.setTextColor(...color);
      if (w.w) doc.text(w.w, base + w.x, st.y);
      if (w.valor) doc.setDrawColor(...GRIS).setLineWidth(0.25).line(base + w.x, st.y + 1, base + w.x + w.ancho, st.y + 1);
    }
    st.y += LH;
  }
}

function caja(doc, st, el, vals) {
  const y0 = st.y;
  st.y += 1;
  parrafo(doc, st, corridas(el, vals), { x0: IZQ + 3, ancho: ANCHO - 6 });
  doc.setDrawColor(...VERDE).setLineWidth(0.5).rect(IZQ, y0 - 4.2, ANCHO, st.y - y0 + 3.4);
  st.y += 3;
}

function bloque(doc, st, el, vals) {
  const c = el.classList;
  if (el.tagName === "IMG" || c.contains("ft")) return;           // el logo va en el encabezado; las fotos de la cédula no van
  if (c.contains("two")) { [...el.children].forEach(col => [...col.children].forEach(x => bloque(doc, st, x, vals))); return; }
  if (c.contains("bx") || c.contains("bx2")) { caja(doc, st, el, vals); return; }
  if (el.tagName === "TEXTAREA") {
    parrafo(doc, st, [{ t: vals.get(el.dataset.l) || "", valor: true }], { x0: IZQ + 6, ancho: ANCHO - 6 });
    st.y += 1.5; return;
  }
  const titulo = c.contains("ti") || c.contains("hd");
  const runs = corridas(el, vals, titulo || el.tagName === "H3" ? { b: true } : {});
  parrafo(doc, st, runs, { centro: titulo, tam: c.contains("hd") ? 11 : 10.5 });
  st.y += c.contains("row") || c.contains("st") ? 0.8 : 2.2;
}

function documento(doc, y, sol) {
  const html = cuerpo(sol.tipo, sol.asociados || {}, fechaCorta(sol.creada_en));
  const raiz = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html").body;
  const vals = valoresDe(sol), st = { y };
  for (const el of raiz.children) bloque(doc, st, el, vals);
  st.y += 4;
  const estado = `Solicitud ${sol.estado.toLowerCase()}${sol.resuelta_en ? " el " + fechaCorta(sol.resuelta_en) : ""}.`;
  parrafo(doc, st, [{ t: estado, b: true }], { tam: 10 });
  if (sol.tipo === "admision")
    parrafo(doc, st, [{ t: "Aprobado Junta Directiva: " + (sol.estado === "Aprobada" ? "Sí" : "Pendiente"), b: true }], { tam: 10 });
  if (sol.motivo_rechazo) parrafo(doc, st, [{ t: "Motivo del rechazo: " + sol.motivo_rechazo }], { tam: 10 });
  parrafo(doc, st, [{ t: "En lugar de firma, la persona adjuntó una foto de su cédula, que queda guardada en el sistema." }], { tam: 9, color: GRIS });
}

/* ---------- Resumen de la semana, pie de página y descargas ---------- */

function resumen(doc, sols, desde, hasta, campo, logo) {
  let y = encabezado(doc, logo, "Solicitudes aprobadas");
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(...NEGRO)
    .text(limpiar(`Del ${fechaTexto(desde)} al ${fechaTexto(hasta)} (por fecha de ${campo === "resuelta_en" ? "aprobación" : "envío"})`), IZQ, y);
  y += 6;
  doc.setFontSize(10).setTextColor(...GRIS).text(`Total: ${sols.length} solicitudes`, IZQ, y);
  y += 9;
  const cols = [["#", 15, 8], ["Fecha", 23, 22], ["Asociado", 45, 62], ["Id", 107, 18], ["Planilla", 125, 20], ["Solicitud", 145, 50]];
  const cabecera = () => {
    doc.setFillColor(...VERDE).rect(IZQ, y - 4.5, ANCHO, 6.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255);
    cols.forEach(([t, x]) => doc.text(t, x + 1, y));
    y += 6.5;
    doc.setFont("helvetica", "normal").setTextColor(...NEGRO);
  };
  cabecera();
  sols.forEach((s, i) => {
    if (y > LIMITE) { doc.addPage(); y = 20; cabecera(); }
    const a = s.asociados || {};
    if (i % 2) doc.setFillColor(240, 247, 232).rect(IZQ, y - 4.5, ANCHO, 6, "F");
    const celdas = [String(i + 1), fechaCorta(s[campo]), a.nombre, a.tarjeta, a.planilla, TYPES[s.tipo]?.t || s.tipo];
    celdas.forEach((t, k) => doc.text(doc.splitTextToSize(limpiar(t) || "—", cols[k][2] - 3)[0], cols[k][1] + 1, y));
    y += 6;
  });
}

function pie(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
    doc.text("ASOCODE - generado el " + fechaCorta(new Date()), IZQ, 290);
    doc.text(`Página ${i} de ${n}`, 195, 290, { align: "right" });
  }
}

// La librería se carga solo cuando se pide un PDF, para que la página abra rápido.
async function nuevoDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: "a4" });
}

const paginaSolicitud = (doc, logo, s) => documento(doc, encabezado(doc, logo, "Solicitud: " + (TYPES[s.tipo]?.t || s.tipo)), s);

export async function construirSolicitud(sol, logo) {
  const doc = await nuevoDoc();
  paginaSolicitud(doc, logo, sol);
  pie(doc);
  return doc;
}

export async function construirSemana(sols, desde, hasta, campo, logo) {
  const doc = await nuevoDoc();
  resumen(doc, sols, desde, hasta, campo, logo);
  sols.forEach(s => { doc.addPage(); paginaSolicitud(doc, logo, s); });
  pie(doc);
  return doc;
}

async function cargarLogo() {
  try {
    const blob = await (await fetch(LOGO)).blob();
    const data = await new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = data; });
    return { data, fmt: /png/i.test(blob.type) ? "PNG" : "JPEG", w: img.width, h: img.height };
  } catch { return null; }   // sin logo, el PDF sale igual
}

export async function descargarSolicitud(sol) {
  const doc = await construirSolicitud(sol, await cargarLogo());
  const f = new Date(sol.resuelta_en || sol.creada_en).toLocaleDateString("sv");
  doc.save(`solicitud_${sol.tipo}_${sol.asociados?.cedula || "sin-cedula"}_${f}.pdf`);
}

export async function descargarSemana(sols, desde, hasta, campo) {
  const doc = await construirSemana(sols, desde, hasta, campo, await cargarLogo());
  doc.save(`solicitudes-aprobadas_${desde}_a_${hasta}.pdf`);
}