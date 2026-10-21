import { TYPES } from "./formularios";
import { LOGO } from "./marca";

const VERDE = [47, 125, 31], AMARILLO = [245, 184, 0], GRIS = [95, 111, 85];
const LIMITE = 280;   // dónde termina la hoja (mm)

// La letra estándar de los PDF no trae el símbolo ₡: se escribe CRC. Lo demás que no exista se cambia por "?".
const limpiar = t => String(t ?? "").replace(/₡/g, "CRC ").replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018-\u201D\u2022]/g, "?");
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
  let x = 15;
  if (logo) {
    try {
      const h = 18, w = Math.min(40, h * logo.w / logo.h);
      doc.addImage(logo.data, logo.fmt, 15, 11, w, h);
      x = 15 + w + 5;
    } catch { /* si la imagen no sirve (por ejemplo un SVG), se sigue sin logo */ }
  }
  doc.setTextColor(...VERDE).setFont("helvetica", "bold").setFontSize(18).text("ASOCODE", x, 19);
  doc.setTextColor(...GRIS).setFont("helvetica", "normal").setFontSize(10).text(limpiar(subtitulo), x, 25);
  doc.setDrawColor(...VERDE).setLineWidth(0.9).line(15, 33, 195, 33);
  doc.setDrawColor(...AMARILLO).setLineWidth(0.5).line(15, 34.4, 195, 34.4);
  doc.setTextColor(0, 0, 0);
  return 44;
}

function fila(doc, y, etiqueta, valor) {
  const et = doc.setFont("helvetica", "bold").setFontSize(9).splitTextToSize(limpiar(etiqueta), 44);
  const val = doc.setFont("helvetica", "normal").setFontSize(11).splitTextToSize(limpiar(valor) || "—", 130);
  const alto = Math.max(et.length * 4.2, val.length * 5.2) + 2.5;
  if (y + alto > LIMITE) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...GRIS).text(et, 15, y);
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(0, 0, 0).text(val, 62, y);
  return y + alto;
}

function ficha(doc, sol, logo) {
  const a = sol.asociados || {};
  let y = encabezado(doc, logo, "Solicitud: " + (TYPES[sol.tipo]?.t || sol.tipo));
  const datos = [
    ["Asociado", a.nombre], ["Cédula", a.cedula], ["Id (tarjeta)", a.tarjeta], ["Planilla", a.planilla],
    ["Enviada", sol.creada_en && fechaCorta(sol.creada_en)],
    ["Estado", sol.estado + (sol.resuelta_en ? " el " + fechaCorta(sol.resuelta_en) : "")],
  ];
  for (const [e, v] of datos) y = fila(doc, y, e, v);
  y += 4;
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...VERDE).text("Datos de la solicitud", 15, y);
  doc.setDrawColor(...AMARILLO).setLineWidth(0.4).line(15, y + 1.8, 195, y + 1.8);
  y += 9;
  for (const d of sol.datos || []) y = fila(doc, y, d.etiqueta, d.valor);
  if (sol.motivo_rechazo) y = fila(doc, y, "Motivo del rechazo", sol.motivo_rechazo);
}

function resumen(doc, sols, desde, hasta, campo, logo) {
  let y = encabezado(doc, logo, "Solicitudes aprobadas");
  doc.setFont("helvetica", "normal").setFontSize(11).setTextColor(0, 0, 0)
    .text(limpiar(`Del ${fechaTexto(desde)} al ${fechaTexto(hasta)} (por fecha de ${campo === "resuelta_en" ? "aprobación" : "envío"})`), 15, y);
  y += 6;
  doc.setFontSize(10).setTextColor(...GRIS).text(`Total: ${sols.length} solicitudes`, 15, y);
  y += 9;
  const cols = [["#", 15, 8], ["Fecha", 23, 22], ["Asociado", 45, 62], ["Id", 107, 18], ["Planilla", 125, 20], ["Solicitud", 145, 50]];
  const cabecera = () => {
    doc.setFillColor(...VERDE).rect(15, y - 4.5, 180, 6.5, "F");
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(255, 255, 255);
    cols.forEach(([t, x]) => doc.text(t, x + 1, y));
    y += 6.5;
    doc.setFont("helvetica", "normal").setTextColor(0, 0, 0);
  };
  cabecera();
  sols.forEach((s, i) => {
    if (y > LIMITE) { doc.addPage(); y = 20; cabecera(); }
    const a = s.asociados || {};
    if (i % 2) doc.setFillColor(240, 247, 232).rect(15, y - 4.5, 180, 6, "F");
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
    doc.text("ASOCODE - generado el " + fechaCorta(new Date()), 15, 290);
    doc.text(`Página ${i} de ${n}`, 195, 290, { align: "right" });
  }
}

// La librería se carga solo cuando se pide un PDF, para que la página abra rápido.
async function nuevoDoc() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "mm", format: "a4" });
}

export async function construirSolicitud(sol, logo) {
  const doc = await nuevoDoc();
  ficha(doc, sol, logo);
  pie(doc);
  return doc;
}

export async function construirSemana(sols, desde, hasta, campo, logo) {
  const doc = await nuevoDoc();
  resumen(doc, sols, desde, hasta, campo, logo);
  sols.forEach(s => { doc.addPage(); ficha(doc, s, logo); });
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