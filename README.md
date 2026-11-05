# Calendario — agenda compartida con amigos

Calendario web (React + Vite + TypeScript) con backend en Supabase. Se publica gratis en GitHub Pages.
**Entra cualquiera**, sin que tengas que añadir correos a ninguna lista.

## Qué hace

- Vistas **mes** y **semana**, eventos de todo el día, solapes en columnas, línea de "ahora", modo oscuro automático.
- **Importar archivo `.ics`** (Google Calendar, Apple, Outlook): incluye eventos que se repiten, zonas horarias, días excluidos y cancelados.
- **Amigos con enlace de invitación**: pulsas "Invitar con mi enlace", se lo mandas por WhatsApp y quien lo abra y entre te envía una solicitud que tú aceptas.
- Superpones el calendario de cada amigo al tuyo, con un color por persona.
- **Privacidad por evento**: *Solo yo* · *Ocupado* (el amigo ve el hueco, no el título) · *Título y detalles*. Se aplica en el servidor (Postgres).
- **Buscar hueco libre** común contigo y los amigos marcados (próximos 14 días, 9:00–21:00).
- Atajos: `t` hoy · `m` mes · `w` semana · `n` nuevo · `←` `→`.

---

## Pasos

Sustituye `TU_USUARIO`, `NOMBRE_REPO` y `TU-PROYECTO` (el identificador de tu Supabase) por tus valores.

### 1. Subir el código a GitHub

Desde el navegador (sin terminal): crea un repo **público** vacío → **uploading an existing file** → arrastra **el contenido** de la carpeta descomprimida → **Commit changes**.
La carpeta oculta `.github` no se sube arrastrando: crea a mano el archivo `.github/workflows/deploy.yml`
(**Add file → Create new file**, escribiendo esa ruta en el nombre) y pega el contenido del que viene en el zip.

Con terminal:
```bash
git init && git add . && git commit -m "Primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/NOMBRE_REPO.git
git push -u origin main
```

### 2. Base de datos en Supabase

1. Supabase → **SQL Editor → New query**.
2. Pega todo `supabase/schema.sql` y pulsa **Run**. (Se puede ejecutar más de una vez sin problema.)
3. **Project Settings → API**: copia la **Project URL** y la **anon public key**.
   La anon key es pública por diseño; la seguridad está en las políticas RLS. Nunca uses la `service_role` en el frontend.

### 3. Login con Google (sin lista de usuarios)

La app solo pide nombre y email a Google. Con eso no hace falta verificación ni añadir usuarios de prueba.

1. console.cloud.google.com → crea un proyecto. No hace falta activar facturación ni la Calendar API.
2. **Google Auth Platform** (o *APIs y servicios → Pantalla de consentimiento de OAuth*):
   - Tipo de usuario: **Externo**. Nombre de la app y tu correo de contacto.
   - **No añadas ningún permiso (scope) extra**. Los básicos (`openid`, `email`, `profile`) ya vienen.
3. **Público (Audience) → Publicar aplicación → Confirmar.** Es lo que evita la lista de usuarios de prueba:
   en estado *Testing* solo entran los correos que añadas a mano; en *Producción* entra cualquiera.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   En *URI de redireccionamiento autorizados* pega `https://TU-PROYECTO.supabase.co/auth/v1/callback`
   (Supabase te la muestra ya copiable en el paso siguiente). Copia el **Client ID** y el **Client Secret**.
5. Supabase → **Authentication → Sign In / Providers → Google**: actívalo y pega Client ID y Secret.
6. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://TU_USUARIO.github.io/NOMBRE_REPO/`
   - **Redirect URLs**: la misma URL (y `http://localhost:5173/` si pruebas en local).

El login por **enlace de email** funciona sin configurar nada más, pero la cuenta gratuita de Supabase envía muy pocos emails por hora:
úsalo como alternativa, no como vía principal.

### 4. Desplegar en GitHub Pages

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Actions → Deploy a GitHub Pages → Run workflow**. En 1–2 minutos estará en `https://TU_USUARIO.github.io/NOMBRE_REPO/`.

### 5. Usarla

1. Entra con Google.
2. **Traer tu Google Calendar**: en calendar.google.com → ⚙ **Configuración → Importar y exportar → Exportar**.
   Descomprime el zip que se descarga y, en la app, pulsa **Importar .ics** y elige el archivo (uno por calendario).
   Puedes repetirlo cuando quieras: los eventos ya importados se actualizan, no se duplican.
3. Los eventos importados son **privados** por defecto. En la barra lateral, **Privacidad rápida** los comparte como "Ocupado" o con detalles.
4. **Invitar amigos**: barra lateral → **Invitar con mi enlace** → mándalo por WhatsApp. Tu amigo lo abre, entra (Google o email) y pulsa
   *Enviar solicitud*. A ti te aparece en **Solicitudes** y la aceptas.
   También puedes añadir a alguien que ya esté registrado escribiendo su email.

### Probar en local (opcional)

```bash
cp .env.example .env.local      # rellena los dos valores
npm install
npm run dev                     # http://localhost:5173
```

---

## Opcional y avanzado: botón "Conectar Google Calendar"

Existe un modo que sincroniza directamente con la API de Google, pero Google trata el permiso de Calendar como *sensible*:
mientras no pases su verificación, **solo pueden usarlo los correos de la lista de usuarios de prueba (máx. 100)**. Por eso viene desactivado.
Si aun así lo quieres: activa la **Google Calendar API** en tu proyecto, añade el scope `.../auth/calendar.readonly` en *Acceso a los datos*,
añade los usuarios de prueba, y en GitHub → **Settings → Secrets and variables → Actions → Variables** crea `VITE_GOOGLE_CALENDAR` = `true`.
El login normal de la app sigue sin pedir ese permiso.

## Limitaciones

- Importar `.ics` es manual (no se actualiza solo). La sincronización automática exigiría el permiso de Calendar de arriba.
- Rango importado: de 3 meses atrás a 1 año adelante. Reglas de repetición muy raras (`BYSETPOS`, cada hora…) se importan como un solo evento.
- Los huecos libres ignoran los eventos de todo el día.
- Si abres el enlace de invitación en un navegador y el email de acceso en otro, el enlace se pierde: pide que te lo reenvíen.

## Estructura

```
supabase/schema.sql          tablas, RLS y funciones (privacidad, invitaciones)
src/lib/ics.ts               lector de archivos .ics
src/lib/importer.ts          importación a Supabase
src/lib/invite.ts            enlaces de invitación
src/lib/google.ts            login con Google (+ Calendar opcional)
src/lib/free.ts              huecos libres
src/hooks/                   eventos del rango visible y amistades
src/components/              vistas mes/semana, modal, panel de amigos
.github/workflows/deploy.yml build y despliegue a GitHub Pages
```
