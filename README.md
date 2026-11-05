# Calendario — agenda compartida con amigos

Calendario web (React + Vite + TypeScript) con backend en Supabase, sincronización con Google Calendar y
calendarios compartidos entre amigos. Se publica gratis en GitHub Pages.

## Qué hace

- Vistas **mes** y **semana**, eventos de todo el día, solapes en columnas, línea de "ahora", modo oscuro automático.
- **Importa Google Calendar** (solo lectura, 1 mes atrás → 1 año adelante, incluye recurrentes y borrados).
- **Amigos**: se añaden por email, aceptan la solicitud, y activas/desactivas su calendario encima del tuyo con un color.
- **Privacidad por evento**: *Solo yo* · *Ocupado* (el amigo ve el hueco pero no el título) · *Título y detalles*.
  Se aplica en el servidor (Postgres), no en el navegador.
- **Buscar hueco libre** común contigo y los amigos marcados (próximos 14 días, 9:00–21:00).
- Atajos: `t` hoy · `m` mes · `w` semana · `n` nuevo · `←` `→`.

## Por qué es rápido

- Solo se descargan los eventos del rango visible (índice `events_owner_start`).
- Los eventos de amigos vienen en **una sola** llamada RPC.
- Sin librerías de fechas ni de UI: bundle pequeño. Los eventos se reparten por día en una sola pasada.
- Las peticiones obsoletas se descartan (si navegas rápido no se pisan).

---

## Pasos para ponerlo en marcha

### 1. Subir el código a GitHub

1. Crea un repositorio nuevo en GitHub (por ejemplo `calendario-app`), **público** si usas Pages gratis.
2. En esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/calendario-app.git
   git push -u origin main
   ```

### 2. Crear las tablas en Supabase

1. Abre tu proyecto en [supabase.com](https://supabase.com) → **SQL Editor** → *New query*.
2. Pega todo el contenido de `supabase/schema.sql` y pulsa **Run**.
3. Ve a **Project Settings → API** y copia:
   - **Project URL** → será `VITE_SUPABASE_URL`
   - **anon public key** → será `VITE_SUPABASE_ANON_KEY`
   (La anon key es pública por diseño; la protección está en las políticas RLS del SQL. **Nunca** uses la `service_role` en el frontend.)

### 3. Configurar el login con Google

1. Entra en [Google Cloud Console](https://console.cloud.google.com) y crea un proyecto.
2. **APIs y servicios → Biblioteca** → activa **Google Calendar API**.
3. **Pantalla de consentimiento OAuth** → tipo *Externo* → añade el scope
   `https://www.googleapis.com/auth/calendar.readonly`.
   En modo *Testing* añade como **usuarios de prueba** el email de cada persona que vaya a usar la app (máx. 100).
4. **Credenciales → Crear credenciales → ID de cliente OAuth** → tipo *Aplicación web*.
   En *URI de redireccionamiento autorizados* pon:
   `https://TU-PROYECTO.supabase.co/auth/v1/callback`
5. Copia el **Client ID** y el **Client Secret**.
6. En Supabase: **Authentication → Providers → Google** → actívalo y pega Client ID y Secret.
7. En Supabase: **Authentication → URL Configuration**:
   - **Site URL**: `https://TU_USUARIO.github.io/calendario-app/`
   - **Redirect URLs**: añade la misma URL y `http://localhost:5173/`

### 4. Desplegar en GitHub Pages

1. En el repo: **Settings → Secrets and variables → Actions → New repository secret**. Crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Haz un push a `main` (o **Actions → Deploy a GitHub Pages → Run workflow**).
4. En 1–2 minutos tendrás la app en `https://TU_USUARIO.github.io/calendario-app/`.

### 5. Usarla con amigos

1. Cada amigo abre la URL y entra con Google (o con enlace por email).
2. Tú: panel **Amigos** → escribe su email → *Añadir*. Él acepta la solicitud.
3. Pulsa **Sincronizar Google** para traer tu calendario. Por defecto los eventos importados son **privados**:
   usa **Privacidad rápida** (barra lateral) para compartirlos como "Ocupado" o con detalles.
4. Marca/desmarca a cada amigo para verlo superpuesto en tu calendario.

### Probar en local (opcional)

```bash
cp .env.example .env.local      # y rellena los dos valores
npm install
npm run dev                     # http://localhost:5173
```

---

## Limitaciones a tener en cuenta

- **Google → app es de un solo sentido**: los eventos que crees aquí no se escriben en Google Calendar
  (haría falta el scope de escritura, más estricto en la verificación de Google).
- **El token de Google dura 1 hora** y se guarda en el navegador. Pasado ese tiempo, el botón pasa a
  *Conectar Google*: un clic y se renueva. Para sincronización automática en segundo plano haría falta una
  Edge Function de Supabase que guarde el refresh token.
- **Límite de 100 usuarios** mientras la app de Google esté en modo *Testing*. Para más gente hay que pasar
  la verificación de Google (el scope de Calendar es "sensible"). Los usuarios que entren por enlace de email
  no tienen ese límite, pero no pueden importar Google Calendar.
- Los huecos libres ignoran los eventos de todo el día.

## Ideas para seguir

Arrastrar y soltar eventos, vista día/agenda, recordatorios, eventos compartidos con invitados,
Supabase Realtime para ver cambios de amigos al instante, y escritura hacia Google Calendar.

## Estructura

```
supabase/schema.sql          tablas, RLS y funciones (privacidad de amigos)
src/lib/google.ts            login y sincronización con Google Calendar
src/lib/free.ts              algoritmo de huecos libres
src/hooks/useCalendar.ts     eventos del rango visible + CRUD
src/hooks/useFriends.ts      amistades y solicitudes
src/components/              vistas mes/semana, modal, panel de amigos
.github/workflows/deploy.yml build y despliegue a GitHub Pages
```
