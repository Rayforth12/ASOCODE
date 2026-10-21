import { Fragment, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { TYPES } from "./formularios";
import { LOGO } from "./marca";
import { descargarSolicitud } from "./pdf";

const fecha = d => new Date(d).toLocaleDateString("es-CR");

export const Encabezado = ({ sub, salir }) => (
  <header className="top">
    <div className="marca"><img src={LOGO} alt="ASOCODE" /><span><b>ASOCODE</b> <span className="mut">{sub}</span></span></div>
    <button className="ghost" onClick={salir}>Salir</button>
  </header>
);

export function Tabla({ filas, admin, ver, pdf }) {
  if (!filas.length) return <p className="mut">Todavía no hay solicitudes.</p>;
  return (
    <div className="tw">
      <table>
        <thead><tr><th>Fecha</th>{admin && <th>Asociado</th>}<th>Solicitud</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {filas.map(s => (
            <tr key={s.id}>
              <td>{fecha(s.creada_en)}</td>
              {admin && <td>{s.asociados?.nombre}</td>}
              <td>{TYPES[s.tipo].t}</td>
              <td><span className={"b " + s.estado}>{s.estado}</span></td>
              <td><button className="ghost" onClick={() => ver(s)}>Ver</button>{pdf && <> <button className="ghost" onClick={() => pdf(s)}>PDF</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Detalle({ sol, admin, cerrar, resolver }) {
  const [fotos, setFotos] = useState([]);
  useEffect(() => {
    const bucket = supabase.storage.from("cedulas");
    Promise.all([sol.cedula_frente, sol.cedula_reverso].map(p => bucket.createSignedUrl(p, 600)))
      .then(r => setFotos(r.map(x => x.data?.signedUrl)));
  }, [sol.id]);

  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && cerrar()}>
      <div className="card mo">
        <h2 style={{ marginTop: 0 }}>{TYPES[sol.tipo].t}</h2>
        <p><span className={"b " + sol.estado}>{sol.estado}</span></p>
        <dl className="kv">
          {admin && (
            <>
              <dt>Asociado</dt><dd>{sol.asociados?.nombre}</dd>
              <dt>Cédula y tarjeta</dt><dd>{sol.asociados?.cedula}, {sol.asociados?.tarjeta}</dd>
            </>
          )}
          <dt>Fecha</dt><dd>{fecha(sol.creada_en)}</dd>
          {sol.datos.map((d, i) => <Fragment key={i}><dt>{d.etiqueta}</dt><dd>{d.valor}</dd></Fragment>)}
          {sol.motivo_rechazo && <><dt>Motivo del rechazo</dt><dd>{sol.motivo_rechazo}</dd></>}
          <dt>Cédula</dt>
          <dd className="im">{fotos.map((u, i) => u && <img key={i} src={u} alt={i ? "Cédula, parte trasera" : "Cédula, parte frontal"} />)}</dd>
        </dl>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 0 }}>
          {admin && sol.estado === "Pendiente" && (
            <>
              <button className="pri" onClick={() => resolver(sol, "Aprobada")}>Aprobar</button>
              <button className="dng" onClick={() => resolver(sol, "Rechazada")}>Rechazar</button>
            </>
          )}
          {admin && <button className="ghost" onClick={() => descargarSolicitud(sol)}>Descargar PDF</button>}
          <button className="ghost" onClick={cerrar}>Cerrar</button>
        </p>
      </div>
    </div>
  );
}
