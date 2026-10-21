import { useState } from "react";
import { supabase, correoDe } from "./supabase";
import { PREGUNTAS } from "./preguntas";
import { LOGO } from "./marca";

const pestanas = { entrar: "Entrar", nuevo: "Soy nuevo", olvide: "Olvidé mi clave" };
const botones = { entrar: "Entrar", nuevo: "Crear cuenta", olvide: "Cambiar clave" };

export default function Login() {
  const [modo, setModo] = useState("entrar");
  const [f, setF] = useState({ usuario: "", clave: "", clave2: "", pregunta: PREGUNTAS[0], respuesta: "" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState(() => sessionStorage.getItem("aviso") || "");
  const [espera, setEspera] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const ir = m => { setModo(m); setError(""); setOk(""); };

  async function enviar(e) {
    e.preventDefault(); setError(""); setOk("");
    sessionStorage.removeItem("aviso");
    const usuario = f.usuario.trim();
    const cedula = usuario.replace(/\D/g, "");
    if (modo !== "entrar") {
      if (f.clave.length < 8) return setError("La clave debe tener al menos 8 caracteres.");
      if (f.clave !== f.clave2) return setError("Las dos claves no coinciden.");
      if (modo === "nuevo" && !/^(\d{9}|\d{12})$/.test(cedula)) return setError("Revise el número de cédula.");
    }
    setEspera(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: correoDe(usuario), password: f.clave });
      if (error) setError("El Id o la clave no son correctos.");
    } else if (modo === "nuevo") {
      const { data, error } = await supabase.auth.signUp({
        email: correoDe(cedula), password: f.clave, options: { data: { usuario: cedula } },
      });
      if (error) setError(/registered|exists/i.test(error.message) ? "Ya existe una cuenta con esa cédula. Use «Entrar»." : "No se pudo crear la cuenta: " + error.message);
      else if (!data.session) setError("La cuenta se creó, pero Supabase pide confirmar un correo. Hay que apagar «Confirm email» en Supabase.");
    } else {
      const { data, error } = await supabase.rpc("recuperar_clave", {
        p_usuario: usuario, p_pregunta: f.pregunta, p_respuesta: f.respuesta, p_nueva: f.clave,
      });
      if (error) setError(error.message);
      else if (data) { ir("entrar"); setOk("Clave cambiada. Ya puede entrar con la clave nueva."); }
      else setError("Los datos no coinciden, o la cuenta quedó bloqueada unos minutos por demasiados intentos.");
    }
    setEspera(false);
  }

  return (
    <main className="wrap">
      <form className="card" style={{ maxWidth: 420, margin: "40px auto" }} onSubmit={enviar}>
        <img className="login-logo" src={LOGO} alt="ASOCODE" />
        <h1 style={{ marginTop: 0, textAlign: "center" }}>Portal ASOCODE</h1>
        <div className="tabs">
          {Object.entries(pestanas).map(([k, v]) => (
            <button key={k} type="button" className={"ghost" + (modo === k ? " on" : "")} onClick={() => ir(k)}>{v}</button>
          ))}
        </div>
        {ok && <div className="ok">{ok}</div>}
        {modo === "nuevo" && <p className="mut">Para pedir su ingreso a la asociación. Su cédula será su usuario.</p>}

        <label>Cédula</label>
        <input required value={f.usuario} onChange={set("usuario")} autoComplete="username" />

        {modo === "olvide" && (
          <>
            <label>Pregunta secreta</label>
            <select value={f.pregunta} onChange={set("pregunta")}>
              {PREGUNTAS.map(p => <option key={p}>{p}</option>)}
            </select>
            <label>Respuesta</label>
            <input required value={f.respuesta} onChange={set("respuesta")} autoComplete="off" />
          </>
        )}

        <label>{modo === "olvide" ? "Clave nueva" : "Clave"}</label>
        <input type="password" required value={f.clave} onChange={set("clave")}
          autoComplete={modo === "entrar" ? "current-password" : "new-password"} />
        {modo !== "entrar" && (
          <>
            <label>Repita la clave</label>
            <input type="password" required value={f.clave2} onChange={set("clave2")} autoComplete="new-password" />
          </>
        )}

        {error && <p className="err">{error}</p>}
        <p><button className="pri" disabled={espera}>{botones[modo]}</button></p>
      </form>
    </main>
  );
}
