-- ASOCODE: base de datos del portal de solicitudes (Supabase / PostgreSQL).
-- Ingreso con Id y clave (sin correos). Se ejecuta completo en Supabase > SQL Editor.
--
-- ATENCIÓN: primero borra las tablas de versiones anteriores de este esquema.
-- Sirve mientras se prueba; con datos reales NO volver a correrlo.
--
-- Antes de usar el portal, en Authentication > Sign In / Providers > Email:
--   * apagar "Confirm email" (nadie recibe correos: la cuenta usa un usuario, no un correo real)
--   * dejar encendido "Allow new users to sign up" (los nuevos ingresos crean su cuenta)

-- ============================================================
-- 0. LIMPIEZA
-- ============================================================
drop policy if exists cedulas_subir         on storage.objects;
drop policy if exists cedulas_ver           on storage.objects;
drop policy if exists cedulas_subir_ingreso on storage.objects;
drop policy if exists cedulas_ver_ingreso   on storage.objects;
drop table if exists public.recuperacion, public.ingresos, public.solicitudes,
                     public.admins, public.asociados cascade;
drop type  if exists public.tipo_solicitud, public.estado_solicitud cascade;
drop function if exists public.correo_actual(), public.es_admin(), public.mi_asociado_id(),
                        public.solicitudes_proteger(), public.ingresos_proteger(),
                        public.aprobar_ingreso(uuid, text) cascade;

-- ============================================================
-- 1. TABLAS
-- ============================================================
create table public.asociados (
  id        uuid primary key default gen_random_uuid(),
  tarjeta   text not null unique,                 -- el "Id" del asociado
  cedula    text not null unique,                 -- solo dígitos, como texto
  nombre    text not null,
  ingreso   date,
  planilla  text check (planilla in ('semanal', 'quincenal', 'mensual')),  -- cómo se le paga
  activo    boolean not null default true,        -- en vez de borrar, se desactiva
  user_id   uuid unique references auth.users (id) on delete set null,     -- su cuenta de ingreso
  creado_en timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create type public.tipo_solicitud   as enum ('admision', 'benef', 'ayuda', 'cred', 'serv', 'renun');
create type public.estado_solicitud as enum ('Pendiente', 'Aprobada', 'Rechazada');

create table public.solicitudes (
  id             uuid primary key default gen_random_uuid(),
  asociado_id    uuid not null references public.asociados (id),
  tipo           public.tipo_solicitud not null,
  datos          jsonb not null default '[]'::jsonb,   -- [{"etiqueta": "...", "valor": "..."}]
  cedula_frente  text not null,                        -- ruta en el almacenamiento privado "cedulas"
  cedula_reverso text not null,
  estado         public.estado_solicitud not null default 'Pendiente',
  creada_en      timestamptz not null default now(),
  resuelta_en    timestamptz,
  resuelta_por   uuid,                                 -- cuenta del administrador
  motivo_rechazo text
);
create index solicitudes_por_asociado on public.solicitudes (asociado_id, creada_en desc);
create index solicitudes_por_estado   on public.solicitudes (estado, creada_en desc);

-- Nuevos ingresos: personas con cuenta que todavía no son asociadas.
create table public.ingresos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre         text not null,
  cedula         text not null,
  datos          jsonb not null default '[]'::jsonb,
  cedula_frente  text not null,
  cedula_reverso text not null,
  estado         public.estado_solicitud not null default 'Pendiente',
  creada_en      timestamptz not null default now(),
  resuelta_en    timestamptz,
  resuelta_por   uuid,
  motivo_rechazo text
);
create unique index ingresos_una_pendiente on public.ingresos (user_id) where estado = 'Pendiente';

-- Pregunta secreta para recuperar la clave (la respuesta se guarda cifrada).
create table public.recuperacion (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  pregunta        text not null,
  respuesta       text not null,
  intentos        int  not null default 0,
  bloqueado_hasta timestamptz
);

