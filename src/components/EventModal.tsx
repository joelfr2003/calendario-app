import { FormEvent, useState } from 'react';
import { addDays, toDateInput, toLocalInput } from '../lib/dates';
import { EVENT_COLORS, NewEvent, Visibility } from '../lib/types';

interface Props {
  initial: NewEvent;
  readOnly: boolean;
  ownerName?: string;
  onSave: (ev: NewEvent & { title: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export default function EventModal({ initial, readOnly, ownerName, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [color, setColor] = useState(initial.color ?? EVENT_COLORS[0]);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility ?? 'private');
  const [start, setStart] = useState(() => {
    const d = new Date(initial.start_at);
    return initial.all_day ? toDateInput(d) : toLocalInput(d);
  });
  const [end, setEnd] = useState(() => {
    const d = new Date(initial.end_at);
    // en "todo el día" guardamos el final exclusivo; en el formulario mostramos el último día
    return initial.all_day ? toDateInput(addDays(d, -1)) : toLocalInput(d);
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const toggleAllDay = (v: boolean) => {
    setAllDay(v);
    if (v) {
      setStart(start.slice(0, 10));
      setEnd(end.slice(0, 10));
    } else {
      setStart(`${start.slice(0, 10)}T09:00`);
      setEnd(`${end.slice(0, 10)}T10:00`);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = allDay ? new Date(`${start}T00:00:00`) : new Date(start);
    const en = allDay ? addDays(new Date(`${end}T00:00:00`), 1) : new Date(end);
    if (!(en > s)) {
      setErr('El final debe ser posterior al inicio.');
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...initial,
        title: title.trim() || '(Sin título)',
        description: description || null,
        all_day: allDay,
        color,
        visibility,
        start_at: s.toISOString(),
        end_at: en.toISOString(),
      });
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  const del = async () => {
    if (!initial.id || !confirm('¿Eliminar este evento?')) return;
    setBusy(true);
    try {
      await onDelete(initial.id);
      onClose();
    } catch (ex) {
      setErr((ex as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        {readOnly && <div className="muted small">Evento de {ownerName ?? 'un amigo'} (solo lectura)</div>}
        <input
          className="title-input"
          autoFocus
          placeholder="Añade un título"
          value={title}
          disabled={readOnly}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label className="row">
          <input type="checkbox" checked={allDay} disabled={readOnly} onChange={(e) => toggleAllDay(e.target.checked)} />
          Todo el día
        </label>
        <div className="row">
          <input type={allDay ? 'date' : 'datetime-local'} value={start} disabled={readOnly} onChange={(e) => setStart(e.target.value)} required />
          <span>→</span>
          <input type={allDay ? 'date' : 'datetime-local'} value={end} disabled={readOnly} onChange={(e) => setEnd(e.target.value)} required />
        </div>
        {(!readOnly || description) && (
          <textarea
            placeholder="Descripción"
            rows={3}
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
        {!readOnly && (
          <>
            <div className="row">
              {EVENT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={'swatch' + (c === color ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <label className="col">
              <span className="small muted">¿Quién puede verlo?</span>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
                <option value="private">Solo yo</option>
                <option value="busy">Amigos: solo ven “Ocupado”</option>
                <option value="friends">Amigos: ven título y detalles</option>
              </select>
            </label>
          </>
        )}
        {err && <div className="error">{err}</div>}
        <div className="row end">
          {!readOnly && initial.id && (
            <button type="button" className="btn danger" onClick={() => void del()} disabled={busy}>
              Eliminar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button type="submit" className="btn primary" disabled={busy}>
              Guardar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
