#!/usr/bin/env python3
"""Run locally as the owner. Writes a private upload file; never prints credentials."""
import getpass, json, os, secrets
from pathlib import Path
path=Path(__file__).resolve().parent.parent/'.env.deploy'
if path.exists():raise SystemExit('The private file already exists. Keep it or choose a new filename before generating new credentials.')
email=input('Kura owner email: ').strip().lower()
password=getpass.getpass('Kura sign-in password (16+ characters): ')
access=getpass.getpass('Tarka bucket access key ID: ')
secret=getpass.getpass('Tarka bucket secret access key: ')
if '@' not in email or len(password)<16 or not access or not secret:raise SystemExit('Email, password and both storage credentials are required.')
values={'DJANGO_SECRET_KEY':secrets.token_urlsafe(48),'POSTGRES_PASSWORD':secrets.token_urlsafe(32),'KURA_BOT_TOKEN':secrets.token_urlsafe(32),'KURA_ADMIN_EMAIL':email,'KURA_ADMIN_PASSWORD':password,'AWS_ACCESS_KEY_ID':access,'AWS_SECRET_ACCESS_KEY':secret}
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(values,f)
print('Private secret upload file created at',path)
print('Upload this file to the Tarka handoff page. Do not paste its contents into chat.')
