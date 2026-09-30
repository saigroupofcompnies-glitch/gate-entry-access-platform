# Examination Identity, Access & Live Centre Management (EIALM)

Multi-exam identity, OTR, centre duty enrolment and live monitoring platform.

## Local development

Requires Node.js 20+.

```bash
git clone https://github.com/saigroupofcompnies-glitch/gate-entry-access-platform.git
cd gate-entry-access-platform
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:4170
- Demo password: `Pilot@123` · OTP: `123456`

Do not commit `.env`. Copy `.env.example` if you need production secrets.

## Deploy on a hosting server (VPS / cloud VM)

One process serves API + built UI after `npm install` (postinstall runs `npm run build`).

```bash
export NODE_ENV=production
export PORT=4170
export HOST=0.0.0.0
export GATE_TOKEN_SECRET="long-random-secret"
npm install
npm start
```

Put Nginx or a load balancer in front:

```nginx
server {
  listen 80;
  server_name your-domain.example;
  client_max_body_size 32m;
  location / {
    proxy_pass http://127.0.0.1:4170;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

SQLite file is created at `data/eialm.sqlite` (not in git). Keep that folder on persistent disk.

## Docker

```bash
git clone https://github.com/saigroupofcompnies-glitch/gate-entry-access-platform.git
cd gate-entry-access-platform
export GATE_TOKEN_SECRET="long-random-secret"
docker compose up -d --build
```

App: http://SERVER-IP:4170

## systemd (Ubuntu / Debian VPS)

```bash
sudo git clone https://github.com/saigroupofcompnies-glitch/gate-entry-access-platform.git /opt/eialm
cd /opt/eialm
sudo npm install
sudo cp deploy/eialm.service /etc/systemd/system/
echo 'GATE_TOKEN_SECRET=long-random-secret' | sudo tee /opt/eialm/.env
sudo systemctl daemon-reload
sudo systemctl enable --now eialm
sudo cp deploy/nginx.conf /etc/nginx/sites-available/eialm
sudo ln -sf /etc/nginx/sites-available/eialm /etc/nginx/sites-enabled/eialm
sudo nginx -t && sudo systemctl reload nginx
```

### Render / Railway / similar

- Build: `npm install` (builds client)
- Start: `npm start`
- Set `PORT` (platform), `HOST=0.0.0.0`, `GATE_TOKEN_SECRET`

## Public vs operations

- `/` Student OTR and centre staff enrolment
- `/operations` Incharge, Client, Main Admin logins

Demo users: `admin`, `supervisor`, `client`, `gate`, `classroom` / `Pilot@123`
