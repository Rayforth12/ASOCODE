import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Encabezado } from "./componentes";
import Formulario from "./Formulario";

// Pantalla de quien entra con un correo que todavía no es de un asociado:
// solo puede llenar la solicitud de admisión.
export default function NuevoIngreso({ uid, salir }) {
  const [ing, setIng] = useState(undefined);
  const [msg, setMsg] = useState("");

  const cargar = async () => {
    const { data } = await supabase.from("ingresos").select("*").order("creada_en", { ascending: false }).limit(1);
    setIng(data?.[0] || null);
  };
  useEffect(() => { cargar(); }, []);

  if (ing === undefined) return <p className="wrap mut">Cargando…</p>;

  let cuerpo;
  if (ing?.estado === "Pendiente")
    cuerpo = <div className="card">Su solicitud de ingreso está en revisión. Cuando la Junta Directiva la apruebe, vuelva a entrar con su cédula y su clave.</div>;
  else if (ing?.estado === "Aprobada")
    cuerpo = (
      <div className="card">
        <p style={{ marginTop: 0 }}>Su solicitud fue aprobada. Ya es parte de la asociación.</p>
        <button className="pri" onClick={() => window.location.reload()}>Continuar</button>
      </div>
    );
  else
    return (
      <>
        <Encabezado sub="Nuevo ingreso" salir={salir} />
        <main className="wrap">
          {msg && <div className="ok">{msg}</div>}
          <div className="card" style={{ maxWidth: 780, margin: "12px auto" }}>
            Su usuario todavía no es de un asociado. Para ingresar a la asociación, complete la solicitud de admisión.
            {ing?.estado === "Rechazada" && <p className="err">Su solicitud anterior fue rechazada{ing.motivo_rechazo ? ": " + ing.motivo_rechazo : "."}</p>}
          </div>
          <Formulario tipo="admision" uid={uid} volver={salir}
            alAcabar={m => { setMsg(m); cargar(); }} />
        </main>
      </>
    );

  return (
    <>
      <Encabezado sub="Nuevo ingreso" salir={salir} />
      <main className="wrap">{msg && <div className="ok">{msg}</div>}{cuerpo}</main>
    </>
  );
}
