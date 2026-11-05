import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { signInGoogle } from '../lib/google';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const magic = async (e: FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    setMsg(error ? error.message : 'Te hemos enviado un enlace de acceso al correo.');
  };

  return (
    <div className="center">
      <div className="auth-card">
        <h1>Calendario</h1>
        <p className="muted">Tu agenda y la de tus amigos, en un solo sitio.</p>
        <button className="btn primary big" onClick={() => void signInGoogle()}>
          Entrar con Google (y conectar Google Calendar)
        </button>
        <div className="or">o</div>
        <form onSubmit={magic}>
          <input type="email" required placeholder="tu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" type="submit">
            Enviarme enlace de acceso
          </button>
        </form>
        {msg && <p className="muted small">{msg}</p>}
      </div>
    </div>
  );
}