-- ============================================================
-- 2. FUNCIONES DE APOYO (quién es quién se decide por la cuenta de la sesión)
-- ============================================================
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create or replace function public.mi_asociado_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.asociados where user_id = auth.uid() and activo limit 1
$$;

-- ============================================================
-- 3. SEGURIDAD POR FILA (cada quien ve solo lo suyo)
-- ============================================================
alter table public.asociados    enable row level security;
alter table public.admins       enable row level security;
alter table public.solicitudes  enable row level security;
alter table public.ingresos     enable row level security;
alter table public.recuperacion enable row level security;
-- admins y recuperacion: sin políticas a propósito. Solo se tocan desde funciones o el SQL Editor.

create policy asociados_ver on public.asociados for select to authenticated
  using (id = public.mi_asociado_id() or public.es_admin());
create policy asociados_agregar on public.asociados for insert to authenticated
  with check (public.es_admin());
create policy asociados_editar on public.asociados for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy solicitudes_ver on public.solicitudes for select to authenticated
  using (asociado_id = public.mi_asociado_id() or public.es_admin());
create policy solicitudes_crear on public.solicitudes for insert to authenticated
  with check (
    asociado_id = public.mi_asociado_id()
    and estado = 'Pendiente'
    and resuelta_en is null and resuelta_por is null and motivo_rechazo is null
    and cedula_frente  like auth.uid()::text || '/%'
    and cedula_reverso like auth.uid()::text || '/%'
  );
create policy solicitudes_resolver on public.solicitudes for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy ingresos_ver on public.ingresos for select to authenticated
  using (user_id = auth.uid() or public.es_admin());
create policy ingresos_crear on public.ingresos for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.mi_asociado_id() is null            -- quien ya es asociado no usa este formulario
    and estado = 'Pendiente'
    and resuelta_en is null and resuelta_por is null and motivo_rechazo is null
    and cedula_frente  like auth.uid()::text || '/%'
    and cedula_reverso like auth.uid()::text || '/%'
  );
create policy ingresos_resolver on public.ingresos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Al resolver, solo cambia el estado (y el motivo). Fecha y responsable se anotan solos.
create or replace function public.solicitudes_proteger()
returns trigger language plpgsql as $$
begin
  if current_user = 'postgres' then return new; end if;   -- correcciones manuales desde el SQL Editor
  if new.asociado_id <> old.asociado_id or new.tipo <> old.tipo or new.datos <> old.datos
     or new.cedula_frente <> old.cedula_frente or new.cedula_reverso <> old.cedula_reverso
     or new.creada_en <> old.creada_en then
    raise exception 'Solo se puede cambiar el estado de una solicitud';
  end if;
  if new.estado <> old.estado then
    new.resuelta_en := now();
    new.resuelta_por := auth.uid();
  end if;
  return new;
end $$;
create trigger solicitudes_proteger before update on public.solicitudes
  for each row execute function public.solicitudes_proteger();

create or replace function public.ingresos_proteger()
returns trigger language plpgsql as $$
begin
  if current_user = 'postgres' then return new; end if;
  if new.user_id <> old.user_id or new.nombre <> old.nombre or new.cedula <> old.cedula
     or new.datos <> old.datos or new.cedula_frente <> old.cedula_frente
     or new.cedula_reverso <> old.cedula_reverso or new.creada_en <> old.creada_en then
    raise exception 'Solo se puede cambiar el estado de una solicitud';
  end if;
  if new.estado <> old.estado then
    new.resuelta_en := now();
    new.resuelta_por := auth.uid();
  end if;
  return new;
end $$;
create trigger ingresos_proteger before update on public.ingresos
  for each row execute function public.ingresos_proteger();

