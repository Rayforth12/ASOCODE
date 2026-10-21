import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import Login from "./Login";
import PrimerIngreso from "./PrimerIngreso";
import Asociado from "./Asociado";
import NuevoIngreso from "./NuevoIngreso";
import Admin from "./Admin";
import PedirCorreo from "./PedirCorreo";

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = todavía cargando
  const [perfil, setPerfil] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = sesion?.user?.id;
  useEffect(() => {
    setPerfil(null);
    if (!uid) return;
    (async () => {
      const [{ data: admin }, { data: tiene }] = await Promise.all([supabase.rpc("es_admin"), supabase.rpc("tiene_pregunta")]);
      const { data: asociado } = admin ? { data: null } : await supabase.from("asociados").select("*").maybeSingle();
      setPerfil({ admin, tiene, asociado });
    })();
  }, [uid, version]);

  const salir = () => supabase.auth.signOut();
  if (sesion === undefined || (sesion && !perfil)) return <p className="wrap mut">Cargando…</p>;
  if (!sesion) return <Login />;

  const cambiarClave = sesion.user.user_metadata?.cambiar_clave === true;
  if (cambiarClave || !perfil.tiene)
    return <PrimerIngreso cambiarClave={cambiarClave} salir={salir} listo={() => setVersion(version + 1)} />;
  if (perfil.asociado && !perfil.asociado.correo)
    return <PedirCorreo salir={salir} listo={() => setVersion(version + 1)} />;
  if (perfil.admin) return <Admin salir={salir} />;
  if (!perfil.asociado) return <NuevoIngreso uid={uid} salir={salir} />;
  return <Asociado asociado={perfil.asociado} uid={uid} salir={salir} />;
}
