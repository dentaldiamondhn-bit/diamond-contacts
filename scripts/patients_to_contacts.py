#!/usr/bin/env python3
"""Convert an exported `patients` CSV (patients_rows.csv) into Diamond Contacts.

Reads the patient export, cleans/dedups it, drops dummy phone numbers, merges
against the contacts already in Supabase, and writes:

  patients_contacts.vcf         importer-ready vCard (lossy: name/phone/email/org/title/note)
  patients_contacts.sql         full-fidelity idempotent SQL (contacts + phones + emails + history)
  patients_contacts_review.csv  human-readable review of every patient row + the action taken

No database writes happen here. The SQL is meant to be reviewed and run in the
Supabase SQL editor. Reads from Supabase use only the service-role key already
present in .env.local (read-only GETs).
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
import unicodedata
import urllib.request
import uuid
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_IN = os.path.join(ROOT, 'patients_rows.csv')
VCF_OUT = os.path.join(ROOT, 'patients_contacts.vcf')
SQL_OUT = os.path.join(ROOT, 'patients_contacts.sql')
REVIEW_OUT = os.path.join(ROOT, 'patients_contacts_review.csv')

USER_ID = 'user_3JKYlRaGTEGpIq0MT3p1Y0YbdXo'
UUID_NS = uuid.NAMESPACE_URL


def load_env() -> dict:
    env = {}
    for fn in (os.path.join(ROOT, '.env.local'),):
        if not os.path.exists(fn):
            continue
        for line in open(fn, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k] = v.strip().strip('"').strip("'")
    return env


def supabase_get(env: dict, path: str):
    url = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
    key = env['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(url + path, headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def rest(env: dict, method: str, path: str, body=None, prefer=None):
    url = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
    key = env['SUPABASE_SERVICE_ROLE_KEY']
    headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, headers=headers, data=data, method=method)
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def chunked(seq, n=200):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def apply_rows(env, contact_rows, phone_rows, email_rows, history_rows, link_updates) -> None:
    ignore = 'resolution=ignore-duplicates,return=minimal'
    for batch in chunked(contact_rows):
        rest(env, 'POST', '/rest/v1/contacts?on_conflict=id', batch, ignore)
    for batch in chunked(phone_rows):
        rest(env, 'POST', '/rest/v1/contact_phones?on_conflict=id', batch, ignore)
    for batch in chunked(email_rows):
        rest(env, 'POST', '/rest/v1/contact_emails?on_conflict=id', batch, ignore)
    for batch in chunked(history_rows):
        rest(env, 'POST', '/rest/v1/patient_medical_history?on_conflict=contact_id', batch, ignore)
    for cid, pid, _name in link_updates:
        rest(env, 'PATCH', f'/rest/v1/contacts?id=eq.{cid}&patient_id=is.null',
             {'patient_id': pid}, 'return=minimal')


# --- text helpers -----------------------------------------------------------

def ne(v) -> bool:
    return v is not None and str(v).strip() != ''


def norm_name(name: str) -> str:
    s = unicodedata.normalize('NFKD', (name or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'\b(lic|sr|sra|srta|dr|dra)\.?\b', '', s)
    return re.sub(r'[^a-z0-9 ]', ' ', s).strip()


def digits(s) -> str:
    return re.sub(r'\D', '', s or '')


def e164(telefono: str, codigopais: str) -> str:
    cc = digits(codigopais) or '504'
    nat = digits(telefono)
    if nat.startswith(cc) and len(nat) > len(cc):
        nat = nat[len(cc):]
    return f'+{cc}{nat}' if nat else ''


def national(e164str: str) -> str:
    return digits(e164str)


# --- medical/array helpers --------------------------------------------------

NEGATION_TAGS = {
    'no', 'n/a', 'na', 'none', '0', '-', 'no hay', 'no hay alergias', 'no presenta',
    'no presenta alergias', 'no refiere', 'no refiere alergias', 'no aplica',
    'no aplicable', 'ninguna', 'ninguno', 'ninguna alergia', 'sin alergias', 'sin',
    'desconocido', 'no conocida', 'no conocidas', 'no se conocen', 'sin antecedentes',
}
BLOOD_TYPES = {'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'}


def split_tags(value) -> list[str]:
    out = []
    for part in re.split(r'[\n,;]+', value or ''):
        t = part.strip()
        if not t:
            continue
        if t.lower().replace('.', '').strip() in NEGATION_TAGS:
            continue
        out.append(t)
    # dedup preserving order, case-insensitive
    seen, res = set(), []
    for t in out:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            res.append(t)
    return res


def blood_type(value) -> str | None:
    b = (value or '').strip().upper().replace(' ', '')
    return b if b in BLOOD_TYPES else None


def clean_email(value) -> str | None:
    e = (value or '').strip()
    if not e or e.lower().replace('.', '').strip() in NEGATION_TAGS:
        return None
    return e if re.match(r'[^@\s]+@[^@\s]+\.[^@\s]+$', e) else None


def emergency(value_name, value_phone, codigopais) -> str | None:
    name = (value_name or '').strip()
    if name.lower().replace('.', '').strip() in NEGATION_TAGS:
        name = ''
    phone = e164(value_phone, codigopais)
    if not phone or is_dummy_phone(phone):
        phone = ''
    if not name and not phone:
        return None
    return ' — '.join(x for x in [name, phone] if x)


def is_dummy_phone(phone_e164: str) -> bool:
    n = national(phone_e164)
    if len(n) < 7:
        return True
    if len(set(n)) == 1:
        return True
    if re.search(r'(\d)\1{4,}', n):  # 5+ identical digits in a row (9999-9999, 99999995…)
        return True
    if n in {'12345678', '87654321', '12341234', '00000000', '99999999'}:
        return True
    return False


def sql_str(v) -> str:
    if v is None or v == '':
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def sql_arr(items: list[str]) -> str:
    if not items:
        return "'{}'"
    inner = ', '.join(sql_str(x) for x in items)
    return f'ARRAY[{inner}]'


def uid(*parts) -> str:
    return str(uuid.uuid5(UUID_NS, 'diamond-contacts:' + ':'.join(str(p) for p in parts)))


# --- main -------------------------------------------------------------------

def main() -> None:
    env = load_env()
    rows = list(csv.DictReader(open(CSV_IN, newline='', encoding='utf-8')))

    # Existing contacts (merge targets).
    existing = supabase_get(env, '/rest/v1/contacts?select=id,patient_id,first_name,last_name&limit=1000')
    ex_phones = supabase_get(env, '/rest/v1/contact_phones?select=contact_id,phone_number&limit=5000')
    ex_patient_ids = {c['patient_id'] for c in existing if c.get('patient_id')}
    ex_name_by_id = {c['id']: norm_name(f"{c.get('first_name') or ''} {c.get('last_name') or ''}") for c in existing}
    ex_names = set(ex_name_by_id.values())
    ex_phones_by_id = defaultdict(set)
    for p in ex_phones:
        ex_phones_by_id[p['contact_id']].add(national(p['phone_number']))
    ex_phone_locals = set().union(*ex_phones_by_id.values()) if ex_phones_by_id else set()

    # Clean + dedup patients.
    prepared = []
    for r in rows:
        name = (r.get('nombre_completo') or '').strip()
        if not name:
            continue
        phone = e164(r.get('telefono'), r.get('codigopais'))
        prepared.append({'row': r, 'name': name, 'phone': phone})

    # Dedup by (normalized name, phone). Keep the richest row.
    def richness(p):
        r = p['row']
        return sum(1 for k in ('email', 'direccion', 'fecha_nacimiento', 'alergias',
                               'enfermedades', 'medicamentos', 'trabajo', 'observaciones_generales',
                               'contacto_emergencia', 'tipo_sangre') if ne(r.get(k)))
    by_key = {}
    for p in prepared:
        key = (norm_name(p['name']), p['phone'])
        if key not in by_key or richness(p) > richness(by_key[key]):
            by_key[key] = p
    deduped = list(by_key.values())

    review = []
    contacts_sql = []
    phones_sql = []
    emails_sql = []
    history_sql = []
    vcards = []
    link_updates = []
    contact_rows = []
    phone_rows = []
    email_rows = []
    history_rows = []

    stats = defaultdict(int)
    for p in deduped:
        r = p['row']
        name, phone = p['name'], p['phone']
        pid = r.get('paciente_id')

        if is_dummy_phone(phone):
            stats['skip_dummy'] += 1
            review.append([pid, name, phone, 'skip', 'dummy phone'])
            continue

        # Merge against the 23 existing contacts.
        reason = None
        if pid and pid in ex_patient_ids:
            reason = 'existing contact (patient_id)'
        elif norm_name(name) in ex_names:
            reason = 'existing contact (name)'
        elif national(phone) in ex_phone_locals:
            reason = 'existing contact (phone)'
        if reason:
            stats['skip_existing'] += 1
            review.append([pid, name, phone, 'skip', reason])
            # Opportunistically link an existing unlinked contact to its patient.
            if pid:
                match = next((c['id'] for c in existing
                              if (norm_name(f"{c.get('first_name') or ''} {c.get('last_name') or ''}") == norm_name(name)
                                  or national(phone) in ex_phones_by_id.get(c['id'], set()))
                              and not c.get('patient_id')), None)
                if match:
                    link_updates.append((match, pid, name))
            continue

        cid = uid('contact', pid or phone)
        allergies = split_tags(r.get('alergias'))
        conditions = split_tags(r.get('enfermedades'))
        medications = split_tags(r.get('medicamentos'))
        btype = blood_type(r.get('tipo_sangre'))
        emerg = emergency(r.get('contacto_emergencia'), r.get('contacto_telefono'), r.get('codigopaisemergencia'))
        email = clean_email(r.get('email'))
        dob = (r.get('fecha_nacimiento') or '').strip()[:10] or None
        job = (r.get('trabajo') or '').strip() or None
        notes = (r.get('observaciones_generales') or '').strip() or None
        address = (r.get('direccion') or '').strip() or None
        last_visit = (r.get('visitas_dentista') or '').strip() or None
        odontogram = (r.get('observaciones_medicas') or '').strip() or None

        contact_rows.append({
            'id': cid, 'user_id': USER_ID, 'patient_id': pid or None, 'first_name': name,
            'last_name': '', 'job_title': job, 'notes': notes, 'address': address,
            'dob': dob, 'emergency_contact': emerg, 'is_favorite': False, 'is_archived': False, 'version': 1,
        })

        contacts_sql.append(
            "INSERT INTO public.contacts (id, user_id, patient_id, first_name, last_name, job_title, notes, "
            "address, dob, emergency_contact, is_favorite, is_archived, version) VALUES ("
            f"{sql_str(cid)}, {sql_str(USER_ID)}, {sql_str(pid)}, {sql_str(name)}, '', "
            f"{sql_str(job)}, {sql_str(notes)}, {sql_str(address)}, {sql_str(dob)}, {sql_str(emerg)}, "
            "FALSE, FALSE, 1) ON CONFLICT (id) DO NOTHING;"
        )
        phone_rows.append({'id': uid('phone', cid), 'contact_id': cid, 'type': 'mobile',
                           'phone_number': phone, 'is_primary': True})
        phones_sql.append(
            "INSERT INTO public.contact_phones (id, contact_id, type, phone_number, is_primary) VALUES ("
            f"{sql_str(uid('phone', cid))}, {sql_str(cid)}, 'mobile', {sql_str(phone)}, TRUE) "
            "ON CONFLICT (id) DO NOTHING;"
        )
        if email:
            email_rows.append({'id': uid('email', cid), 'contact_id': cid, 'type': 'work',
                               'email': email, 'is_primary': True})
            emails_sql.append(
                "INSERT INTO public.contact_emails (id, contact_id, type, email, is_primary) VALUES ("
                f"{sql_str(uid('email', cid))}, {sql_str(cid)}, 'work', {sql_str(email)}, TRUE) "
                "ON CONFLICT (id) DO NOTHING;"
            )
        if allergies or conditions or medications or last_visit or odontogram or btype:
            history_rows.append({
                'id': uid('history', cid), 'contact_id': cid, 'user_id': USER_ID,
                'allergies': allergies, 'chronic_conditions': conditions,
                'current_medications': medications, 'odontogram_notes': odontogram,
                'last_dental_visit': last_visit, 'blood_type': btype,
            })
            history_sql.append(
                "INSERT INTO public.patient_medical_history (id, contact_id, user_id, allergies, chronic_conditions, "
                "current_medications, odontogram_notes, last_dental_visit, blood_type) VALUES ("
                f"{sql_str(uid('history', cid))}, {sql_str(cid)}, {sql_str(USER_ID)}, {sql_arr(allergies)}, "
                f"{sql_arr(conditions)}, {sql_arr(medications)}, "
                f"{sql_str(odontogram)}, {sql_str(last_visit)}, {sql_str(btype)}) "
                "ON CONFLICT (contact_id) DO NOTHING;"
            )

        # vCard for the app's Import UI. Omit FN so the app parser keeps the full
        # name in first_name (N:;Full Name;;;  ->  first_name = "Full Name").
        v = ['BEGIN:VCARD', 'VERSION:3.0', f'N:;{name};;;',
             f'TEL;TYPE=MOBILE,VOICE;VALUE=uri:tel:{phone}']
        if email:
            v.append(f'EMAIL;TYPE=WORK:{email}')
        if ne(r.get('trabajo')):
            v.append(f'TITLE:{(r["trabajo"] or "").strip()}')
        if ne(r.get('observaciones_generales')):
            v.append('NOTE:' + (r['observaciones_generales'] or '').replace('\n', ' ').strip())
        v.append('END:VCARD')
        vcards.append('\r\n'.join(v))

        stats['create'] += 1
        review.append([pid, name, phone, 'create', ''])

    # ---- write outputs
    with open(VCF_OUT, 'w', encoding='utf-8', newline='') as f:
        f.write('\r\n'.join(vcards) + ('\r\n' if vcards else ''))

    sql = []
    sql.append('-- Auto-generated by scripts/patients_to_contacts.py')
    sql.append(f'-- user_id: {USER_ID}    new contacts: {len(contacts_sql)}    '
               f'(skipped: {stats["skip_dummy"]} dummy phone, {stats["skip_existing"]} already present)')
    sql.append('-- Review patients_contacts_review.csv, then run this in the Supabase SQL editor.')
    sql.append('BEGIN;')
    sql.append('')
    sql.append('-- 1) contacts')
    sql.extend(contacts_sql)
    sql.append('')
    sql.append('-- 2) phones')
    sql.extend(phones_sql)
    sql.append('')
    sql.append('-- 3) emails')
    sql.extend(emails_sql)
    sql.append('')
    sql.append('-- 4) medical history')
    sql.extend(history_sql)
    if link_updates:
        sql.append('')
        sql.append('-- 5) link pre-existing contacts to their patient record (only where patient_id was NULL)')
        for cid, pid, name in link_updates:
            sql.append(f"-- {name}")
            sql.append(f"UPDATE public.contacts SET patient_id = {sql_str(pid)}, updated_at = NOW() "
                       f"WHERE id = {sql_str(cid)} AND patient_id IS NULL;")
    sql.append('')
    sql.append('COMMIT;')
    open(SQL_OUT, 'w', encoding='utf-8').write('\n'.join(sql) + '\n')

    with open(REVIEW_OUT, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow(['paciente_id', 'first_name', 'phone', 'action', 'reason'])
        w.writerows(review)

    print(f'patients rows            : {len(rows)}')
    print(f'deduped unique patients  : {len(deduped)}')
    print(f'  -> create contacts     : {stats["create"]}')
    print(f'  -> skip (dummy phone)  : {stats["skip_dummy"]}')
    print(f'  -> skip (already exist): {stats["skip_existing"]}')
    print(f'existing contacts        : {len(existing)} (patient_id links to add: {len(link_updates)})')
    print(f'wrote {VCF_OUT}')
    print(f'wrote {SQL_OUT}')
    print(f'wrote {REVIEW_OUT}')

    if '--apply' in sys.argv:
        before = supabase_get(env, f'/rest/v1/contacts?select=id&user_id=eq.{USER_ID}&limit=10000')
        print(f'\n--apply: writing {len(contact_rows)} contacts, {len(phone_rows)} phones, '
              f'{len(email_rows)} emails, {len(history_rows)} histories, {len(link_updates)} links ...')
        apply_rows(env, contact_rows, phone_rows, email_rows, history_rows, link_updates)
        after = supabase_get(env, f'/rest/v1/contacts?select=id&user_id=eq.{USER_ID}&limit=10000')
        print(f'contacts for {USER_ID}: {len(before)} -> {len(after)}')
    else:
        print('\n(dry run — pass --apply to write to Supabase)')


if __name__ == '__main__':
    main()
