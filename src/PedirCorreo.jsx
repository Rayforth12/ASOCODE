import { useState } from "react";
import { supabase } from "./supabase";
import { Encabezado } from "./componentes";

// Se pide una sola vez a quien no tiene correo registrado: sirve para avisarle si una solicitud se rechaza.
export default function PedirCorreo({ salir, listo }) {
  const [correo, setCorreo] = useState("");
  const [error, setError] = useState("");
  const [espera, setEspera] = useState(false);

  async function guardar(e) {
    e.preventDefault(); setError(""); setEspera(true);
    const r = await supabase.rpc("guardar_correo", { p_correo: correo });
    setEspera(false);
    if (r.error) setError("Revise el correo e intente de nuevo.");
    else listo();
  }

  return (
    <>
      <Encabezado sub="Correo para avisos" salir={salir} />
      <main className="wrap">
        <form className="card" style={{ maxWidth: 480, margin: "24px auto" }} onSubmit={guardar}>
          <h2 style={{ marginTop: 0 }}>Su correo electrónico</h2>
          <p className="mut">Lo usaremos solo para avisarle, por ejemplo, si una solicitud suya se rechaza y por qué.</p>
          <label>Correo electrónico</label>
          <input type="email" required value={correo} onChange={e => setCorreo(e.target.value)} autoComplete="email" />
          {error && <p className="err">{error}</p>}
          <p><button className="pri" disabled={espera}>Guardar y continuar</button></p>
        </form>
      </main>
    </>
  );
}