# Portal ASOCODE

React + Vite + Supabase. Sitio estático: no hay servidor que mantener.

## Cómo entra la gente
- **Asociados:** escriben su Id y su clave. Las cuentas las crea `herramientas/crear_cuentas.py` con una clave temporal;
  en el primer ingreso cambian la clave y eligen una pregunta secreta.
- **Nuevos:** pestaña «Soy nuevo» (cédula y clave). Solo ven la solicitud de admisión. El administrador la revisa en
  «Nuevos ingresos», escribe el número de Id que les asigna y quedan como asociados (siguen entrando con su cédula).
- **Clave olvidada:** pestaña «Olvidé mi clave» (usuario, pregunta secreta y respuesta). Con 5 fallos, la cuenta queda
  bloqueada 30 minutos.
- Por dentro, cada usuario es un correo interno que nunca recibe mensajes. Se arma con `VITE_PLANTILLA_USUARIO`.

## Puesta en marcha
1. **Supabase:** crear el proyecto (a nombre de la asociación) y ejecutar `supabase/schema.sql` en el *SQL Editor*.
2. **Authentication > Sign In / Providers > Email:** apagar «Confirm email» y dejar encendido «Allow new users to sign up».
3. **`.env`** (modelo en `.env.example`): URL, clave publicable (`sb_publishable_...`) y `VITE_PLANTILLA_USUARIO`.
   Para probar: `tucorreo+{u}@gmail.com`. En producción: `{u}@dominio-de-la-asociacion.com`. El dominio debe tener
   registros de correo (MX), porque Supabase rechaza dominios sin ellos; sirve el reenvío gratuito del proveedor.
4. Probar en local: `npm install` y `npm run dev`.
5. **Primer administrador:** crear una cuenta con «Soy nuevo» y ejecutar la línea comentada al final de `schema.sql`.
6. **Vercel:** subir a GitHub, importar el proyecto y agregar las tres variables del `.env`.
7. **Cuentas de los asociados** (una sola vez, con el dominio ya definitivo, porque el sufijo queda en cada cuenta):
   - `pip install openpyxl`, y en `herramientas`: `python preparar_asociados.py Listado.xlsx` (revisa el Excel).
   - Definir `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (clave *service_role*, pestaña «Anónimo heredado») y
     `PLANTILLA_USUARIO` (igual a la del `.env`); ver el comienzo de `crear_cuentas.py`.
   - `python crear_cuentas.py Listado.xlsx` crea las cuentas y deja `claves_temporales.csv`: se entrega a cada persona y se borra.
   - La clave *service_role* nunca va en el `.env` de la página ni en GitHub.

## Estructura
- `src/formularios.js`: texto y campos de cada solicitud (copian los PDF). Aquí se cambia un texto o se agrega un campo.
- `src/Login.jsx`: entrar, «Soy nuevo» y «Olvidé mi clave». `src/PrimerIngreso.jsx`: clave propia y pregunta secreta.
- `src/Asociado.jsx` y `src/Formulario.jsx`: pantalla del asociado y llenado de solicitudes con fotos de cédula.
- `src/NuevoIngreso.jsx`: lo que ve quien aún no es asociado (solo la solicitud de admisión).
- `src/Admin.jsx`: solicitudes, nuevos ingresos e historial por persona. `src/App.jsx` decide qué pantalla ver.

## Pendiente
- Los topes de ₡40.000 se validan solo en la página.
- La lista del administrador trae hasta 1000 solicitudes; si algún día se superan, hay que paginar.
- Si un asociado pierde la clave y la pregunta secreta, no hay forma de recuperar la cuenta desde la página.
