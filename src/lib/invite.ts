// Enlace de invitación: https://tu-app/?add=<id-del-usuario>
// Al abrirlo se guarda el id (el login puede redirigir y perder la URL) y, ya dentro,
// la app pregunta si quieres enviar la solicitud de amistad.

const KEY = 'pending_invite';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Llamar una vez al arrancar, antes de pintar la app */
export function captureInvite() {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('add');
    if (!id) return;
    if (UUID.test(id)) localStorage.setItem(KEY, id);
    url.searchParams.delete('add');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* sin localStorage o URL rara: se ignora */
  }
}

export function getPendingInvite(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && UUID.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
}

export const inviteLink = (userId: string) => `${window.location.origin}${import.meta.env.BASE_URL}?add=${userId}`;
