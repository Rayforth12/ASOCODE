#!/usr/bin/env python3
"""Crea las cuentas y registra a los asociados del Excel. Se corre UNA sola vez, antes de entregar.

Cada asociado queda con su Id como usuario y una clave temporal distinta. El resultado
está en claves_temporales.csv: se entrega a cada persona y luego se BORRA. En su primer
ingreso el sistema le pide cambiar la clave.

IMPORTANTE: el sufijo del usuario (PLANTILLA_USUARIO) queda guardado en cada cuenta.
Córralo cuando el dominio ya sea el definitivo.

Uso (PowerShell, en la carpeta herramientas):
    $env:SUPABASE_URL = "https://xxxx.supabase.co"
    $env:SUPABASE_SERVICE_KEY = "clave service_role (pestaña Anónimo heredado, service_role)"
    $env:PLANTILLA_USUARIO = "{u}@dominio.com"        (igual a VITE_PLANTILLA_USUARIO del .env)
    python crear_cuentas.py Listado.xlsx

La clave service_role se usa solo en esta computadora: nunca va en el .env de la página.
"""
import csv
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

from preparar_asociados import leer, validar

URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
PLANTILLA = os.environ.get("PLANTILLA_USUARIO", "")
ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sin letras que se confunden


def llamar(metodo, ruta, cuerpo=None, extra=None):
    cab = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}
    cab.update(extra or {})
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    req = urllib.request.Request(URL + ruta, data=datos, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except ValueError:
            return e.code, {"msg": txt}


def main(ruta):
    if not (URL and KEY and "{u}" in PLANTILLA):
        sys.exit("Faltan SUPABASE_URL, SUPABASE_SERVICE_KEY o PLANTILLA_USUARIO (debe llevar {u}).")
    regs = leer(ruta)
    errores, _ = validar(regs)
    if errores:
        sys.exit("El Excel tiene errores. Corra preparar_asociados.py para ver el detalle, corríjalos y vuelva a intentar.")

    claves, fallos = [], []
    for r in regs:
        usuario = r["tarjeta"].lower()
        clave = "".join(secrets.choice(ALFABETO) for _ in range(8))
        st, u = llamar("POST", "/auth/v1/admin/users", {
            "email": PLANTILLA.replace("{u}", usuario), "password": clave, "email_confirm": True,
            "user_metadata": {"usuario": usuario, "cambiar_clave": True},
        })
        if st >= 300:
            fallos.append((r["fila"], r["tarjeta"], "cuenta: " + str((u or {}).get("msg", st))))
            continue
        st, e = llamar("POST", "/rest/v1/asociados", {
            "tarjeta": r["tarjeta"], "cedula": r["cedula"], "nombre": r["nombre"],
            "ingreso": r["ingreso"] or None, "planilla": r["planilla"] or None, "user_id": u["id"],
        }, {"Prefer": "return=minimal"})
        if st >= 300:
            llamar("DELETE", "/auth/v1/admin/users/" + u["id"])        # no dejar cuentas sueltas
            fallos.append((r["fila"], r["tarjeta"], "registro: " + str((e or {}).get("message", st))))
            continue
        claves.append((r["tarjeta"], r["nombre"], clave))

    with open("claves_temporales.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "nombre", "clave_temporal"])
        w.writerows(claves)
    with open("errores_carga.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["fila_excel", "id", "motivo"])
        w.writerows(fallos)
    try:
        os.chmod("claves_temporales.csv", 0o600)
    except OSError:
        pass
    print(f"Leídos: {len(regs)}. Cuentas creadas: {len(claves)}. Con problemas: {len(fallos)}.")
    print("Claves en claves_temporales.csv (entregar y borrar).")
    for n, i, m in fallos:
        print(f"  Fila {n} ({i}): {m}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python crear_cuentas.py Listado.xlsx")
    main(sys.argv[1])
