import { supabase } from './supabase';
import { addDays } from './dates';
import { parseIcs } from './ics';

/**
 * Importa un archivo .ics (Google Calendar, Apple, Outlook…): de hace 3 meses a 1 año vista.
 * Usa la columna google_event_id como identificador externo ("ics:UID:inicio"), así que
 * importar el mismo archivo dos veces actualiza los eventos en lugar de duplicarlos.
 */
export async function importIcsFile(userId: string, file: File): Promise<number> {
  if (file.size > 15 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 15 MB).');
  const text = await file.text();
  const events = parseIcs(text, addDays(new Date(), -90), addDays(new Date(), 365));
  if (!events.length) {
    throw new Error('No he encontrado eventos en ese archivo, o están fuera del rango (3 meses atrás a 1 año adelante).');
  }

  const seen = new Set<string>();
  const rows = events.flatMap((e) => {
    const id = `ics:${e.uid}:${e.start.getTime()}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [
      {
        owner: userId,
        google_event_id: id,
        title: e.title,
        description: e.description,
        start_at: e.start.toISOString(),
        end_at: e.end.toISOString(),
        all_day: e.allDay,
      },
    ];
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from('events')
      .upsert(rows.slice(i, i + 500), { onConflict: 'owner,google_event_id' });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}
