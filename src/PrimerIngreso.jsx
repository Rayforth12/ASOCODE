import { useState } from "react";
import { supabase } from "./supabase";
import { PREGUNTAS } from "./preguntas";
import { Encabezado } from "./componentes";

// Primer ingreso: clave propia (si venía con una temporal) y pregunta secreta para recuperarla.
export default function PrimerIngreso({ cambiarClave, salir, listo }) {
  const [f, setF] = useState({ clave: "", clave2: "", pregunta: PREGUNTAS[0], respuesta: "" });
  const [error, setError] = useState("");
  const [espera, setEspera] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function guardar(e) {
    e.preventDefault(); setError("");
    if (cambiarClave && (f.clave.length < 8 || f.clave !== f.clave2))
      return setError("La clave nueva debe tener al menos 8 caracteres y escribirse igual las dos veces.");
    if (f.respuesta.trim().length < 3) return setError("Escriba una respuesta.");
    setEspera(true);
    if (cambiarClave) {
      const c = await supabase.auth.updateUser({ password: f.clave, data: { cambiar_clave: false } });
      if (c.error) { setEspera(false); return setError("No se pudo cambiar la clave: " + c.error.message); }
    }
    const p = await supabase.rpc("guardar_pregunta", { p_pregunta: f.pregunta, p_respuesta: f.respuesta });
    setEspera(false);
    if (p.error) return setError("No se pudo guardar la pregunta: " + p.error.message);
    listo();
  }

  return (
    <>
      <Encabezado sub="Primer ingreso" salir={salir} />
      <main className="wrap">
        <form className="card" style={{ maxWidth: 480, margin: "24px auto" }} onSubmit={guardar}>
          <h2 style={{ marginTop: 0 }}>Antes de continuar</h2>
          {cambiarClave && (
            <>
              <p className="mut">Entró con una clave temporal. Elija su propia clave.</p>
              <label>Clave nueva (mínimo 8 caracteres)</label>
              <input type="password" required value={f.clave} onChange={set("clave")} autoComplete="new-password" />
              <label>Repita la clave</label>
              <input type="password" required value={f.clave2} onChange={set("clave2")} autoComplete="new-password" />
            </>
          )}
          <p className="mut">Si algún día olvida su clave, podrá cambiarla con esta pregunta. Elija una respuesta que otra persona no pueda adivinar.</p>
          <label>Pregunta secreta</label>
          <select value={f.pregunta} onChange={set("pregunta")}>{PREGUNTAS.map(p => <option key={p}>{p}</option>)}</select>
          <label>Respuesta</label>
          <input required value={f.respuesta} onChange={set("respuesta")} autoComplete="off" />
          {error && <p className="err">{error}</p>}
          <p><button className="pri" disabled={espera}>Guardar y continuar</button></p>
        </form>
      </main>
    </>
  );
}
