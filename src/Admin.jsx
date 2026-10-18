import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Encabezado, Tabla, Detalle } from "./componentes";

export default function Admin({ salir }) {
  const [tab, setTab] = useState("sol");
  const [sols, setSols] = useState([]);
  const [aso, setAso] = useState([]);
  const [ings, setIngs] = useState([]);
  const [q, setQ] = useState("");
  const [qa, setQa] = useState("");
  const [est, setEst] = useState("");
  const [sel, setSel] = useState(null);   // asociado cuyo historial se está viendo
  const [ver, setVer] = useState(null);
  const [msg, setMsg] = useState("");

  async function cargar() {
    const [s, a, n] = await Promise.all([
      supabase.from("solicitudes").select("*, asociados(nombre, cedula, tarjeta)").order("creada_en", { ascending: false }),
      supabase.from("asociados").select("*").order("nombre"),
      supabase.from("ingresos").select("*").order("creada_en", { ascending: false }),
    ]);
    setIngs(n.data || []);
    setSols(s.data || []);
    setAso(a.data || []);
  }
  useEffect(() => { cargar(); }, []);

  async function resolver(sol, estado) {
    let motivo = null;
    if (estado === "Rechazada") {
      motivo = window.prompt("Motivo del rechazo (puede dejarlo vacío):");
      if (motivo === null) return;                      // canceló
    }
    const { error } = await supabase.from("solicitudes")
      .update({ estado, motivo_rechazo: motivo || null }).eq("id", sol.id);
    if (error) return setMsg("No se pudo guardar el cambio.");
    setVer(null);
    setMsg("Solicitud " + estado.toLowerCase() + ".");
    cargar();
  }

  async function resolverIngreso(ing, estado) {
    let error;
    if (estado === "Aprobada") {
      ({ error } = await supabase.rpc("aprobar_ingreso", { p_id: ing.id }));
    } else {
      const motivo = window.prompt("Motivo del rechazo (puede dejarlo vacío):");
      if (motivo === null) return;
      ({ error } = await supabase.from("ingresos").update({ estado, motivo_rechazo: motivo || null }).eq("id", ing.id));
    }
    if (error) return setMsg("No se pudo guardar. Si iba a aprobar, revise que la tarjeta, la cédula y el correo no existan ya.");
    setVer(null);
    setMsg("Solicitud de ingreso " + estado.toLowerCase() + ".");
    cargar();
  }

  const buscar = (txt, ...campos) => campos.join(" ").toLowerCase().includes(txt.toLowerCase());
  const filtradas = sols.filter(s => (!est || s.estado === est) && buscar(q, s.asociados?.nombre, s.asociados?.cedula));
  const personas = aso.filter(a => buscar(qa, a.nombre, a.cedula));
  const pendientes = sols.filter(s => s.estado === "Pendiente").length;
  const ingPend = ings.filter(i => i.estado === "Pendiente").length;
  const cambiar = t => { setTab(t); setSel(null); setMsg(""); };

  return (
    <>
      <Encabezado sub="Administración" salir={salir} />
      <main className="wrap">
        {msg && <div className="ok">{msg}</div>}
        <div className="tabs">
          <button className={"ghost" + (tab === "sol" ? " on" : "")} onClick={() => cambiar("sol")}>Solicitudes ({pendientes} pendientes)</button>
          <button className={"ghost" + (tab === "aso" ? " on" : "")} onClick={() => cambiar("aso")}>Asociados</button>
          <button className={"ghost" + (tab === "ing" ? " on" : "")} onClick={() => cambiar("ing")}>Nuevos ingresos ({ingPend} pendientes)</button>
        </div>

        {tab === "sol" && (
          <>
            <div className="fg">
              <div><label>Buscar asociado</label><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o cédula" /></div>
              <div><label>Estado</label>
                <select value={est} onChange={e => setEst(e.target.value)}>
                  {["", "Pendiente", "Aprobada", "Rechazada"].map(o => <option key={o} value={o}>{o || "Todos"}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}><Tabla filas={filtradas} admin ver={setVer} /></div>
          </>
        )}

        {tab === "ing" && (ings.length === 0 ? <p className="mut">No hay solicitudes de ingreso.</p> : (
          <div className="tw">
            <table>
              <thead><tr><th>Fecha</th><th>Nombre</th><th>Cédula</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {ings.map(i => (
                  <tr key={i.id}>
                    <td>{new Date(i.creada_en).toLocaleDateString("es-CR")}</td><td>{i.nombre}</td><td>{i.cedula}</td>
                    <td><span className={"b " + i.estado}>{i.estado}</span></td>
                    <td><button className="ghost" onClick={() => setVer({ ...i, _ingreso: true, tipo: "admision", asociados: { nombre: i.nombre, cedula: i.cedula, tarjeta: "se asigna al aprobar" } })}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === "aso" && !sel && (
          <>
            <label>Buscar asociado</label>
            <input value={qa} onChange={e => setQa(e.target.value)} placeholder="Nombre o cédula" />
            <div className="grid" style={{ marginTop: 12 }}>
              {personas.map(a => {
                const m = sols.filter(s => s.asociado_id === a.id);
                return (
                  <button key={a.id} className="card tile" onClick={() => setSel(a)}>
                    <b>{a.nombre}</b>
                    <span className="mut">Cédula {a.cedula}, {m.length} solicitudes, {m.filter(s => s.estado === "Pendiente").length} pendientes</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === "aso" && sel && (
          <>
            <button className="ghost" onClick={() => setSel(null)}>Volver a asociados</button>
            <h2>Historial de {sel.nombre}</h2>
            <p className="mut">Cédula {sel.cedula}, tarjeta {sel.tarjeta}</p>
            <Tabla filas={sols.filter(s => s.asociado_id === sel.id)} ver={setVer} />
          </>
        )}
      </main>
      {ver && <Detalle sol={ver} admin cerrar={() => setVer(null)} resolver={ver._ingreso ? resolverIngreso : resolver} />}
    </>
  );
}
