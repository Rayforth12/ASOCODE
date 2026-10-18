import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const plantilla = import.meta.env.VITE_PLANTILLA_USUARIO || "";
if (!url || !key || !plantilla.includes("{u}"))
  throw new Error("Falta configurar el archivo .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_PLANTILLA_USUARIO, que debe llevar {u}).");

export const supabase = createClient(url, key);

// El usuario (Id o cédula) se convierte en un correo interno que nunca recibe mensajes.
export const correoDe = u => plantilla.replace("{u}", u.trim().toLowerCase());
