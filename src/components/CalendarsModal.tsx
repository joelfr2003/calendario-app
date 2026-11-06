import { useRef, useState } from 'react';
import { EVENT_COLORS } from '../lib/types';
import type { Cal } from '../lib/types';
import type { useCalendars } from '../hooks/useCalendars';

interface Props {
  api: ReturnType<typeof useCalendars>;
  friends: { id: string; name: string }[];
  onError: (m: string) => void;
  onImport: (calendarId: string, file: File) => Promise<void>;
  onExport: (calendarId: string) => Promise<void>;
  onClose: () => void;
}

export default function CalendarsModal({ api, friends, onError, onImport, onExport, onClose }: Props) {
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef('');
  const run = (p: Promise<void>) => p.catch((e: Error) => onError(e.message));

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Mis calendarios</h3>
        <div className="frow">
          <span className="lbl">Compartir todos</span>
          <select value="" onChange={(e) => e.target.value && void run(api.shareAll(e.target.value as 'all' | 'none'))}>
            <option value="">Elegir…</option>
            <option value="all">Con todos mis amigos</option>
            <option value="none">Con nadie (todos privados)</option>
          </select>
        </div>

        {api.cals.map((c) => {
          const sel = api.shares[c.id] ?? [];
          return (
            <div className="calcard" key={c.id}>
              <div className="row">
                <i className="dot big" style={{ background: c.color }} />
                <input
                  style={{ flex: 1 }}
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) void run(api.update(c.id, { name: v }));
                  }}
                />
                <button
                  className="btn small danger"
                  disabled={api.cals.length < 2}
                  title={api.cals.length < 2 ? 'Debe quedar al menos un calendario' : ''}
                  onClick={() => confirm(`¿Eliminar “${c.name}” y todos sus eventos?`) && void run(api.remove(c.id))}
                >
                  Eliminar
                </button>
              </div>
              <div className="row">
                {EVENT_COLORS.map((col) => (
                  <button
                    type="button"
                    key={col}
                    className={'swatch' + (col === c.color ? ' on' : '')}
                    style={{ background: col }}
                    onClick={() => void run(api.update(c.id, { color: col }))}
                    aria-label={`Color ${col}`}
                  />
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    pending.current = c.id;
                    fileRef.current?.click();
                  }}
                >
                  Importar .ics en este calendario
                </button>
                <button type="button" className="btn small" onClick={() => void run(onExport(c.id))}>
                  Exportar .ics
                </button>
              </div>
              <div className="frow">
                <span className="lbl">Compartido</span>
                <select value={c.share} onChange={(e) => void run(api.setShare(c.id, e.target.value as Cal['share'], sel))}>
                  <option value="none">Privado</option>
                  <option value="all">Con todos mis amigos</option>
                  <option value="some">Solo con algunos</option>
                </select>
              </div>
              {c.share === 'some' &&
                (friends.length === 0 ? (
                  <p className="muted small">Aún no tienes amigos para elegir.</p>
                ) : (
                  <div className="fcol">
                    {friends.map((f) => (
                      <label key={f.id} className="chk">
                        <input
                          type="checkbox"
                          checked={sel.includes(f.id)}
                          onChange={() =>
                            void run(api.setShare(c.id, 'some', sel.includes(f.id) ? sel.filter((x) => x !== f.id) : [...sel, f.id]))
                          }
                        />
                        {f.name}
                      </label>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}

        <input
          ref={fileRef}
          type="file"
          accept=".ics,text/calendar"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            const id = pending.current;
            e.target.value = '';
            if (f && id) void run(onImport(id, f));
          }}
        />
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(api.create(name, EVENT_COLORS[api.cals.length % EVENT_COLORS.length])).then(() => setName(''));
          }}
        >
          <input style={{ flex: 1 }} placeholder="Nuevo calendario (p. ej. Trabajo)" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn primary" type="submit">
            Crear
          </button>
        </form>
        <div className="row end">
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
