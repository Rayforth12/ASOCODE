import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { TYPES, cuerpo } from "./formularios";

// Reduce la foto (los celulares dan fotos de varios MB) y la convierte a JPEG.
async function reducir(archivo) {
  const img = await createImageBitmap(archivo);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, "image/jpeg", 0.8));
}

export default function Formulario({ tipo, asociado, uid, volver, alAcabar }) {
  const nuevo = !asociado;   // persona que todavía no es asociada: llena la solicitud de admisión
  const ref = useRef(null);
  const fotos = useRef({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const html = useMemo(() => cuerpo(tipo, asociado), [tipo, asociado]);

  async function alCambiar(e) {
    const t = e.target;
    if (t.type !== "file" || !t.files[0]) return;
        let blob;
    try { blob = await reducir(t.files[0]); }
    catch { t.value = ""; return setError("No se pudo leer esa foto. Use una foto en formato JPG, PNG o WEBP."); }
    setError("");
    fotos.current[t.name] = blob;                       // "cf" = frente, "cr" = reverso
    const vista = t.nextElementSibling;
    vista.src = URL.createObjectURL(blob);
    vista.hidden = false;
  }

    // Los campos del formulario vienen como HTML y React no ve sus eventos "change": se escucha directo.
  useEffect(() => {
    const f = ref.current;
    f.addEventListener("change", alCambiar);
    return () => f.removeEventListener("change", alCambiar);
  }, []);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    const f = ref.current;
    if (tipo === "cred" && ![...f.querySelectorAll("[data-g]")].some(x => x.value))
      return setError("Anote el monto en al menos una de las cuatro opciones.");
    if (!fotos.current.cf || !fotos.current.cr)
      return setError("Espere a que carguen las dos fotos de la cédula e intente de nuevo.");

    const dato = x => (f.querySelector(`[data-l="${x}"]`)?.value || "");
    if (nuevo && !/^(\d{9}|\d{12})$/.test(dato("Cédula").replace(/\D/g, "")))
      return setError("Revise el número de cédula.");
    
    if (nuevo && !/^[A-Za-z0-9._-]+$/.test(dato("Código de trabajador").trim()))
      return setError("Escriba su Id en «código de trabajador».");
    if (tipo === "renun" && !window.confirm("Al enviar esta solicitud ya no podrá entrar a la página con su cuenta. Para volver tendría que pedir su ingreso como nuevo. ¿Desea continuar?")) return;
    setEnviando(true);
    const datos = [...f.querySelectorAll("[data-l]")]
      .filter(x => !x.dataset.skip && x.value)
      .map(x => ({
        etiqueta: x.dataset.l,
        valor: x.dataset.m ? "₡" + (+x.value).toLocaleString("de-DE") : x.value,
      }));

    const base = `${uid}/${crypto.randomUUID()}`;
    const frente = `${base}-frente.jpg`, reverso = `${base}-reverso.jpg`;
    const bucket = supabase.storage.from("cedulas");
    const [a, b] = await Promise.all([
      bucket.upload(frente, fotos.current.cf, { contentType: "image/jpeg" }),
      bucket.upload(reverso, fotos.current.cr, { contentType: "image/jpeg" }),
    ]);
    let err = a.error || b.error;
    if (!err) {
      const [tabla, fila] = nuevo
        ? ["ingresos", { nombre: dato("Nombre"), cedula: dato("Cédula").replace(/\D/g, ""), tarjeta: dato("Código de trabajador").trim(), correo: dato("Correo electrónico").trim().toLowerCase(), datos, datos, cedula_frente: frente, cedula_reverso: reverso }]
        : ["solicitudes", { asociado_id: asociado.id, tipo, datos, cedula_frente: frente, cedula_reverso: reverso }];
      ({ error: err } = await supabase.from(tabla).insert(fila));
    }
    if (err) { setEnviando(false); return setError("No se pudo enviar la solicitud. Intente de nuevo."); }
    
    if (tipo === "renun") {
      sessionStorage.setItem("aviso", "Su solicitud de renuncia fue enviada y su cuenta se cerró.");
      return supabase.auth.signOut({ scope: "local" });
    }
    alAcabar("Solicitud enviada. Queda pendiente de aprobación.");
  }

  return (
    <main className="wrap">
      <button className="ghost" onClick={volver}>Volver</button>
      <form ref={ref} className="doc card" onSubmit={enviar} aria-label={TYPES[tipo].t}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {error && <div className="err">{error}</div>}
        <p><button className="pri" disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitud"}</button></p>
      </form>
    </main>
  );
}
