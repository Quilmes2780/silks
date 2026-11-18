import { GLOSSARY, type GlossaryEntry } from '../glossary';

/** Hilfe: kurzer Leitfaden und Glossar der Fachbegriffe. */
export function HelpScreen() {
  const groups: GlossaryEntry['group'][] = ['Rennen', 'Kennzahlen', 'Stall', 'Zucht', 'Geld'];
  return (
    <div className="col" style={{ gap: 16 }}>
      <h1>Hilfe &amp; Glossar</h1>
      <div className="card">
        <h3>So läuft eine Woche</h3>
        <ol className="help-steps">
          <li><b>Pferde vorbereiten:</b> Im Pferdeprofil legst du den Trainingsplan fest. Achte auf Fitness, Frische und Verletzungen.</li>
          <li><b>Rennen nennen:</b> Im Rennkalender stehen die Rennen, für die deine Pferde startberechtigt sind. Nenne vor dem Nennschluss, wähle Jockey und Taktik.</li>
          <li><b>Woche abschließen:</b> Der Knopf oben rechts (oder Strg+Enter) spielt Training, Renntag und Markt ab.</li>
          <li><b>Auswerten:</b> Nach dem Rennen zeigen Ergebnis, Speed Figure und Sectionals, was gut lief und was nicht.</li>
          <li><b>Stall führen:</b> Personal, Anlage, Markt und Gestüt entscheiden langfristig, ob sich dein Stall trägt.</li>
        </ol>
        <p className="small muted">Tipp: Begriffe mit gepunkteter Unterstreichung erklären sich, wenn du mit der Maus darüber fährst.</p>
      </div>
      {groups.map((grp) => (
        <div className="card" key={grp}>
          <h3>{grp}</h3>
          <dl className="glossary">
            {Object.entries(GLOSSARY)
              .filter(([, e]) => e.group === grp)
              .map(([id, e]) => (
                <div key={id} id={`term-${id}`}>
                  <dt>{e.term}</dt>
                  <dd>
                    {e.short}
                    {e.long && <span className="muted"> {e.long}</span>}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