-- ============================================================
-- 4. APROBAR UN INGRESO: crea al asociado y cierra la solicitud, todo junto.
--    Falla si la tarjeta o la cédula ya existen.
-- ============================================================
create or replace function public.aprobar_ingreso(p_id uuid, p_tarjeta text)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ingresos;
begin
  if not public.es_admin() then raise exception 'Solo un administrador puede aprobar ingresos'; end if;
  select * into i from public.ingresos where id = p_id and estado = 'Pendiente' for update;
  if not found then raise exception 'La solicitud no existe o ya fue resuelta'; end if;
  insert into public.asociados (tarjeta, cedula, nombre, ingreso, user_id)
  values (trim(p_tarjeta), i.cedula, upper(trim(i.nombre)), current_date, i.user_id);
  update public.ingresos
     set estado = 'Aprobada', resuelta_en = now(), resuelta_por = auth.uid()
   where id = p_id;
end $$;

-- ============================================================
-- 5. CLAVE OLVIDADA (sin correo): pregunta secreta, con límite de intentos
-- ============================================================
create or replace function public.guardar_pregunta(p_pregunta text, p_respuesta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if length(trim(p_respuesta)) < 3 then raise exception 'La respuesta es muy corta'; end if;
  insert into public.recuperacion (user_id, pregunta, respuesta)
  values (auth.uid(), p_pregunta, extensions.crypt(lower(trim(p_respuesta)), extensions.gen_salt('bf')))
  on conflict (user_id) do update
    set pregunta = excluded.pregunta, respuesta = excluded.respuesta,
        intentos = 0, bloqueado_hasta = null;
end $$;

create or replace function public.tiene_pregunta()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recuperacion where user_id = auth.uid())
$$;

-- Devuelve true si cambió la clave; false si los datos no coinciden o la cuenta está bloqueada.
-- Tras 5 intentos fallidos la cuenta queda bloqueada 30 minutos.
create or replace function public.recuperar_clave(p_usuario text, p_pregunta text, p_respuesta text, p_nueva text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ids uuid[]; uid uuid; r public.recuperacion;
begin
  if length(coalesce(p_nueva, '')) < 8 then raise exception 'La clave nueva debe tener al menos 8 caracteres'; end if;
  select array_agg(id) into ids from auth.users where raw_user_meta_data ->> 'usuario' = lower(trim(p_usuario));
  if coalesce(array_length(ids, 1), 0) <> 1 then return false; end if;
  uid := ids[1];
  select * into r from public.recuperacion where user_id = uid for update;
  if not found then return false; end if;
  if r.bloqueado_hasta is not null and r.bloqueado_hasta > now() then return false; end if;
  if r.pregunta = p_pregunta and r.respuesta = extensions.crypt(lower(trim(p_respuesta)), r.respuesta) then
    update auth.users set encrypted_password = extensions.crypt(p_nueva, extensions.gen_salt('bf')),
                          updated_at = now() where id = uid;
    update public.recuperacion set intentos = 0, bloqueado_hasta = null where user_id = uid;
    return true;
  end if;
  update public.recuperacion
     set intentos = case when intentos + 1 >= 5 then 0 else intentos + 1 end,
         bloqueado_hasta = case when intentos + 1 >= 5 then now() + interval '30 minutes' end
   where user_id = uid;
  return false;
end $$;

-- ============================================================
-- 6. FOTOS DE CÉDULA (almacenamiento privado). Ruta: <cuenta del usuario>/<archivo>
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cedulas', 'cedulas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy cedulas_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'cedulas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy cedulas_ver on storage.objects for select to authenticated
  using (bucket_id = 'cedulas'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));

-- ============================================================
-- 7. PRIMER ADMINISTRADOR
--    La persona crea su cuenta con "Soy nuevo" (cédula y clave). Luego, aquí,
--    se escribe esa misma cédula (descomentar la línea):
-- ============================================================
-- insert into public.admins (user_id) select id from auth.users where raw_user_meta_data ->> 'usuario' = 'LA-CEDULA-DEL-ADMINISTRADOR';
