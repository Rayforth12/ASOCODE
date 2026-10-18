import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { TYPES } from "./formularios";
import { Encabezado, Tabla, Detalle } from "./componentes";
import Formulario from "./Formulario";

export default function Asociado({ asociado, uid, salir }) {
  const [sols, setSols] = useState([]);
  const [tipo, setTipo] = useState(null);
  const [ver, setVer] = useState(null);
  const [msg, setMsg] = useState("");

  const cargar = async () => {
    const { data } = await supabase.from("solicitudes").select("*").order("creada_en", { ascending: false });
    setSols(data || []);
  };
  useEffect(() => { cargar(); }, []);

  if (tipo)
    return (
      <>
        <Encabezado sub={asociado.nombre} salir={salir} />
        <Formulario tipo={tipo} asociado={asociado} uid={uid} volver={() => setTipo(null)}
          alAcabar={m => { setTipo(null); setMsg(m); cargar(); }} />
      </>
    );

  return (
    <>
      <Encabezado sub={asociado.nombre} salir={salir} />
      <main className="wrap">
        {msg && <div className="ok">{msg}</div>}
        <h2>¿Qué solicitud necesita hacer?</h2>
        <div className="grid">
          {Object.entries(TYPES).map(([k, v]) => (
            <button key={k} className="card tile" onClick={() => { setMsg(""); setTipo(k); }}>
              <b>{v.t}</b><span className="mut">{v.d}</span>
            </button>
          ))}
        </div>
        <h2>Mis solicitudes</h2>
        <Tabla filas={sols} ver={setVer} />
      </main>
      {ver && <Detalle sol={ver} cerrar={() => setVer(null)} />}
    </>
  );
}
